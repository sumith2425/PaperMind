import { useState, Children, isValidElement, cloneElement, type ReactNode, type ReactElement } from "react";
import { Bot, User, ArrowUpRight, Check, Copy } from "lucide-react";
import { RouteBadge } from "./RouteBadge";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatSource, Route } from "@/lib/api";

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  route?: Route;
  sources?: ChatSource[];
  pending?: boolean;
  error?: boolean;
}

interface MessageBubbleProps {
  message: UIMessage;
}

const CITE_RE = /(\[(?:\d+\s*,\s*)*\d+\])/g;
const CITE_MATCH = /^\[((?:\d+\s*,\s*)*\d+)\]$/;

function renderCitation(raw: string, sources: ChatSource[], key: string | number): ReactNode {
  const m = raw.match(CITE_MATCH);
  if (!m || sources.length === 0) return raw;
  const nums = m[1].split(/\s*,\s*/).map((n) => parseInt(n, 10));
  return (
    <sup key={key} className="ml-0.5 inline-flex gap-0.5">
      {nums.map((n, i) => {
        const src = sources[n - 1];
        if (!src?.url) {
          return (
            <span
              key={i}
              className="text-[0.75em] text-muted-foreground/60 cursor-help transition-colors hover:text-white"
              title={src?.name}
            >
              [{n}]
            </span>
          );
        }
        return (
          <a
            key={i}
            href={src.url}
            target="_blank"
            rel="noreferrer"
            title={src.name}
            className="text-[0.75em] font-bold text-primary hover:text-white transition-colors"
          >
            [{n}]
          </a>
        );
      })}
    </sup>
  );
}

function processCitations(children: ReactNode, sources: ChatSource[]): ReactNode {
  return Children.map(children, (child, idx) => {
    if (typeof child === "string") {
      const parts = child.split(CITE_RE);
      if (parts.length === 1) return child;
      return parts.map((p, i) =>
        CITE_MATCH.test(p) ? renderCitation(p, sources, `${idx}-${i}`) : p,
      );
    }
    if (isValidElement(child)) {
      const el = child as ReactElement<{ children?: ReactNode }>;
      if (el.props && "children" in el.props) {
        return cloneElement(el, {
          children: processCitations(el.props.children, sources),
        } as Partial<typeof el.props>);
      }
    }
    return child;
  });
}

function CodeBlock({ content, lang }: { content: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="my-5 overflow-hidden rounded-xl border border-white/10 bg-black/60 shadow-2xl relative group">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-white/5 backdrop-blur-md">
        <span className="text-[10px] font-mono font-medium text-white/50 uppercase tracking-widest">
          {lang || "text"}
        </span>
        <button
          onClick={copy}
          className="text-white/40 hover:text-white transition-colors p-1.5 rounded-md hover:bg-white/10"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] font-mono leading-relaxed text-white/90">
        <code>{content}</code>
      </pre>
    </div>
  );
}

function MarkdownBody({ content, sources }: { content: string; sources: ChatSource[] }) {
  return (
    <div className="space-y-3 text-sm md:text-[15px] leading-relaxed text-foreground/90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="leading-relaxed">{processCitations(children, sources)}</p>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed marker:text-primary/70">
              {processCitations(children, sources)}
            </li>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-6 space-y-1.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-6 space-y-1.5">{children}</ol>
          ),
          h1: ({ children }) => (
            <h1 className="text-xl font-display font-semibold mt-4 mb-2 text-foreground">
              {processCitations(children, sources)}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-display font-semibold mt-4 mb-2 text-foreground">
              {processCitations(children, sources)}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-display font-semibold mt-3 mb-1.5 text-foreground">
              {processCitations(children, sources)}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-[15px] font-semibold mt-3 mb-1 text-foreground">
              {processCitations(children, sources)}
            </h4>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {processCitations(children, sources)}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground/95">
              {processCitations(children, sources)}
            </em>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary transition-colors"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/40 pl-4 italic text-foreground/80 my-2">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-white/10" />,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-white/5">{children}</thead>,
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold text-foreground border-b border-white/10">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b border-white/5">
              {processCitations(children, sources)}
            </td>
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }) => {
            const isBlock = /language-/.test(className || "");
            const text = String(children ?? "").replace(/\n$/, "");
            if (isBlock) {
              const lang = className?.replace(/^language-/, "");
              return <CodeBlock content={text} lang={lang} />;
            }
            return (
              <code
                className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[0.85em] font-mono text-foreground"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-4 w-full group ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-xl border backdrop-blur-md ${
          isUser
            ? "bg-white/5 text-foreground border-white/10"
            : "bg-white/10 text-primary border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
        }`}
      >
        {isUser ? (
          <User className="h-5 w-5 opacity-80" />
        ) : (
          <Bot className="h-5 w-5 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
        )}
      </div>

      <div className={`flex flex-col min-w-0 max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
        {!isUser && (
          <div className="flex items-center gap-3 mb-2 px-1">
            <span className="text-sm font-display font-semibold tracking-wide text-foreground">
              PaperMind
            </span>
            {message.route && (
              <RouteBadge route={message.route} sources={message.sources ?? []} />
            )}
          </div>
        )}

        <div
          className={`relative w-full ${
            isUser
              ? "bg-white/10 rounded-3xl rounded-tr-sm px-5 py-4 border border-white/10 text-foreground backdrop-blur-md shadow-lg"
              : "text-foreground px-1"
          }`}
        >
          {message.error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-sm backdrop-blur-sm">
              <div className="font-semibold mb-1 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-destructive animate-pulse"></span>
                Error Processing Request
              </div>
              <p className="opacity-90">{message.content}</p>
            </div>
          ) : message.pending && !message.content ? (
            <div className="py-2 px-1 flex gap-2 items-center">
              {[0, 0.2, 0.4].map((delay, i) => (
                <motion.div
                  key={i}
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, repeat: Infinity, delay }}
                  className="h-2 w-2 rounded-full bg-primary"
                />
              ))}
            </div>
          ) : isUser ? (
            <p className="whitespace-pre-wrap leading-relaxed text-sm md:text-[15px] text-foreground font-medium">
              {message.content}
            </p>
          ) : (
            <div className="space-y-4">
              <MarkdownBody content={message.content} sources={message.sources ?? []} />

              <AnimatePresence>
                {!isUser && (message.sources?.length ?? 0) > 0 && !message.pending && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    className="pt-2 overflow-hidden"
                  >
                    <SourcesList sources={message.sources!} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SourcesList({ sources }: { sources: ChatSource[] }) {
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md overflow-hidden shadow-lg">
      <div className="px-4 py-2.5 border-b border-white/5 bg-white/5">
        <p className="text-[10px] font-mono font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-white/30"></span>
          Sources Referenced
        </p>
      </div>
      <div className="p-2 space-y-1">
        {sources.map((s, i) => {
          const n = i + 1;
          const isWeb = s.kind !== "document";
          return (
            <div
              key={i}
              className="group flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-all duration-300"
            >
              <span className="shrink-0 font-mono text-[10px] font-bold text-muted-foreground mt-0.5 w-5 group-hover:text-primary transition-colors">
                [{n}]
              </span>
              <div className="min-w-0 flex-1">
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 break-all text-[13px] font-medium text-foreground/80 hover:text-white transition-colors"
                  >
                    <span className="line-clamp-1">{s.name}</span>
                    {isWeb && (
                      <ArrowUpRight className="h-3 w-3 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity text-sky-400" />
                    )}
                  </a>
                ) : (
                  <span className="break-all text-[13px] font-medium text-foreground/80 line-clamp-1">
                    {s.name}
                  </span>
                )}
                {s.url && (
                  <p className="truncate text-[10px] font-mono text-muted-foreground mt-1 opacity-60">
                    {s.url}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
