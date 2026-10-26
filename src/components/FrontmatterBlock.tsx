import { useEffect, useState } from "react";
import { currentEnterMs, prefersReducedMotion } from "../tokens/motion";
import type { Block } from "../types/notes";

interface FrontmatterBlockProps {
  block: Block;
}

export default function FrontmatterBlock({ block }: FrontmatterBlockProps) {
  const [expanded, setExpanded] = useState(false);
  // The body stays mounted while it shrinks away, and only then: closed, its
  // text is not the note's, for Find or anything else that walks the editor.
  const [closing, setClosing] = useState(false);
  // Unmounted by the clock, not `transitionend`, which never comes when the
  // transition is cut short (a window resize turns transitions off).
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => setClosing(false), currentEnterMs());
    return () => clearTimeout(timer);
  }, [closing]);

  const text = block.text || "";
  const propCount = text.split("\n").filter((l) => l.includes(":")).length;

  const toggle = () => {
    setClosing(expanded && !prefersReducedMotion());
    setExpanded(!expanded);
  };

  return (
    <div className="frontmatter-block">
      <div className="frontmatter-header" onClick={toggle}>
        <span>
          Frontmatter ({propCount} {propCount === 1 ? "property" : "properties"})
        </span>
        <span
          style={{
            fontSize: 10,
            transition: "transform var(--motion-enter) var(--ease-enter)",
            transform: expanded ? "rotate(90deg)" : "rotate(0)",
          }}
        >
          ▶
        </span>
      </div>
      {(expanded || closing) && (
        <div className="frontmatter-reveal" data-open={expanded || undefined} inert={!expanded}>
          <div className="frontmatter-clip">
            <div className="frontmatter-body">{text}</div>
          </div>
        </div>
      )}
    </div>
  );
}
