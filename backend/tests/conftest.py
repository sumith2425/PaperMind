"""Shared pytest fixtures for the Mini Jarvis backend tests.

These fixtures isolate every test from the real data directory, swap the
heavy HuggingFace embedding model for a deterministic in-memory fake, and
reset every ``lru_cache`` that the production code relies on so each test
sees a fresh Chroma collection.
"""

from __future__ import annotations

import hashlib
import math
import sys
from pathlib import Path
from typing import List

import pytest


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


from langchain_core.embeddings import Embeddings  # noqa: E402


class FakeEmbeddings(Embeddings):
    """Deterministic, hash-based embeddings. No model download required."""

    DIM = 32

    def _embed(self, text: str) -> List[float]:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        # Map bytes into the [-1, 1] range, then L2-normalise so cosine
        # distance is well behaved for Chroma's similarity search.
        vals = [(b - 128) / 128.0 for b in digest[: self.DIM]]
        norm = math.sqrt(sum(v * v for v in vals)) or 1.0
        return [v / norm for v in vals]

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self._embed(t) for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._embed(text)


@pytest.fixture(autouse=True)
def isolate_environment(tmp_path, monkeypatch):
    """Point the app at a tmp data dir and use the fake embedding model."""

    from backend.app import config, vectorstore

    chroma_dir = tmp_path / "chroma"
    uploads_dir = tmp_path / "uploads"
    index_file = tmp_path / "documents.json"
    chroma_dir.mkdir()
    uploads_dir.mkdir()

    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    monkeypatch.setattr(config, "CHROMA_DIR", chroma_dir)
    monkeypatch.setattr(config, "UPLOADS_DIR", uploads_dir)
    monkeypatch.setattr(config, "DOCUMENTS_INDEX_FILE", index_file)

    # The vectorstore caches both the embedding model and the Chroma
    # client. Wipe them so each test gets a fresh collection rooted in
    # ``tmp_path``.
    vectorstore.get_embeddings.cache_clear()
    vectorstore.get_vectorstore.cache_clear()

    monkeypatch.setattr(vectorstore, "get_embeddings", lambda: FakeEmbeddings())

    yield

    # ``monkeypatch`` has already restored the original lru-cached
    # ``get_embeddings`` by this point. Clear caches defensively so the
    # next test does not reuse a stale Chroma client or model handle.
    for fn in (vectorstore.get_vectorstore, vectorstore.get_embeddings):
        clear = getattr(fn, "cache_clear", None)
        if clear is not None:
            clear()


# ---------------------------------------------------------------------------
# Helpers for building a tiny, valid PDF without needing reportlab/fpdf.
# ---------------------------------------------------------------------------


def _build_minimal_pdf(text: str) -> bytes:
    """Return a syntactically valid single-page PDF that contains ``text``.

    The output is hand-assembled so the test suite has zero PDF-generation
    dependencies. ``pypdf`` parses the resulting bytes back to ``text``.
    """

    safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    content_stream = f"BT /F1 24 Tf 50 700 Td ({safe}) Tj ET".encode("latin-1")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"
        ),
        b"<< /Length "
        + str(len(content_stream)).encode()
        + b" >>\nstream\n"
        + content_stream
        + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    out = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"

    xref_pos = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_pos}\n%%EOF"
    ).encode()
    return out


@pytest.fixture
def make_pdf_bytes():
    """Factory fixture that produces a minimal PDF containing the given text."""
    return _build_minimal_pdf
