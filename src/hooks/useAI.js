import { useRef, useCallback, useSyncExternalStore } from "react";
import { createAIRouter } from "../services/ai/aiRouter";

const CONVERSATIONS_KEY = "boojy-ai-conversations";
const MAX_PERSISTED = 20;

/**
 * Lightweight store that avoids re-rendering the entire tree on every streaming chunk.
 * Components subscribe to specific slices via getMessages/isStreaming/getError.
 * BoojyNotes itself only passes the hook object down — it doesn't read conversations state.
 */

let _conversations = {};
try {
  _conversations = JSON.parse(localStorage.getItem(CONVERSATIONS_KEY)) || {};
} catch {
  _conversations = {};
}

const _listeners = new Set();
function emitChange() {
  for (const fn of _listeners) fn();
}

function getSnapshot() {
  return _conversations;
}

function subscribe(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function setConversations(updater) {
  const next = typeof updater === "function" ? updater(_conversations) : updater;
  if (next === _conversations) return;
  _conversations = next;
  emitChange();
}

// Debounced persistence — only write after 500ms of inactivity
let _saveTimer = null;
function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    const entries = Object.entries(_conversations);
    const toSave =
      entries.length > MAX_PERSISTED
        ? Object.fromEntries(entries.slice(-MAX_PERSISTED))
        : _conversations;
    try {
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(toSave));
    } catch {
      // storage full — ignore
    }
  }, 500);
}

export function useAI() {
  // Subscribe to the external store — but BoojyNotes doesn't destructure conversations,
  // so it won't re-render. Only children that call getMessages() etc. will.
  const conversations = useSyncExternalStore(subscribe, getSnapshot);
  const abortRefs = useRef(new Map());

  const getMessages = useCallback(
    (tabId) => {
      return _conversations[tabId]?.messages || [];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- conversations dep forces re-creation when store changes
    [conversations],
  );

  const isStreaming = useCallback(
    (tabId) => {
      return _conversations[tabId]?.isStreaming || false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- conversations dep forces re-creation when store changes
    [conversations],
  );

  const getError = useCallback(
    (tabId) => {
      return _conversations[tabId]?.error || null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- conversations dep forces re-creation when store changes
    [conversations],
  );

  const sendMessage = useCallback(async (tabId, userContent, aiConfig, noteContext) => {
    const userMsg = { role: "user", content: userContent, timestamp: Date.now() };
    const assistantMsg = { role: "assistant", content: "", timestamp: Date.now() };

    // Capture previous messages before updating state
    const prevConvo = _conversations[tabId] || { messages: [] };
    const previousMessages = prevConvo.messages.map((m) => ({ role: m.role, content: m.content }));

    setConversations((prev) => {
      const convo = prev[tabId] || { messages: [], isStreaming: false };
      return {
        ...prev,
        [tabId]: {
          ...convo,
          messages: [...convo.messages, userMsg, assistantMsg],
          isStreaming: true,
          error: null,
        },
      };
    });
    scheduleSave();

    const abort = new AbortController();
    abortRefs.current.set(tabId, abort);

    try {
      const router = createAIRouter(aiConfig);

      const allMessages = [];
      if (noteContext) {
        allMessages.push({
          role: "user",
          content: `[Context — current note]\n\n${noteContext}\n\n---\n\nPlease use the above note as context for our conversation.`,
        });
        allMessages.push({
          role: "assistant",
          content: "I've read your note and will use it as context. How can I help you with it?",
        });
      }

      for (const m of previousMessages) {
        allMessages.push(m);
      }
      allMessages.push({ role: "user", content: userContent });

      let fullResponse = "";
      for await (const chunk of router.chat(allMessages, { signal: abort.signal })) {
        fullResponse += chunk;
        setConversations((prev) => {
          const convo = prev[tabId];
          if (!convo) return prev;
          const msgs = [...convo.messages];
          msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: fullResponse };
          return { ...prev, [tabId]: { ...convo, messages: msgs } };
        });
      }

      setConversations((prev) => {
        const convo = prev[tabId];
        if (!convo) return prev;
        return { ...prev, [tabId]: { ...convo, isStreaming: false } };
      });
      scheduleSave();
    } catch (err) {
      if (err.name === "AbortError") {
        setConversations((prev) => {
          const convo = prev[tabId];
          if (!convo) return prev;
          return { ...prev, [tabId]: { ...convo, isStreaming: false } };
        });
        scheduleSave();
        return;
      }
      setConversations((prev) => {
        const convo = prev[tabId];
        if (!convo) return prev;
        const msgs = convo.messages.filter(
          (m, i) => !(i === convo.messages.length - 1 && m.role === "assistant" && !m.content),
        );
        return {
          ...prev,
          [tabId]: { ...convo, messages: msgs, isStreaming: false, error: err.message },
        };
      });
      scheduleSave();
    } finally {
      abortRefs.current.delete(tabId);
    }
  }, []);

  const cancelStreaming = useCallback((tabId) => {
    const abort = abortRefs.current.get(tabId);
    if (abort) abort.abort();
  }, []);

  const clearConversation = useCallback((tabId) => {
    setConversations((prev) => {
      const next = { ...prev };
      delete next[tabId];
      return next;
    });
    scheduleSave();
  }, []);

  return {
    getMessages,
    isStreaming,
    getError,
    sendMessage,
    cancelStreaming,
    clearConversation,
  };
}
