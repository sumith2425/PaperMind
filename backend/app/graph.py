"""LangGraph state machine: router -> (rag | web | direct) -> respond."""

from __future__ import annotations

import json
import re
from typing import AsyncIterator, List, Literal, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph

from . import config, documents, vectorstore, web_search
from .llm import get_llm


# ---------------------------------------------------------------------------
# Graph state
# ---------------------------------------------------------------------------

Route = Literal["rag", "web", "direct"]


class ChatTurn(TypedDict):
    role: Literal["user", "assistant"]
    content: str


class Source(TypedDict, total=False):
    kind: Literal["document", "web"]
    name: str
    url: str
    score: float


class AgentState(TypedDict, total=False):
    user_query: str
    chat_history: List[ChatTurn]
    retrieved_context: str
    sources: List[Source]
    route: Route
    final_response: str
    # Cached vector hits from the router probe so rag_node doesn't re-query.
    _rag_hits: list
    # True when the router chose "rag" via a strong similarity probe hit;
    # False when the LLM made the routing decision.
    _probe_hit: bool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _history_to_messages(history: List[ChatTurn]) -> list:
    msgs = []
    for turn in history[-config.MAX_HISTORY_TURNS * 2 :]:
        if turn["role"] == "user":
            msgs.append(HumanMessage(content=turn["content"]))
        else:
            msgs.append(AIMessage(content=turn["content"]))
    return msgs


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------


ROUTER_SYSTEM_TEMPLATE = """You are the router of an AI assistant called PaperMind, focused on helping users understand research papers and other documents they upload.

You decide how to answer the user's latest message. You have three options:

- "rag"  – the user is asking about content that is likely in their uploaded
          private documents (their CV, notes, project docs, papers, etc.).
          PREFER this option whenever the question references "the document",
          "my doc", "the author", "the paper", "my CV", "this file", or any
          specific name, acronym, method, or topic that could plausibly come
          from a private file AND documents are available.
- "web"  – the user is asking about current events, public facts, news,
          recent information, real people/companies, or anything general the
          assistant should look up on the live web.
- "direct" – the message is small talk, a greeting, a clarification of the
          previous turn, an opinion question, math, or anything that needs no
          external knowledge.

Knowledge base status: {doc_status}

When in doubt between "rag" and "web", PREFER "rag" if any documents are
uploaded. The retrieval step will fall back to web search automatically if
the documents don't contain a relevant answer.

You MUST respond with a single JSON object of the form:
{{"route": "rag" | "web" | "direct", "reason": "<short>"}}

No prose, no markdown, just the JSON object."""


def _format_doc_status() -> str:
    n_chunks = vectorstore.collection_size()
    if n_chunks == 0:
        return "no user documents are uploaded yet (do NOT pick 'rag')"
    docs = documents.list_documents()
    names = ", ".join(f'"{d.name}"' for d in docs[:8]) or "n/a"
    extra = "" if len(docs) <= 8 else f" and {len(docs) - 8} more"
    return (
        f"the user has uploaded {len(docs)} document(s) indexed as {n_chunks} "
        f"chunks. Filenames: {names}{extra}. Treat any term, acronym, or "
        f"proper noun in the user's question as POSSIBLY defined inside "
        f"these documents."
    )


def router_node(state: AgentState) -> AgentState:
    """Retrieve-first router.

    1. If documents are indexed, probe the vector store. A strong hit forces
       route="rag" regardless of what the LLM thinks (and we cache the hits
       so rag_node doesn't re-query).
    2. Otherwise, ask the small LLM to choose between web and direct (or rag
       for meta queries about the uploads).
    """

    query = state["user_query"]
    history = state.get("chat_history", [])
    has_docs = vectorstore.collection_size() > 0

    # Step 1: retrieve-first probe. Use a wider K than usual so we don't miss
    # a relevant chunk just because the question wording is terse.
    cached_hits: list = []
    strong_hit = False
    if has_docs:
        cached_hits = vectorstore.similarity_search(
            query, k=max(config.RETRIEVAL_K, 6)
        )
        if cached_hits:
            best = min(score for _, score in cached_hits)
            strong_hit = best <= config.RAG_DISTANCE_THRESHOLD

    if strong_hit:
        # Documents clearly contain something relevant — go straight to RAG.
        return {"route": "rag", "_rag_hits": cached_hits, "_probe_hit": True}

    # Step 2: LLM router for everything else.
    llm = get_llm(temperature=0.0, json_mode=True)
    system = ROUTER_SYSTEM_TEMPLATE.format(doc_status=_format_doc_status())
    messages = [SystemMessage(content=system)]
    messages.extend(_history_to_messages(history))
    messages.append(HumanMessage(content=query))

    raw = llm.invoke(messages).content
    route: Route = "direct"
    try:
        parsed = json.loads(raw if isinstance(raw, str) else str(raw))
        candidate = str(parsed.get("route", "")).strip().lower()
        if candidate in ("rag", "web", "direct"):
            route = candidate  # type: ignore[assignment]
    except Exception:
        text = (raw if isinstance(raw, str) else str(raw)).lower()
        if "rag" in text:
            route = "rag"
        elif "web" in text:
            route = "web"

    # Safety: never RAG without docs.
    if route == "rag" and not has_docs:
        route = "web"

    if has_docs and route != "rag":
        if _is_meta_doc_query(query):
            route = "rag"
        elif route == "web" and _last_assistant_route(history) == "rag":
            # Follow-up to a RAG answer — stay in the documents.
            route = "rag"

    out: AgentState = {"route": route, "_probe_hit": False}
    if cached_hits and route == "rag":
        out["_rag_hits"] = cached_hits
    return out


_DOC_WORD_RE = re.compile(
    r"\b(documents?|docs?|files?|pdfs?|papers?|cv|resume|attachments?)\b",
    re.IGNORECASE,
)
_META_PHRASES = (
    "summarize",
    "summary",
    "summarise",
    "overview",
    "uploaded",
    "what's in",
    "what is in",
    "what are in",
    "list",
)


def _is_meta_doc_query(query: str) -> bool:
    """True when the user is talking *about* their uploads.

    Catches both meta requests like "summarize my docs" and follow-ups that
    reference the documents directly ("the 2nd document", "in this pdf",
    "from the paper", etc.).
    """
    q = query.lower()
    if _DOC_WORD_RE.search(q):
        return True
    return any(p in q for p in _META_PHRASES)


def _last_assistant_route(history: List[ChatTurn]) -> str | None:
    """Best-effort: did the previous assistant turn use RAG?

    The conversation history we get back from the frontend is just text, so
    we can't read the route directly. Instead we check whether the prior
    assistant turn cited a document chunk header that the RAG path emits.
    """
    for turn in reversed(history):
        if turn["role"] == "assistant":
            content = turn["content"].lower()
            if (
                "chunk #" in content
                or "page #" in content
                or "from the document" in content
            ):
                return "rag"
            return None
    return None


def _format_doc_chunks(docs_with_scores) -> tuple[str, List[Source]]:
    chunks: list[str] = []
    sources: List[Source] = []
    seen_docs: set[str] = set()
    for doc, score in docs_with_scores:
        name = doc.metadata.get("document_name", "unknown")
        page = doc.metadata.get("page")
        if page is not None:
            header = f"[doc: {name}, page #{page}]"
        else:
            # Plain-text / markdown have no page numbers.
            header = f"[doc: {name}]"
        chunks.append(f"{header}\n{doc.page_content}")
        doc_id = doc.metadata.get("document_id", "")
        if doc_id and doc_id not in seen_docs:
            seen_docs.add(doc_id)
            sources.append(
                {
                    "kind": "document",
                    "name": str(doc.metadata.get("document_name", "document")),
                    "score": float(score),
                }
            )
    return "\n\n---\n\n".join(chunks), sources


def rag_node(state: AgentState) -> AgentState:
    """Retrieve from Chroma. Fall back to doc-sampling for meta queries,
    and to web search only when no docs are relevant at all."""

    query = state["user_query"]
    # Reuse the probe done by the router whenever possible.
    hits = state.get("_rag_hits") or vectorstore.similarity_search(query)
    meta_query = _is_meta_doc_query(query)
    probe_hit = state.get("_probe_hit", False)

    has_hits = bool(hits)
    weak = (
        not has_hits
        or min(score for _, score in hits) > config.RAG_DISTANCE_THRESHOLD
    )

    # When the router LLM (not the similarity probe) chose "rag", trust its
    # semantic judgment: use whatever document context we retrieved rather than
    # falling back to web search.  The LLM in respond_node will honestly say
    # "not in the documents" if the context is truly irrelevant.
    if weak and has_hits and not probe_hit:
        weak = False

    if weak and meta_query and vectorstore.collection_size() > 0:
        # User is asking *about* their uploads (e.g. "summarize my docs").
        # Similarity search against the question text won't match, so pull a
        # representative sample of chunks from each indexed document.
        sampled = vectorstore.sample_chunks_per_document()
        scored = [(doc, 0.0) for doc in sampled]
        context, sources = _format_doc_chunks(scored)
        return {
            "route": "rag",
            "retrieved_context": context,
            "sources": sources,
        }

    if weak:
        # No hits at all — use the web instead.
        return _web_lookup(query)

    context, sources = _format_doc_chunks(hits)
    return {
        "route": "rag",
        "retrieved_context": context,
        "sources": sources,
    }


def _web_lookup(query: str) -> AgentState:
    results = web_search.search(query)
    sources: List[Source] = [
        {"kind": "web", "name": r["title"], "url": r["url"]} for r in results
    ]
    return {
        "route": "web",
        "retrieved_context": web_search.format_results(results),
        "sources": sources,
    }


def web_node(state: AgentState) -> AgentState:
    """Live web search via DuckDuckGo."""
    return _web_lookup(state["user_query"])


RESPOND_SYSTEM_DIRECT = """You are PaperMind, a helpful, concise AI assistant that specializes in explaining research papers but is also a capable general assistant.
Answer the user using your own knowledge and the conversation so far.
Be friendly but get to the point. Use markdown for formatting when helpful."""

RESPOND_SYSTEM_RAG = """You are PaperMind, an AI assistant that helps users understand research papers and other documents they upload.

The user has uploaded private documents (often research papers). Use ONLY the
context below to answer the user's question. If the answer is not contained in
the context, say so honestly and suggest the user rephrase or upload more
material.

When helpful, mention which document the information came from. For PDFs,
cite the page number from the chunk header (e.g. "page 3"). Do NOT mention
chunk numbers or chunk indices — they are an internal detail. When explaining
technical content from a paper, prefer plain English with concrete examples.

CONTEXT:
{context}
"""

RESPOND_SYSTEM_WEB = """You are PaperMind, a helpful AI assistant.

You searched the web for the user's question. Use ONLY the search results
below to answer. Cite the sources inline like [1], [2] using the result
numbers, and be honest if the results don't actually answer the question.

WEB RESULTS:
{context}
"""


def respond_node(state: AgentState) -> AgentState:
    """Generate the final user-facing answer."""

    route = state.get("route", "direct")
    context = state.get("retrieved_context", "")

    if route == "rag":
        system = RESPOND_SYSTEM_RAG.format(context=context or "(no context)")
    elif route == "web":
        system = RESPOND_SYSTEM_WEB.format(context=context or "(no results)")
    else:
        system = RESPOND_SYSTEM_DIRECT

    llm = get_llm(temperature=0.4)
    messages = [SystemMessage(content=system)]
    messages.extend(_history_to_messages(state.get("chat_history", [])))
    messages.append(HumanMessage(content=state["user_query"]))

    # Use streaming under the hood so that LangGraph's astream_events
    # surface per-token events to the SSE endpoint. The behavior for
    # non-streaming callers (run_agent) is unchanged: we aggregate the
    # chunks here and return the full response in one go.
    pieces: List[str] = []
    for chunk in llm.stream(messages):
        piece = chunk.content if hasattr(chunk, "content") else str(chunk)
        if isinstance(piece, str) and piece:
            pieces.append(piece)
    return {"final_response": "".join(pieces).strip()}


# ---------------------------------------------------------------------------
# Build the compiled graph
# ---------------------------------------------------------------------------


def _route_after_router(state: AgentState) -> str:
    return state.get("route", "direct")


def _build_graph():
    builder = StateGraph(AgentState)
    builder.add_node("router", router_node)
    builder.add_node("rag", rag_node)
    builder.add_node("web", web_node)
    builder.add_node("respond", respond_node)

    builder.add_edge(START, "router")
    builder.add_conditional_edges(
        "router",
        _route_after_router,
        {"rag": "rag", "web": "web", "direct": "respond"},
    )
    builder.add_edge("rag", "respond")
    builder.add_edge("web", "respond")
    builder.add_edge("respond", END)
    return builder.compile()


_graph = None


def get_graph():
    global _graph
    if _graph is None:
        _graph = _build_graph()
    return _graph


def run_agent(query: str, history: List[ChatTurn]) -> AgentState:
    """Run a single user turn through the graph."""
    initial: AgentState = {
        "user_query": query,
        "chat_history": history or [],
        "sources": [],
    }
    result = get_graph().invoke(initial)
    return result  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Streaming
# ---------------------------------------------------------------------------


async def stream_agent(
    query: str, history: List[ChatTurn]
) -> AsyncIterator[dict]:
    """Run a single user turn through the compiled graph and yield SSE events.

    Uses LangGraph's native ``astream_events`` so streaming and non-streaming
    paths share the exact same graph definition. Event shapes:
      {"type": "meta",  "route": ..., "sources": [...]}
      {"type": "token", "delta": "..."}
      {"type": "done",  "answer": "..."}
      {"type": "error", "message": "..."}
    """

    initial: AgentState = {
        "user_query": query,
        "chat_history": history or [],
        "sources": [],
    }

    route: Route = "direct"
    sources: List[Source] = []
    meta_sent = False
    final_answer = ""

    try:
        async for event in get_graph().astream_events(initial, version="v2"):
            kind = event["event"]
            name = event.get("name", "")
            data = event.get("data", {}) or {}

            # Track route + sources from the routing/retrieval node outputs.
            if kind == "on_chain_end" and name in ("router", "rag", "web"):
                output = data.get("output") or {}
                if isinstance(output, dict):
                    if output.get("route") in ("rag", "web", "direct"):
                        route = output["route"]  # type: ignore[assignment]
                    if output.get("sources"):
                        sources = output["sources"]

            # Emit meta exactly once, right before the respond node generates.
            if (
                not meta_sent
                and kind == "on_chain_start"
                and name == "respond"
            ):
                yield {"type": "meta", "route": route, "sources": sources}
                meta_sent = True

            # Token-by-token streaming. Only the respond node calls llm.stream;
            # the router uses llm.invoke and so does NOT emit token events.
            if kind == "on_chat_model_stream":
                chunk = data.get("chunk")
                if chunk is not None:
                    piece = chunk.content if hasattr(chunk, "content") else str(chunk)
                    if isinstance(piece, str) and piece:
                        yield {"type": "token", "delta": piece}

            # Capture the final aggregated answer from the respond node.
            if kind == "on_chain_end" and name == "respond":
                output = data.get("output") or {}
                if isinstance(output, dict):
                    final_answer = output.get("final_response", "") or ""
    except Exception as exc:  # pragma: no cover - safety
        yield {"type": "error", "message": f"Agent error: {exc}"}
        return

    # Safety net: if the graph somehow finished without ever reaching respond,
    # still tell the client about the route we resolved.
    if not meta_sent:
        yield {"type": "meta", "route": route, "sources": sources}

    yield {"type": "done", "answer": final_answer.strip()}
