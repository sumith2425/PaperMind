import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Github, Trash2, Cpu, FolderOpen, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ChatInput } from "@/components/ChatInput";
import { DocumentPanel } from "@/components/DocumentPanel";
import { MessageBubble, type UIMessage } from "@/components/MessageBubble";
import { AnimatedHero } from "@/components/AnimatedHero";
import { GradientMesh } from "@/components/GradientMesh";
import { getHealth, streamChat, type ChatTurn } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

const STARTERS = [
  "Summarize the paper I uploaded.",
  "What problem does this paper solve, and how?",
  "Explain the key method in plain English.",
  "What's new in AI research this week?",
];

const WELCOME: UIMessage = {
  id: "welcome",
  role: "assistant",
  content: "Hi, I'm PaperMind. Drop a research paper (or any PDF / TXT / MD) on the left and I'll answer questions with page-cited explanations. I can also search the live web or just chat — I pick the right route for each question.",
  route: "direct",
  sources: [],
};

export default function ChatPage() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const health = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 60_000,
    retry: false,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    const history: ChatTurn[] = messages
      .filter((m) => !m.pending && !m.error)
      .map((m) => ({ role: m.role, content: m.content }));

    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const assistantId = crypto.randomUUID();
    const pendingMsg: UIMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      pending: true,
    };

    setMessages((prev) => [...prev, userMsg, pendingMsg]);
    setInput("");
    setIsStreaming(true);

    const updateAssistant = (patch: Partial<UIMessage>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)),
      );
    };

    try {
      await streamChat(trimmed, history, {
        onEvent: (event) => {
          if (event.type === "meta") {
            updateAssistant({
              route: event.route,
              sources: event.sources,
            });
          } else if (event.type === "token") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      pending: false,
                      content: m.content + event.delta,
                    }
                  : m,
              ),
            );
          } else if (event.type === "done") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      pending: false,
                      content: event.answer || m.content,
                    }
                  : m,
              ),
            );
          } else if (event.type === "error") {
            updateAssistant({
              pending: false,
              error: true,
              content: `Something went wrong: ${event.message}`,
            });
          }
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateAssistant({
        pending: false,
        error: true,
        content: `Something went wrong: ${message}`,
      });
    } finally {
      setIsStreaming(false);
    }
  }

  function reset() {
    setMessages([]);
  }

  return (
    <div className="flex h-[100dvh] w-full bg-background text-foreground overflow-hidden font-sans selection:bg-primary/20 relative">
      <GradientMesh />

      {/* Desktop Sidebar */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0, x: -20 }}
            animate={{ width: 320, opacity: 1, x: 0 }}
            exit={{ width: 0, opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="hidden shrink-0 border-r border-white/5 bg-black/40 backdrop-blur-3xl md:flex md:flex-col shadow-[4px_0_24px_rgba(0,0,0,0.5)] z-20"
          >
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4 shrink-0">
              <div className="flex items-center gap-3 group cursor-pointer">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-primary border border-white/10 group-hover:bg-white/10 group-hover:scale-105 transition-all duration-300">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-display font-semibold tracking-wide leading-none text-foreground group-hover:text-glow transition-all">PaperMind</p>
                  <p className="text-[10px] font-mono font-medium text-muted-foreground mt-1 tracking-widest uppercase opacity-70">
                    Library
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-white/5" onClick={() => setSidebarOpen(false)}>
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
            <DocumentPanel />
          </motion.aside>
        )}
      </AnimatePresence>

      <main className="flex flex-1 flex-col min-w-0 relative z-10">
        <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 bg-black/20 backdrop-blur-xl sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <Button variant="ghost" size="icon" className="hidden md:flex h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-white/5" onClick={() => setSidebarOpen(true)}>
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            )}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="md:hidden h-8 w-8 rounded-lg bg-black/40 border-white/10"
                  aria-label="Open library"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0 flex flex-col bg-[#050505]/95 backdrop-blur-2xl border-r-white/10">
                <SheetHeader className="border-b border-white/5 px-5 py-4">
                  <SheetTitle className="flex items-center gap-3 text-sm font-display tracking-wide">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 text-primary border border-white/10">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    PaperMind
                  </SheetTitle>
                </SheetHeader>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <DocumentPanel />
                </div>
              </SheetContent>
            </Sheet>
            
            <Separator orientation="vertical" className="h-4 hidden md:block bg-white/10" />
            
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-white/5 transition-colors cursor-help group border border-transparent hover:border-white/5">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-[11px] font-mono tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">
                    {health.data
                      ? `${health.data.provider} · ${health.data.model}`
                      : health.isError
                        ? "Offline"
                        : "Connecting…"}
                  </span>
                  {health.data && (
                    <span className="flex h-2 w-2 relative ml-1">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-mono bg-black/90 border-white/10 text-white/90 shadow-2xl">
                {health.data
                  ? `${health.data.indexed_documents} docs / ${health.data.indexed_chunks} chunks`
                  : "Connect a backend to enable chat."}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                className="h-8 text-xs font-mono tracking-wide rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5 opacity-70" />
                Clear
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5" asChild>
              <a href="https://github.com/" target="_blank" rel="noreferrer" aria-label="GitHub">
                <Github className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-smooth pb-40">
          <div className="mx-auto max-w-3xl w-full flex flex-col pt-8 px-4 md:px-0">
            {messages.length === 0 ? (
              <AnimatedHero />
            ) : (
              messages.map((m, idx) => (
                <motion.div 
                  key={m.id} 
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className={`${idx > 0 ? "mt-8" : ""}`}
                >
                  <MessageBubble message={m} />
                </motion.div>
              ))
            )}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/90 to-transparent pt-20 pb-6 px-4 z-20 pointer-events-none">
          <div className="mx-auto max-w-3xl w-full pointer-events-auto">
            <AnimatePresence>
              {messages.length === 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.5, delay: 0.8 }}
                  className="flex flex-wrap justify-center gap-2 mb-6"
                >
                  {STARTERS.map((s) => (
                    <Button
                      key={s}
                      variant="outline"
                      size="sm"
                      className="rounded-full text-xs bg-black/40 border-white/10 hover:border-primary/50 hover:bg-primary/10 hover:text-primary transition-all duration-300 shadow-lg font-medium backdrop-blur-md"
                      onClick={() => send(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={() => send(input)}
              disabled={isStreaming}
              pending={isStreaming}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
