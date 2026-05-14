import { motion } from "framer-motion";
import { Brain, Sparkles, FileSearch, Globe } from "lucide-react";

export function AnimatedHero() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] w-full text-center relative z-10 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex items-center justify-center mb-8"
      >
        <div className="absolute inset-0 bg-primary/20 blur-[40px] rounded-full aspect-square" />
        <div className="relative h-20 w-20 rounded-2xl bg-card border border-white/10 shadow-2xl flex items-center justify-center overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <Brain className="h-10 w-10 text-primary drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]" />
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="font-display text-4xl md:text-6xl font-bold tracking-tight text-glow mb-4 gradient-text"
      >
        PaperMind
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="text-muted-foreground max-w-xl text-sm md:text-base font-medium leading-relaxed mb-10"
      >
        Drop in a research paper and ask anything — PaperMind reads it, cites the exact pages, and falls back to the live web or its own knowledge when your docs don't have the answer.
      </motion.p>

      <div className="flex items-center justify-center gap-6 md:gap-12 w-full max-w-2xl">
        <RoutingNode icon={<FileSearch />} label="PAPERS" color="emerald" delay={0.3} />
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 40, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="h-px bg-gradient-to-r from-emerald-500/0 via-border to-primary/0 hidden md:block"
        />
        <RoutingNode icon={<Globe />} label="WEB" color="sky" delay={0.4} />
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 40, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="h-px bg-gradient-to-r from-sky-500/0 via-border to-primary/0 hidden md:block"
        />
        <RoutingNode icon={<Sparkles />} label="DIRECT" color="violet" delay={0.5} />
      </div>
    </div>
  );
}

function RoutingNode({ icon, label, color, delay }: { icon: React.ReactNode, label: string, color: string, delay: number }) {
  const colors = {
    emerald: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20 shadow-[0_0_20px_rgba(52,211,153,0.15)]",
    sky: "text-sky-400 bg-sky-400/10 border-sky-400/20 shadow-[0_0_20px_rgba(56,189,248,0.15)]",
    violet: "text-violet-400 bg-violet-400/10 border-violet-400/20 shadow-[0_0_20px_rgba(167,139,250,0.15)]"
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className="flex flex-col items-center gap-3"
    >
      <div className={`h-12 w-12 rounded-xl flex items-center justify-center border backdrop-blur-md ${colors[color as keyof typeof colors]}`}>
        {icon}
      </div>
      <span className="font-mono text-[10px] tracking-widest font-semibold uppercase text-muted-foreground/80">{label}</span>
    </motion.div>
  );
}
