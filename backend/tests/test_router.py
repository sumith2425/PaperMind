"""Tests for the LLM router node in ``backend.app.graph``."""

from __future__ import annotations

from backend.app import graph, vectorstore


class _StubMessage:
    def __init__(self, content: str) -> None:
        self.content = content


class _StubLLM:
    """Minimal chat-model stand-in: ``invoke`` returns canned content."""

    def __init__(self, content: str) -> None:
        self._content = content
        self.calls = 0

    def invoke(self, _messages):
        self.calls += 1
        return _StubMessage(self._content)


def _patch_llm(monkeypatch, content: str) -> _StubLLM:
    stub = _StubLLM(content)
    monkeypatch.setattr(graph, "get_llm", lambda **_kw: stub)
    return stub


def test_router_downgrades_rag_to_web_when_no_documents(monkeypatch):
    """If the LLM picks ``rag`` but no chunks are indexed, route to web."""

    assert vectorstore.collection_size() == 0

    _patch_llm(monkeypatch, '{"route": "rag", "reason": "asks about CV"}')

    state = graph.router_node(
        {"user_query": "What does my CV say about Python?", "chat_history": []}
    )

    assert state["route"] == "web"


def test_router_keeps_direct_for_smalltalk(monkeypatch):
    _patch_llm(monkeypatch, '{"route": "direct", "reason": "greeting"}')

    state = graph.router_node({"user_query": "hello there", "chat_history": []})

    assert state["route"] == "direct"


def test_router_falls_back_to_heuristic_on_bad_json(monkeypatch):
    """If the LLM returns prose, ``web`` keyword still wins through fallback."""
    _patch_llm(monkeypatch, "I think the best option is web search.")

    state = graph.router_node(
        {"user_query": "Who won the Nobel prize this year?", "chat_history": []}
    )

    assert state["route"] == "web"
