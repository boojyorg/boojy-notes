import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import { getTerminalTheme } from "../../constants/terminalTheme";
import { useTheme } from "../../hooks/useTheme";

export default function TerminalInstance({
  terminalId,
  isVisible,
  chromeBg,
  xtermInstances,
  onExited,
}) {
  const { theme } = useTheme();
  const containerRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const ptyIdRef = useRef(null);
  const bufferedData = useRef([]);
  const exitedRef = useRef(false);
  const unsubDataRef = useRef(null);
  const unsubExitRef = useRef(null);

  const api = window.electronAPI?.terminal;

  // Create xterm + PTY on mount
  useEffect(() => {
    if (!containerRef.current || !api) return;

    const termTheme = getTerminalTheme(theme);
    const term = new Terminal({
      theme: termTheme,
      fontFamily: "'SF Mono', 'Fira Code', 'Menlo', monospace",
      fontSize: 11,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "bar",
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      window.open(uri, "_blank");
    });

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Register in shared map
    xtermInstances.current.set(terminalId, { terminal: term, fitAddon, searchAddon });

    // Fit after open
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {}
    });

    // Subscribe to PTY data (filtered by our ID)
    // Buffer data arriving before api.create() resolves (race condition)
    unsubDataRef.current = api.onData(({ id, data }) => {
      if (ptyIdRef.current === null) {
        bufferedData.current.push({ id, data });
      } else if (id === ptyIdRef.current) {
        term.write(data);
      }
    });

    // Subscribe to PTY exit
    unsubExitRef.current = api.onExit(({ id, exitCode }) => {
      if (id !== ptyIdRef.current) return;
      exitedRef.current = true;
      term.write(
        `\r\n\x1b[90m[Process exited with code ${exitCode}] Press Enter to restart\x1b[0m`,
      );
      onExited?.(terminalId);
    });

    // Forward xterm input → PTY
    term.onData((data) => {
      if (exitedRef.current) {
        if (data === "\r") {
          exitedRef.current = false;
          ptyIdRef.current = null;
          bufferedData.current = [];
          term.reset();
          spawnPty(fitAddon);
        }
        return;
      }
      if (ptyIdRef.current) api.write(ptyIdRef.current, data);
    });

    // Custom key handler for copy/paste
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "c" && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection());
        return false;
      }
      if (mod && e.key === "v") {
        navigator.clipboard.readText().then((text) => {
          if (text && ptyIdRef.current && !exitedRef.current) {
            api.write(ptyIdRef.current, text);
          }
        });
        return false;
      }
      return true;
    });

    // ResizeObserver for auto-fit
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (!fitAddonRef.current) return;
        try {
          fitAddon.fit();
          const dims = fitAddon.proposeDimensions();
          if (dims && ptyIdRef.current) {
            api.resize(ptyIdRef.current, dims.cols, dims.rows);
          }
        } catch {}
      });
    });
    ro.observe(containerRef.current);

    // Spawn the PTY
    function spawnPty(fa) {
      api
        .create()
        .then((result) => {
          ptyIdRef.current = result.id;
          // Flush any data that arrived before create() resolved
          for (const d of bufferedData.current) {
            if (d.id === result.id) term.write(d.data);
          }
          bufferedData.current = [];
          const dims = fa.proposeDimensions();
          if (dims) api.resize(result.id, dims.cols, dims.rows);
        })
        .catch((err) => {
          term.write(`\x1b[31mFailed to start shell: ${err.message}\x1b[0m\r\n`);
        });
    }
    spawnPty(fitAddon);

    return () => {
      ro.disconnect();
      if (unsubDataRef.current) unsubDataRef.current();
      if (unsubExitRef.current) unsubExitRef.current();
      if (ptyIdRef.current) api.kill(ptyIdRef.current).catch(() => {});
      xtermInstances.current.delete(terminalId);
      term.dispose();
    };
  }, []); // mount once

  // Re-fit + focus when becoming visible (tab switch)
  useEffect(() => {
    if (isVisible && fitAddonRef.current) {
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current.fit();
          const dims = fitAddonRef.current.proposeDimensions();
          if (dims && ptyIdRef.current && api) {
            api.resize(ptyIdRef.current, dims.cols, dims.rows);
          }
        } catch {}
      });
      if (xtermRef.current) xtermRef.current.focus();
    }
  }, [isVisible]);

  // Update theme
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = getTerminalTheme(theme);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: isVisible ? "block" : "none",
        padding: "4px 0 0 0",
      }}
    />
  );
}
