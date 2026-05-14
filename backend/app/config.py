"""Centralized configuration loaded from environment variables."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


# Where to persist Chroma's database and uploaded source files.
DATA_DIR = Path(os.environ.get("JARVIS_DATA_DIR", "./backend/data"))
CHROMA_DIR = DATA_DIR / "chroma"
UPLOADS_DIR = DATA_DIR / "uploads"
DOCUMENTS_INDEX_FILE = DATA_DIR / "documents.json"

# Make sure the directories exist before anything tries to read/write them.
for _dir in (DATA_DIR, CHROMA_DIR, UPLOADS_DIR):
    _dir.mkdir(parents=True, exist_ok=True)

# LLM provider: "groq" (default, free hosted Llama 3) or "ollama" (local).
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "groq").lower()

# Groq configuration. The API key must be supplied via environment variables.
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_ROUTER_MODEL = os.environ.get("GROQ_ROUTER_MODEL", "llama-3.1-8b-instant")

# Ollama configuration (used when LLM_PROVIDER=ollama).
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3")

# Embedding model used for the Chroma vector store.
# Accepts a HuggingFace model ID or a local path to a downloaded model.
_default_embedding = "sentence-transformers/paraphrase-MiniLM-L3-v2"
_local_cache = Path.home() / ".cache" / "huggingface" / "hub" / "models--sentence-transformers--paraphrase-MiniLM-L3-v2" / "snapshots" / "paraphrase-MiniLM-L3-v2"
# if _local_cache.is_dir():
#     _default_embedding = str(_local_cache)
EMBEDDING_PROVIDER = os.environ.get("EMBEDDING_PROVIDER", "local").lower()
HUGGINGFACEHUB_API_TOKEN = os.environ.get("HUGGINGFACEHUB_API_TOKEN", "")
EMBEDDING_MODEL_NAME = os.environ.get("EMBEDDING_MODEL", _default_embedding)

# Chunking parameters for ingested documents.
CHUNK_SIZE = int(os.environ.get("CHUNK_SIZE", "1200"))
CHUNK_OVERLAP = int(os.environ.get("CHUNK_OVERLAP", "80"))

# Retrieval settings.
RETRIEVAL_K = int(os.environ.get("RETRIEVAL_K", "4"))
# Cosine-distance threshold above which we treat the retrieval as "weak"
# and fall back to web search (Chroma returns smaller distance = better match).
RAG_DISTANCE_THRESHOLD = float(os.environ.get("RAG_DISTANCE_THRESHOLD", "0.85"))

# Web search settings (Tavily).
WEB_SEARCH_RESULTS = int(os.environ.get("WEB_SEARCH_RESULTS", "5"))
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")
TAVILY_SEARCH_DEPTH = os.environ.get("TAVILY_SEARCH_DEPTH", "basic")  # "basic" or "advanced"

# Conversation memory.
MAX_HISTORY_TURNS = int(os.environ.get("MAX_HISTORY_TURNS", "8"))

# CORS origins for the FastAPI app.
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")
