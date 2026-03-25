import { Component } from "react";

export default class BlockErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[BlockErrorBoundary] Block ${this.props.blockId} crashed:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "12px 16px",
            margin: "2px 0",
            borderRadius: 6,
            border: "1.5px dashed var(--boojy-error-danger, #ff6b6b)",
            background: "var(--boojy-error-surface, #26262b)",
            color: "var(--boojy-error-muted, #aaa)",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>This block had an error and couldn&apos;t render.</span>
          {this.props.onDelete && (
            <button
              onClick={this.props.onDelete}
              style={{
                background: "none",
                border: "1px solid var(--boojy-error-muted, #555)",
                color: "var(--boojy-error-text, #ccc)",
                borderRadius: 4,
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Delete block
            </button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
