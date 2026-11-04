"use client";

import { cn } from "cn";
import type { Components } from "react-markdown";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Strip unsafe URL schemes (javascript:, data:, etc.).
 * Composes with react-markdown’s defaultUrlTransform; never enables raw HTML.
 */
export function sanitizeMarkdownUrl(url: string): string {
  const fromDefault = defaultUrlTransform(url);
  if (!fromDefault) return "";
  const trimmed = fromDefault.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed, "https://fieldkeel.invalid");
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return "";
    }
    return trimmed;
  } catch {
    return "";
  }
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h3 className="mt-3 mb-1.5 text-base font-semibold tracking-tight text-card-foreground first:mt-0">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h3 className="mt-3 mb-1.5 text-base font-semibold tracking-tight text-card-foreground first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mt-2.5 mb-1 text-sm font-semibold tracking-tight text-card-foreground first:mt-0">
      {children}
    </h4>
  ),
  h4: ({ children }) => (
    <h4 className="mt-2 mb-1 text-sm font-semibold text-card-foreground first:mt-0">
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 className="mt-2 mb-1 text-sm font-medium text-card-foreground first:mt-0">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="mt-2 mb-1 text-sm font-medium text-muted-foreground first:mt-0">
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <p className="mb-2.5 text-sm leading-relaxed last:mb-0">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-card-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-2.5 list-disc space-y-1 pl-5 text-sm leading-relaxed last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2.5 list-decimal space-y-1 pl-5 text-sm leading-relaxed last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-0.5 marker:text-muted-foreground">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mb-2.5 border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-muted-foreground last:mb-0">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => {
    const safe = href ? sanitizeMarkdownUrl(href) : "";
    if (!safe) {
      return <span className="text-foreground">{children}</span>;
    }
    const external = /^https?:/i.test(safe);
    return (
      <a
        href={safe}
        className="font-medium text-primary underline-offset-2 hover:underline"
        {...(external
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
      >
        {children}
      </a>
    );
  },
  code: ({ className, children }) => {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return <code className={cn("font-mono text-[12px]", className)}>{children}</code>;
    }
    return (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-2.5 overflow-x-auto rounded-md border border-border bg-muted/60 p-2.5 font-mono text-[12px] leading-relaxed last:mb-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-2.5 max-w-full overflow-x-auto last:mb-0 [-webkit-overflow-scrolling:touch]">
      <table className="w-full max-w-full table-fixed border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border bg-muted/40">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-border/70 last:border-0">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="break-words px-2 py-1.5 text-xs font-semibold text-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="break-words px-2 py-1.5 align-top text-sm text-card-foreground">
      {children}
    </td>
  ),
  hr: () => <hr className="my-3 border-border" />,
};

type AiMarkdownProps = {
  content: string;
  className?: string;
};

/**
 * Renders assistant Markdown safely (no raw HTML). Suitable for complete or
 * incomplete streaming-style content updates.
 */
export function AiMarkdown({ content, className }: AiMarkdownProps) {
  return (
    <div
      className={cn(
        "ai-markdown min-w-0 break-words text-sm leading-relaxed text-card-foreground [&_li>p]:mb-1 [&_li>p]:last:mb-0 [&_li>ul]:mt-1 [&_li>ol]:mt-1",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={sanitizeMarkdownUrl}
        components={markdownComponents}
        // Never enable rehype-raw — untrusted HTML must not render.
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
