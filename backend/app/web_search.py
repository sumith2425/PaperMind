"""Tavily web search wrapper used by the web tool node."""

from __future__ import annotations

import logging
from typing import List, TypedDict

from . import config

logger = logging.getLogger(__name__)


class WebResult(TypedDict):
    title: str
    url: str
    snippet: str


def search(query: str, max_results: int | None = None) -> List[WebResult]:
    """Return a list of web results for ``query`` using Tavily.

    Falls back to an empty list on any error so the agent can degrade
    gracefully instead of blowing up the request.
    """

    max_results = max_results or config.WEB_SEARCH_RESULTS

    if not config.TAVILY_API_KEY:
        logger.warning("TAVILY_API_KEY not set; web search disabled.")
        return []

    try:
        from tavily import TavilyClient
    except ImportError:
        logger.warning("tavily-python not installed; web search disabled.")
        return []

    try:
        client = TavilyClient(api_key=config.TAVILY_API_KEY)
        response = client.search(
            query=query,
            max_results=max_results,
            search_depth=config.TAVILY_SEARCH_DEPTH,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Tavily search failed: %s", exc)
        return []

    results: List[WebResult] = []
    for hit in response.get("results", []):
        results.append(
            {
                "title": hit.get("title", "") or "",
                "url": hit.get("url", "") or "",
                "snippet": hit.get("content", "") or "",
            }
        )
    return results


def format_results(results: List[WebResult]) -> str:
    """Compact, prompt-friendly rendering of search hits."""
    if not results:
        return "No web results found."
    lines = []
    for i, r in enumerate(results, 1):
        snippet = (r["snippet"] or "").strip().replace("\n", " ")
        lines.append(f"[{i}] {r['title']}\n{r['url']}\n{snippet}")
    return "\n\n".join(lines)
