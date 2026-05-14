# PaperMind

> Reading research papers is tough. They're dense, technical, and full of
> jargon. PaperMind turns any research paper into a conversation — upload it,
> ask questions, and get clear explanations with page citations.

Research papers are hard to read because they're complex by nature. PaperMind
was built to solve exactly that problem. Upload any PDF, TXT, or Markdown file
(especially academic papers), and ask it to explain concepts, summarize
sections, or answer specific questions. It cites the exact pages where it
found the answer, so you can verify and dive deeper.

But PaperMind does more than just papers. It has **three intelligent modes**
that adapt to your question automatically:

- **📄 PAPERS** — Upload your documents and ask questions. Get explanations
  with clickable page-numbered citations like `[p.3]` pointing to the exact
  source.
- **🌐 WEB** — For general doubts or current information not in your library,
  PaperMind searches the live web and cites top results from the internet.
- **💬 DIRECT** — Normal conversation mode. Ask any question and get an answer
  without retrieving external sources — perfect for follow-ups, definitions,
  or brainstorming.

An **agentic routing system** decides which mode to use for each question. You
see the route on every reply, so you always know where the answer came from.

---

## How it works

### Three modes, one conversation

1. **Upload your documents** — Drop a research paper (PDF, TXT, or Markdown)
   in the sidebar. PaperMind extracts the text, splits it into chunks with
   page numbers, and indexes it using vector embeddings.

2. **Ask anything** — Type your question. PaperMind's router intelligently
   decides whether to search your uploaded papers, query the web, or answer
   directly:
   - *"Explain the key method in plain English"* → **PAPERS** route, with
     page citations
   - *"What is gradient descent?"* → **WEB** route, live search results
   - *"Summarize that in simpler terms"* → **DIRECT** route, conversational
     follow-up

3. **Get cited answers** — Every response shows a colored badge (PAPERS / WEB
   / DIRECT). Hover to see all sources. Citations are clickable, so you can
   jump straight to the original context.

### Multi-turn conversations

PaperMind remembers the last 8 turns of your conversation, so follow-ups like
"explain that more simply" or "what does that mean?" work naturally. It
streams answers token-by-token for a smooth, responsive feel.

---

## Under the hood

### Agentic routing with LangGraph

```
                ┌──────────┐
   user msg ──▶ │  router  │── direct ──▶ ┌─────────┐
                └────┬─────┘              │ respond │──▶ streamed answer
                     │── papers ─▶ chroma │  (LLM)  │      + sources
                     │   (retrieve-first  │         │
                     │    probe + cache)  │         │
                     └── web ──▶ tavily ─▶└─────────┘
```

The entire conversation flow is implemented as a LangGraph state machine in
`backend/app/graph.py`:

1. **Router node** — First runs a vector similarity probe against your
   indexed documents. If it finds a strong match, it routes to PAPERS
   immediately. Otherwise, it asks a fast Llama 3.1 8B model to classify the
   question semantically into `{"route": "rag" | "web" | "direct"}`.

2. **PAPERS node** — Retrieves the most relevant document chunks using cached
   probe results. Trusts the router's judgment even for weak similarity scores
   when the LLM chose RAG semantically. Only falls back to web if no hits
   exist or the router picked a different path.

3. **WEB node** — Uses Tavily to search the live internet and returns up to 5
   ranked results with snippets and URLs.

4. **DIRECT node** — Answers directly from the model's knowledge without
   external retrieval.

5. **Respond node** — Llama 3.3 70B generates the final answer using routed
   context (documents, web results, or neither) plus the last 8 turns of
   conversation history. Tokens stream out via Server-Sent Events for instant
   feedback.

---

## Why PaperMind?

**The problem**: Academic papers are written for experts. They assume
background knowledge, use domain-specific terminology, and pack complex ideas
into dense paragraphs. Reading them takes time, focus, and often external
research to understand even basic concepts.

**The solution**: PaperMind turns that paper into an interactive conversation.
Instead of struggling through pages of jargon, you can:
- Ask it to explain specific sections in plain English
- Request summaries of key arguments or methods
- Clarify technical terms or equations on the fly
- Cross-reference concepts with web search when you need broader context

Whether you're a researcher reviewing literature, a student tackling assigned
readings, or a professional exploring a new field, PaperMind helps you
understand faster without switching between tabs, search engines, and PDF
readers.

---

## Tech stack

| Layer            | Tech                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| Frontend         | React 19, Vite, Tailwind v4, shadcn/ui, TanStack Query, wouter, Framer Motion, react-markdown + remark-gfm |
| Backend          | Python 3.11, FastAPI, Uvicorn, Server-Sent Events                    |
| Agent runtime    | LangChain, LangGraph                                                 |
| Vector store     | ChromaDB (persistent on disk)                                        |
| Embeddings       | `sentence-transformers/all-MiniLM-L6-v2` via `langchain-huggingface` |
| LLM              | Groq free hosted Llama 3 (`llama-3.3-70b-versatile` for answers, `llama-3.1-8b-instant` for routing). Local Ollama also supported. |
| Web search       | Tavily (`langchain-tavily`)                                          |
| Document parsing | `pypdf` for PDFs (with page numbers), plain UTF-8 for TXT/MD         |
| Tooling          | pnpm workspace monorepo, `uv` for Python deps, pytest                |

---

## Project layout

```
papermind/
├── README.md
├── pyproject.toml                  ← Python deps (uv-managed)
├── package.json                    ← root pnpm workspace
├── pnpm-workspace.yaml
│
├── backend/                        ← FastAPI + LangGraph backend
│   ├── app/
│   │   ├── main.py                 ← FastAPI app + routes + SSE streaming
│   │   ├── graph.py                ← LangGraph state machine
│   │   ├── llm.py                  ← Groq / Ollama client switch
│   │   ├── vectorstore.py          ← Chroma + HuggingFace embeddings
│   │   ├── documents.py            ← Upload, chunk, index, persist
│   │   ├── web_search.py           ← Tavily wrapper
│   │   └── config.py               ← Env-driven config
│   ├── tests/                      ← pytest suite
│   └── data/                       ← Persisted Chroma + uploads (gitignored)
│
└── artifacts/
    └── jarvis/                     ← React + Vite frontend (served at /)
        ├── index.html
        ├── vite.config.ts
        └── src/
            ├── pages/ChatPage.tsx
            ├── components/
            │   ├── AnimatedHero.tsx
            │   ├── ChatInput.tsx
            │   ├── DocumentPanel.tsx
            │   ├── MessageBubble.tsx     ← markdown + clickable [N] citations
            │   └── RouteBadge.tsx        ← PAPERS / WEB / DIRECT badge
            └── lib/api.ts                ← Backend client (SSE + REST)
```

---

## Running locally

### Prerequisites

- **Node.js 20+** and **pnpm** (`npm install -g pnpm`)
- **Python 3.11+** and **uv**
  (`pip install uv` or `curl -LsSf https://astral.sh/uv/install.sh | sh`)

### Setup

```bash
# 1. Install dependencies
pnpm install
uv sync --python python3.11

# 2. Set the two API keys
export GROQ_API_KEY=...        # https://console.groq.com/keys (free, no credit card)
export TAVILY_API_KEY=...      # https://app.tavily.com/ (1000 free searches/month)

# 3. Start the backend (terminal 1)
uv run python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload

# 4. Start the frontend (terminal 2)
pnpm --filter @workspace/jarvis run dev
```

Then open the URL Vite prints (default `http://localhost:5173/`).

---

## Production build

A single uvicorn process can serve both the API and the built React bundle:

```bash
pnpm --filter @workspace/jarvis run build
STATIC_DIR=artifacts/jarvis/dist/public uv run python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

## Swapping the LLM provider

```bash
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

All supported environment variables:

| Var                        | Default                                        |
| -------------------------- | ---------------------------------------------  |
| `LLM_PROVIDER`             | `groq`                                         |
| `GROQ_MODEL`               | `llama-3.3-70b-versatile` (answers)            |
| `GROQ_ROUTER_MODEL`        | `llama-3.1-8b-instant` (routing)               |
| `EMBEDDING_MODEL`          | `sentence-transformers/paraphrase-MiniLM-L3-v2`|
| `CHUNK_SIZE`               | `1200`                                         |
| `CHUNK_OVERLAP`            | `80`                                           |
| `RETRIEVAL_K`              | `4`                                            |
| `RAG_DISTANCE_THRESHOLD`   | `0.85` (lower = stricter)                      |
| `WEB_SEARCH_RESULTS`       | `5`                                            |
| `MAX_HISTORY_TURNS`        | `8`                                            |
| `JARVIS_DATA_DIR`          | `./backend/data`                               |
| `BACKEND_PORT`             | `8000` (Vite proxy target)                     |

---

## API reference

```
GET    /api/health                       → provider, model, indexed counts
POST   /api/chat                         → { message, history } → { answer, route, sources }
POST   /api/chat/stream                  → same input, SSE stream of meta + token events
GET    /api/documents                    → list indexed docs
POST   /api/documents (multipart, file)  → upload + index a PDF / TXT / MD
DELETE /api/documents/{id}               → remove from disk + Chroma
```

---

## License

MIT
