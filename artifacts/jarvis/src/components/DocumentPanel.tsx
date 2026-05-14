import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  UploadCloud,
  Trash2,
  Loader2,
  AlertTriangle,
  Database,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import {
  deleteDocument,
  listDocuments,
  uploadDocument,
  type DocumentInfo,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const ACCEPTED = ".pdf,.txt,.md,.markdown";

interface UploadProgress {
  id: string;
  name: string;
  percent: number;
  state: "uploading" | "indexing" | "done" | "error";
  message?: string;
}

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentPanel() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ["documents"],
    queryFn: listDocuments,
    refetchInterval: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  function updateUpload(id: string, patch: Partial<UploadProgress>) {
    setUploads((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...patch } : u)),
    );
  }

  function pruneUpload(id: string, delay = 1500) {
    setTimeout(() => {
      setUploads((prev) => prev.filter((u) => u.id !== id));
    }, delay);
  }

  async function startUpload(file: File) {
    const id = crypto.randomUUID();
    setUploads((prev) => [
      ...prev,
      { id, name: file.name, percent: 0, state: "uploading" },
    ]);
    try {
      const doc = await uploadDocument(file, (p) => {
        updateUpload(id, {
          percent: p,
          state: p >= 100 ? "indexing" : "uploading",
        });
      });
      updateUpload(id, { state: "done", percent: 100 });
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast({
        title: "Document indexed",
        description: `${doc.name} → ${doc.chunk_count} chunks added.`,
      });
      pruneUpload(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      updateUpload(id, { state: "error", message });
      toast({
        title: "Upload failed",
        description: message,
        variant: "destructive",
      });
      pruneUpload(id, 4000);
    }
  }

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) => void startUpload(f));
  };

  const docs: DocumentInfo[] = data?.documents ?? [];
  const isUploading = uploads.some(
    (u) => u.state === "uploading" || u.state === "indexing",
  );

  return (
    <div className="flex h-full flex-col gap-5 p-5 overflow-hidden">
      <div className="space-y-4 shrink-0">
        <motion.div
          animate={{ scale: dragOver ? 1.02 : 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          <Card
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={`relative overflow-hidden flex flex-col items-center justify-center gap-3 py-8 px-4 text-center transition-all duration-300 rounded-xl cursor-pointer ${
              dragOver 
                ? "border-emerald-500 bg-emerald-500/10" 
                : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
            } border-2 border-dashed backdrop-blur-sm`}
            onClick={() => !isUploading && fileRef.current?.click()}
          >
            <div className={`p-3 rounded-2xl transition-colors duration-300 ${dragOver ? "bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]" : "bg-black/40 text-muted-foreground border border-white/5"}`}>
              <UploadCloud className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-foreground">Drop papers here</p>
              <p className="text-[11px] font-mono text-muted-foreground mt-1 tracking-wide opacity-70">PDF, TXT, or MD</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </Card>
        </motion.div>

        <AnimatePresence>
          {uploads.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              {uploads.map((u) => (
                <div
                  key={u.id}
                  className="rounded-lg border border-white/10 bg-black/40 p-3 shadow-sm backdrop-blur-md"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="truncate text-xs font-semibold" title={u.name}>
                      {u.name}
                    </p>
                    <span className={`shrink-0 text-[10px] font-mono font-bold uppercase tracking-wider ${
                      u.state === 'error' ? 'text-destructive' : 
                      u.state === 'done' ? 'text-emerald-400' : 'text-primary animate-pulse'
                    }`}>
                      {u.state === "uploading" && `${u.percent}%`}
                      {u.state === "indexing" && "Indexing"}
                      {u.state === "done" && "Done"}
                      {u.state === "error" && "Error"}
                    </span>
                  </div>
                  <Progress
                    value={u.state === "error" ? 100 : u.percent}
                    className={`h-1.5 bg-white/10 ${
                      u.state === "error" ? "[&>div]:bg-destructive" : "[&>div]:bg-primary"
                    }`}
                  />
                  {u.state === "error" && u.message && (
                    <p className="mt-2 truncate text-[10px] font-medium text-destructive">
                      {u.message}
                    </p>
                  )}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-3">
        <div className="flex items-center justify-between px-1 shrink-0 pb-2 border-b border-white/5">
          <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Database className="h-3 w-3" />
            Library
          </h3>
          {data && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {data.total_chunks} chunks
            </span>
          )}
        </div>

        <ScrollArea className="flex-1 -mx-2 px-2">
          <div className="space-y-2 pb-4">
            {isLoading && (
              <div className="space-y-2 mt-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="rounded-xl border border-white/5 bg-white/5 p-3 flex gap-3 items-center">
                    <Skeleton className="h-8 w-8 rounded-lg bg-white/10" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-3 w-3/4 bg-white/10" />
                      <Skeleton className="h-2 w-1/2 bg-white/5" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {error && (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center rounded-xl border border-destructive/20 bg-destructive/10 backdrop-blur-sm mt-2">
                <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
                <p className="text-xs font-semibold text-destructive">Backend Offline</p>
                <p className="text-[10px] text-destructive/80 mt-1">Please check your API server</p>
              </div>
            )}
            
            {!isLoading && !error && docs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center mt-2">
                <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/10">
                  <Search className="h-5 w-5 text-muted-foreground/50" />
                </div>
                <p className="text-[13px] font-semibold text-foreground/80">Library empty</p>
                <p className="text-[11px] font-medium text-muted-foreground mt-1.5 max-w-[200px]">
                  Upload a research paper or any PDF to start asking questions about it.
                </p>
              </div>
            )}
            
            <AnimatePresence>
              {docs.map((d) => (
                <motion.div
                  key={d.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="group relative overflow-hidden rounded-xl border border-white/5 bg-black/40 p-3 hover:bg-white/5 transition-all duration-300 backdrop-blur-md"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p
                        className="truncate text-xs font-semibold text-foreground/90 group-hover:text-white transition-colors"
                        title={d.name}
                      >
                        {d.name}
                      </p>
                      <p className="mt-1.5 flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground">
                        <span>{humanSize(d.size_bytes)}</span>
                        <span className="opacity-30">•</span>
                        <span className="text-emerald-400/70">{d.chunk_count} chunks</span>
                      </p>
                    </div>
                  </div>
                  
                  <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-white border border-destructive/20"
                      onClick={() => {
                        if (window.confirm(`Remove "${d.name}" from the index?`)) {
                          deleteMutation.mutate(d.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
