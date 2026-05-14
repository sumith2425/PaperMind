import { AlertTriangle, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { GradientMesh } from "@/components/GradientMesh";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background p-4 font-sans selection:bg-primary/20 relative overflow-hidden text-foreground">
      <GradientMesh />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md mx-4 rounded-3xl border border-white/10 bg-black/40 backdrop-blur-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
        
        <div className="pt-10 pb-10 flex flex-col items-center text-center px-8 relative z-10">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center mb-6 border border-destructive/20 shadow-[0_0_20px_rgba(220,38,38,0.2)]"
          >
            <AlertTriangle className="h-10 w-10 text-destructive drop-shadow-[0_0_8px_rgba(220,38,38,0.5)]" />
          </motion.div>
          
          <motion.h1 
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-3xl font-display font-bold tracking-tight text-white mb-3"
          >
            System Offline
          </motion.h1>
          
          <motion.p 
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="text-sm text-muted-foreground mb-8 max-w-[280px] leading-relaxed"
          >
            The requested interface could not be found. Please check your connection or return to the main workspace.
          </motion.p>
          
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="w-full"
          >
            <Link href="/" className="block w-full">
              <Button className="w-full font-medium shadow-lg transition-all duration-300 hover:scale-[1.02] bg-white text-black hover:bg-white/90 rounded-xl h-12">
                <Home className="mr-2 h-4 w-4" />
                Return to Workspace
              </Button>
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
