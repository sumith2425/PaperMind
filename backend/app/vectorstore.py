"""Persistent Chroma vector store wrapper using HuggingFace embeddings."""

from __future__ import annotations

from functools import lru_cache
from typing import List, Tuple

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings, HuggingFaceEndpointEmbeddings


from . import config


COLLECTION_NAME = "jarvis_knowledge"


@lru_cache(maxsize=1)
def get_embeddings():
    if config.EMBEDDING_PROVIDER == "hf-endpoint":
        return HuggingFaceEndpointEmbeddings(
            model=config.EMBEDDING_MODEL_NAME,
            task="feature-extraction",
            huggingfacehub_api_token=config.HUGGINGFACEHUB_API_TOKEN,
        )

    return HuggingFaceEmbeddings(
        model_name=config.EMBEDDING_MODEL_NAME,
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
    )


@lru_cache(maxsize=1)
def get_vectorstore() -> Chroma:
    """Open (or create) the persistent Chroma collection."""
    return Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=get_embeddings(),
        persist_directory=str(config.CHROMA_DIR),
    )


def add_documents(docs: List[Document], ids: List[str]) -> None:
    """Add chunks to the collection. ``ids`` must align with ``docs``."""
    if not docs:
        return
    store = get_vectorstore()
    store.add_documents(documents=docs, ids=ids)


def delete_by_document_id(document_id: str) -> None:
    """Remove every chunk that belongs to a given source document."""
    store = get_vectorstore()
    # Chroma supports metadata filtering on delete.
    store.delete(where={"document_id": document_id})


def similarity_search(
    query: str, k: int | None = None
) -> List[Tuple[Document, float]]:
    """Return top-k chunks with their cosine distance scores (lower = better)."""
    store = get_vectorstore()
    k = k or config.RETRIEVAL_K
    return store.similarity_search_with_score(query, k=k)


def sample_chunks_per_document(
    per_doc: int = 3, max_docs: int = 5
) -> List[Document]:
    """Return a small sample of chunks for each indexed document.

    Used when the user asks a meta question like "summarize my documents"
    where similarity search against the question text returns weak matches
    but the user clearly wants information drawn from their uploads.
    """
    store = get_vectorstore()
    try:
        raw = store._collection.get(include=["documents", "metadatas"])  # type: ignore[attr-defined]
    except Exception:
        return []

    docs_by_id: dict[str, list[tuple[int, Document]]] = {}
    for content, meta in zip(raw.get("documents", []), raw.get("metadatas", [])):
        meta = meta or {}
        doc_id = str(meta.get("document_id", ""))
        if not doc_id:
            continue
        chunk_index = int(meta.get("chunk_index", 0) or 0)
        docs_by_id.setdefault(doc_id, []).append(
            (chunk_index, Document(page_content=content, metadata=meta))
        )

    sampled: List[Document] = []
    for doc_id in list(docs_by_id.keys())[:max_docs]:
        chunks = sorted(docs_by_id[doc_id], key=lambda x: x[0])[:per_doc]
        sampled.extend(doc for _, doc in chunks)
    return sampled


def collection_size() -> int:
    """Total number of chunks currently indexed."""
    store = get_vectorstore()
    try:
        return store._collection.count()  # type: ignore[attr-defined]
    except Exception:
        return 0
