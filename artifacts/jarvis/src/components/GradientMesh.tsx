import { motion } from "framer-motion";

export function GradientMesh() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 mesh-bg opacity-80 mix-blend-screen" />
      <div className="grain-overlay" />
      
      {/* Animated Orbs */}
      <motion.div
        animate={{
          x: ["0%", "5%", "-5%", "0%"],
          y: ["0%", "-5%", "5%", "0%"],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute top-1/4 -left-1/4 w-[50vw] h-[50vw] rounded-full bg-primary/5 blur-[120px]"
      />
      
      <motion.div
        animate={{
          x: ["0%", "-5%", "5%", "0%"],
          y: ["0%", "5%", "-5%", "0%"],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        className="absolute bottom-1/4 -right-1/4 w-[60vw] h-[60vw] rounded-full bg-violet-500/5 blur-[150px]"
      />
    </div>
  );
}
