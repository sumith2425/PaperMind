import { useEffect, useRef } from "react";
import { Send, Loader2, CornerDownLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  pending?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled,
  pending,
}: ChatInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <motion.form
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && value.trim()) onSubmit();
      }}
      className="relative flex items-end gap-2 rounded-2xl border border-white/10 bg-[#0A0A0A]/80 backdrop-blur-2xl p-2 shadow-[0_0_40px_rgba(0,0,0,0.5)] focus-within:ring-1 focus-within:ring-primary/30 focus-within:border-primary/40 transition-all duration-300 group"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 opacity-0 group-focus-within:opacity-100 rounded-2xl pointer-events-none transition-opacity duration-500" />
      
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || !e.shiftKey)) {
            e.preventDefault();
            if (!disabled && value.trim()) onSubmit();
          }
        }}
        rows={1}
        placeholder="Ask about your papers, the web, or anything else..."
        className="min-h-[44px] resize-none border-0 bg-transparent px-4 py-3.5 text-[15px] shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50 font-medium z-10"
        disabled={disabled}
      />
      
      <div className="flex items-center gap-3 pr-2 pb-2 z-10">
        {!value.trim() && !pending && (
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/40 pr-2">
            <span className="flex items-center gap-0.5"><kbd className="px-1.5 py-0.5 rounded-md border border-border/40 bg-white/5">⌘</kbd> <kbd className="px-1.5 py-0.5 rounded-md border border-border/40 bg-white/5">K</kbd> to focus</span>
          </div>
        )}
        
        <Button
          type="submit"
          size="icon"
          disabled={disabled || !value.trim()}
          className={`shrink-0 h-10 w-10 rounded-xl transition-all duration-300 ${
            value.trim() && !pending 
              ? 'bg-primary text-primary-foreground shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:scale-105' 
              : 'bg-white/5 text-muted-foreground'
          }`}
          aria-label="Send"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <CornerDownLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </motion.form>
  );
}
