"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders streaming markdown from the AI routes. Partial markdown is normal
 * here — a code fence may be open for a few hundred milliseconds — so the
 * renderer must tolerate half-finished input rather than throw.
 */
export function AiMarkdown({
  content,
  isStreaming = false,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none
                 prose-pre:bg-gray-900 prose-pre:text-gray-100
                 prose-code:text-pink-600 dark:prose-code:text-pink-400
                 prose-headings:mt-4 prose-headings:mb-2"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      {isStreaming && (
        <span
          className="inline-block w-2 h-4 ml-0.5 bg-current animate-pulse align-middle"
          aria-label="generating"
        />
      )}
    </div>
  );
}
