const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : `${import.meta.env.BASE_URL.replace(/\/$/, "")}/jarvis-api`;

export type Route = "rag" | "web" | "direct";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSource {
  kind: "document" | "web";
  name: string;
  url?: string;
  score?: number;
}

export interface ChatResponse {
  answer: string;
  route: Route;
  sources: ChatSource[];
}

export interface DocumentInfo {
  id: string;
  name: string;
  extension: string;
  size_bytes: number;
  chunk_count: number;
  uploaded_at: number;
}

export interface DocumentListResponse {
  documents: DocumentInfo[];
  total_chunks: number;
}

export interface HealthResponse {
  status: string;
  provider: string;
  model: string;
  indexed_chunks: number;
  indexed_documents: number;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function sendChat(
  message: string,
  history: ChatTurn[],
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  return handle<ChatResponse>(res);
}

export type StreamEvent =
  | { type: "meta"; route: Route; sources: ChatSource[] }
  | { type: "token"; delta: string }
  | { type: "done"; answer: string }
  | { type: "error"; message: string };

export interface StreamCallbacks {
  onEvent: (event: StreamEvent) => void;
  signal?: AbortSignal;
}

export async function streamChat(
  message: string,
  history: ChatTurn[],
  { onEvent, signal }: StreamCallbacks,
): Promise<void> {
  const res = await fetch(`${API_BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
    signal,
  });

  if (!res.ok || !res.body) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail || "Stream request failed");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let sepIndex = buffer.indexOf("\n\n");
    while (sepIndex !== -1) {
      const frame = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      const dataLines = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart());
      if (dataLines.length > 0) {
        const payload = dataLines.join("\n");
        try {
          const parsed = JSON.parse(payload) as StreamEvent;
          onEvent(parsed);
        } catch {
          /* ignore malformed frame */
        }
      }
      sepIndex = buffer.indexOf("\n\n");
    }
  }
}

export async function listDocuments(): Promise<DocumentListResponse> {
  const res = await fetch(`${API_BASE}/documents`);
  return handle<DocumentListResponse>(res);
}

export async function uploadDocument(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<DocumentInfo> {
  return new Promise<DocumentInfo>((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/documents`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.upload.onload = () => onProgress?.(100);
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data as DocumentInfo);
        } else {
          reject(new Error(data.detail || xhr.statusText || "Upload failed"));
        }
      } catch {
        reject(new Error(xhr.statusText || "Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/documents/${id}`, {
    method: "DELETE",
  });
  await handle<unknown>(res);
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  return handle<HealthResponse>(res);
}
