"""LLM client abstraction.

Switches between Groq's free hosted Llama 3 (default) and a local Ollama
instance based on the ``LLM_PROVIDER`` environment variable. The rest of the
application code never needs to know which provider is active.
"""

from __future__ import annotations

import os
from functools import lru_cache

from langchain_core.language_models import BaseChatModel

from . import config


@lru_cache(maxsize=4)
def get_llm(temperature: float = 0.2, json_mode: bool = False) -> BaseChatModel:
    """Return a chat model client. Cached per (temperature, json_mode) pair."""

    provider = config.LLM_PROVIDER

    if provider == "groq":
        from langchain_groq import ChatGroq

        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GROQ_API_KEY is not set. Either set it as an environment variable "
                "or switch LLM_PROVIDER=ollama for local development."
            )

        # Use the small/fast model for the router (JSON classification),
        # and the larger one for final answer generation.
        model = config.GROQ_ROUTER_MODEL if json_mode else config.GROQ_MODEL

        kwargs = {
            "model": model,
            "temperature": temperature,
            "api_key": api_key,
        }
        if json_mode:
            kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}

        return ChatGroq(**kwargs)

    if provider == "ollama":
        from langchain_community.chat_models import ChatOllama

        kwargs = {
            "model": config.OLLAMA_MODEL,
            "base_url": config.OLLAMA_BASE_URL,
            "temperature": temperature,
        }
        if json_mode:
            kwargs["format"] = "json"
        return ChatOllama(**kwargs)

    raise RuntimeError(
        f"Unknown LLM_PROVIDER={provider!r}. Use 'groq' or 'ollama'."
    )
