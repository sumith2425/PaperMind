import { BookOpen, Globe, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { motion } from "framer-motion";
import type { ChatSource, Route } from "@/lib/api";

interface RouteBadgeProps {
  route: Route;
  sources: ChatSource[];
}

const META: Record<
  Route,
  { label: string; icon: typeof BookOpen; className: string; description: string; glow: string }
> = {
  rag: {
    label: "RAG",
    icon: BookOpen,
    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    glow: "rgba(16,185,129,0.2)",
    description: "Answered using your uploaded documents.",
  },
  web: {
    label: "Web Search",
    icon: Globe,
    className: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    glow: "rgba(14,165,233,0.2)",
    description: "Answered using a live Tavily web search.",
  },
  direct: {
    label: "Direct Model",
    icon: Sparkles,
    className: "bg-violet-500/10 text-violet-400 border-violet-500/30",
    glow: "rgba(139,92,246,0.2)",
    description: "Answered directly from the model with no external lookup.",
  },
};

export function RouteBadge({ route, sources }: RouteBadgeProps) {
  const meta = META[route];
  const Icon = meta.icon;

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <motion.div
          whileHover={{ scale: 1.05 }}
          className="relative group cursor-help inline-block"
        >
          <div 
            className="absolute inset-0 rounded-full blur-md transition-opacity opacity-0 group-hover:opacity-100"
            style={{ backgroundColor: meta.glow }}
          />
          <Badge
            variant="outline"
            className={`${meta.className} relative h-5 px-2 gap-1.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md transition-all duration-300 shadow-[0_0_10px_var(--glow)]`}
            style={{ "--glow": meta.glow } as any}
          >
            <Icon className="h-3 w-3" />
            {meta.label}
            {sources.length > 0 && (
              <span className="opacity-80 pl-1.5 border-l border-current">
                {sources.length}
              </span>
            )}
            
            {/* Shimmer effect */}
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_2.5s_infinite] overflow-hidden rounded-full pointer-events-none" />
          </Badge>
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs border-border/50 shadow-2xl p-3 bg-card/95 backdrop-blur-xl">
        <p className="text-xs font-semibold mb-2 text-foreground">{meta.description}</p>
        {sources.length > 0 ? (
          <div className="space-y-1.5 border-t border-border/40 pt-2">
            {sources.slice(0, 6).map((s, i) => (
              <div key={i} className="text-[11px] leading-tight flex items-start gap-2">
                <span className="font-mono text-muted-foreground/60 w-4 shrink-0">[{i+1}]</span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground/80">
                  {s.name}
                </span>
                {typeof s.score === "number" && (
                  <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">
                    {s.score.toFixed(2)}
                  </span>
                )}
              </div>
            ))}
            {sources.length > 6 && (
              <div className="text-[10px] font-medium text-muted-foreground pt-1">
                + {sources.length - 6} more sources
              </div>
            )}
          </div>
        ) : (
          <p className="text-[11px] font-medium text-muted-foreground/70">No external sources cited.</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
