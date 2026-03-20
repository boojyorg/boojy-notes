import { Component } from "react";
import { Z } from "../constants/zIndex";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });

    // Attempt to flush noteData to localStorage as emergency backup
    try {
      const noteDataRef = this.props.noteDataRef;
      if (noteDataRef?.current) {
        localStorage.setItem("boojy-error-backup", JSON.stringify(noteDataRef.current));
      }
    } catch {
      // Best-effort — don't let this fail too
    }
  }

  render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#1a1a1e",
            color: "#e0e0e0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            zIndex: Z.ERROR_BOUNDARY,
          }}
        >
          <div
            style={{
              maxWidth: 520,
              padding: 32,
              background: "#26262b",
              borderRadius: 12,
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            <h2
              style={{
                margin: "0 0 8px",
                fontSize: 20,
                fontWeight: 600,
                color: "#ff6b6b",
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                margin: "0 0 16px",
                fontSize: 14,
                color: "#aaa",
                lineHeight: 1.5,
              }}
            >
              Boojy Notes encountered an unexpected error. Your notes have been backed up to local
              storage.
            </p>
            <p
              style={{
                margin: "0 0 16px",
                fontSize: 13,
                color: "#ccc",
                fontFamily: "monospace",
                background: "#1a1a1e",
                padding: "8px 12px",
                borderRadius: 6,
                wordBreak: "break-word",
              }}
            >
              {error?.message || "Unknown error"}
            </p>
            <details
              style={{
                marginBottom: 20,
                fontSize: 12,
                color: "#888",
              }}
            >
              <summary style={{ cursor: "pointer", marginBottom: 8 }}>Stack trace</summary>
              <pre
                style={{
                  background: "#1a1a1e",
                  padding: 12,
                  borderRadius: 6,
                  overflow: "auto",
                  maxHeight: 200,
                  fontSize: 11,
                  lineHeight: 1.4,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {error?.stack || "No stack trace available"}
                {errorInfo?.componentStack ? "\n\nComponent stack:" + errorInfo.componentStack : ""}
              </pre>
            </details>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: "8px 20px",
                  background: "#4a6cf7",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                Reload App
              </button>
              <button
                onClick={() => {
                  const text = `${error?.message || "Unknown error"}\n\n${error?.stack || ""}${errorInfo?.componentStack ? "\n\nComponent stack:" + errorInfo.componentStack : ""}`;
                  navigator.clipboard.writeText(text);
                }}
                style={{
                  padding: "8px 20px",
                  background: "#3a3a40",
                  color: "#ccc",
                  border: "1px solid #555",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                Copy Error
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
