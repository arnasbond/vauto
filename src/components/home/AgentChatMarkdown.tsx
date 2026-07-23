"use client";

import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/cn";

/**
 * Renders assistant chat text as Markdown (## headings, **bold**, bullets)
 * while preserving line breaks via white-space: pre-wrap on the container.
 */
export function AgentChatMarkdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const source = text.trim();
  if (!source) return null;

  return (
    <div className={cn("agent-chat-markdown", className)}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h3 className="agent-md-h">{children}</h3>,
          h2: ({ children }) => <h3 className="agent-md-h">{children}</h3>,
          h3: ({ children }) => <h4 className="agent-md-h agent-md-h-sm">{children}</h4>,
          p: ({ children }) => <p className="agent-md-p">{children}</p>,
          ul: ({ children }) => <ul className="agent-md-ul">{children}</ul>,
          ol: ({ children }) => <ol className="agent-md-ol">{children}</ol>,
          li: ({ children }) => <li className="agent-md-li">{children}</li>,
          strong: ({ children }) => <strong className="agent-md-strong">{children}</strong>,
          em: ({ children }) => <em className="agent-md-em">{children}</em>,
          a: ({ href, children }) => (
            <a
              href={href}
              className="agent-md-a"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          code: ({ children }) => <code className="agent-md-code">{children}</code>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
