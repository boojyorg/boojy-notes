import { useState } from "react";
import type { Block } from "../types/notes";

interface FrontmatterBlockProps {
  block: Block;
}

export default function FrontmatterBlock({ block }: FrontmatterBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const text = block.text || "";
  const propCount = text.split("\n").filter((l) => l.includes(":")).length;

  return (
    <div className="frontmatter-block">
      <div className="frontmatter-header" onClick={() => setExpanded(!expanded)}>
        <span>
          Frontmatter ({propCount} {propCount === 1 ? "property" : "properties"})
        </span>
        <span
          style={{
            fontSize: 10,
            transition: "transform 0.15s",
            transform: expanded ? "rotate(90deg)" : "rotate(0)",
          }}
        >
          ▶
        </span>
      </div>
      {expanded && <div className="frontmatter-body">{text}</div>}
    </div>
  );
}
