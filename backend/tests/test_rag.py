"""Tests for the RAG node, including the weak-retrieval web fallback."""

from __future__ import annotations

from langchain_core.documents import Document

from backend.app import config, graph, vectorstore, web_search


def _doc(name: str = "notes.txt", chunk_index: int = 0) -> Document:
    return Document(
        page_content="some chunk text",
        metadata={
            "document_id": "doc-1",
            "document_name": name,
            "chunk_index": chunk_index,
        },
    )


def test_rag_falls_back_to_web_when_distance_above_threshold(monkeypatch):
    """A weak similarity match falls back to web ONLY when the probe (not LLM)
    initiated the rag route — i.e. _probe_hit=True with somehow weak hits,
    or when there are zero hits."""

    weak_score = config.RAG_DISTANCE_THRESHOLD + 0.5
    monkeypatch.setattr(
        vectorstore,
        "similarity_search",
        lambda query, k=None: [(_doc(), weak_score)],
    )
    monkeypatch.setattr(
        web_search,
        "search",
        lambda query, max_results=None: [
            {"title": "Result", "url": "https://example.com", "snippet": "snippet"}
        ],
    )

    # When the LLM chose rag (_probe_hit=False, the default), weak hits are
    # still used — the router's semantic judgment takes precedence.
    state = graph.rag_node({"user_query": "anything", "_probe_hit": False})

    assert state["route"] == "rag"
    assert state["sources"]
    assert state["sources"][0]["kind"] == "document"


def test_rag_uses_docs_when_llm_chose_rag_despite_weak_scores(monkeypatch):
    """When the router LLM chose rag, trust it even if similarity is weak."""

    weak_score = config.RAG_DISTANCE_THRESHOLD + 0.3
    monkeypatch.setattr(
        vectorstore,
        "similarity_search",
        lambda query, k=None: [(_doc("paper.pdf"), weak_score)],
    )

    def _boom(*_a, **_kw):
        raise AssertionError("web_search.search must NOT be called")

    monkeypatch.setattr(web_search, "search", _boom)

    state = graph.rag_node({"user_query": "explain the key method", "_probe_hit": False})

    assert state["route"] == "rag"
    assert state["sources"][0]["kind"] == "document"
    assert state["sources"][0]["name"] == "paper.pdf"


def test_rag_falls_back_to_web_when_no_hits(monkeypatch):
    monkeypatch.setattr(
        vectorstore, "similarity_search", lambda query, k=None: []
    )
    monkeypatch.setattr(
        web_search,
        "search",
        lambda query, max_results=None: [
            {"title": "T", "url": "https://x", "snippet": "s"}
        ],
    )

    state = graph.rag_node({"user_query": "anything"})

    assert state["route"] == "web"


def test_rag_uses_documents_when_match_is_strong(monkeypatch):
    """A strong match (low distance) must yield document-kind sources."""

    strong_score = max(0.0, config.RAG_DISTANCE_THRESHOLD - 0.5)
    monkeypatch.setattr(
        vectorstore,
        "similarity_search",
        lambda query, k=None: [(_doc("cv.pdf"), strong_score)],
    )

    def _boom(*_a, **_kw):  # pragma: no cover - safety net
        raise AssertionError("web_search.search must NOT be called for strong match")

    monkeypatch.setattr(web_search, "search", _boom)

    state = graph.rag_node({"user_query": "tell me about my CV"})

    assert state["route"] == "rag"
    assert state["sources"][0]["kind"] == "document"
    assert state["sources"][0]["name"] == "cv.pdf"
    assert "cv.pdf" in state["retrieved_context"]
