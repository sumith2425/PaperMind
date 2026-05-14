"""Document ingestion: parsing, chunking, embedding, persistence."""

from __future__ import annotations

import json
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import List

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from . import config, vectorstore


SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".md", ".markdown"}


@dataclass
class IndexedDocument:
    id: str
    name: str
    extension: str
    size_bytes: int
    chunk_count: int
    uploaded_at: float


# ---------------------------------------------------------------------------
# Persistence: tiny JSON index of uploaded documents
# ---------------------------------------------------------------------------


def _load_index() -> List[IndexedDocument]:
    if not config.DOCUMENTS_INDEX_FILE.exists():
        return []
    try:
        raw = json.loads(config.DOCUMENTS_INDEX_FILE.read_text())
        return [IndexedDocument(**item) for item in raw]
    except Exception:
        return []


def _save_index(docs: List[IndexedDocument]) -> None:
    config.DOCUMENTS_INDEX_FILE.write_text(
        json.dumps([asdict(d) for d in docs], indent=2)
    )


def list_documents() -> List[IndexedDocument]:
    """Return all indexed documents, newest first."""
    docs = _load_index()
    docs.sort(key=lambda d: d.uploaded_at, reverse=True)
    return docs


def get_document(document_id: str) -> IndexedDocument | None:
    for d in _load_index():
        if d.id == document_id:
            return d
    return None


def delete_document(document_id: str) -> bool:
    """Remove a document's chunks from Chroma and its file from disk."""
    docs = _load_index()
    target = next((d for d in docs if d.id == document_id), None)
    if target is None:
        return False

    vectorstore.delete_by_document_id(document_id)

    file_path = config.UPLOADS_DIR / f"{document_id}{target.extension}"
    if file_path.exists():
        try:
            file_path.unlink()
        except OSError:
            pass

    _save_index([d for d in docs if d.id != document_id])
    return True


# ---------------------------------------------------------------------------
# Parsing & chunking
# ---------------------------------------------------------------------------


def _read_pdf_pages(path: Path) -> List[tuple[int, str]]:
    """Return [(page_number, text), ...] for each non-empty page (1-indexed)."""
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    out: List[tuple[int, str]] = []
    for i, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        if text.strip():
            out.append((i, text))
    return out


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def ingest_file(
    *, original_name: str, file_bytes: bytes
) -> IndexedDocument:
    """Save bytes to disk, chunk, embed, and index. Returns the metadata."""

    extension = Path(original_name).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type {extension!r}. "
            f"Allowed: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    document_id = uuid.uuid4().hex
    target_path = config.UPLOADS_DIR / f"{document_id}{extension}"
    target_path.write_bytes(file_bytes)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=config.CHUNK_SIZE,
        chunk_overlap=config.CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    # Build (chunk_text, page_number) tuples. PDFs get real page numbers;
    # plain-text/markdown files have no page concept (page = None).
    chunk_pages: List[tuple[str, int | None]] = []
    if extension == ".pdf":
        for page_num, page_text in _read_pdf_pages(target_path):
            for piece in splitter.split_text(page_text):
                if piece.strip():
                    chunk_pages.append((piece, page_num))
    else:
        text = _read_text(target_path)
        for piece in splitter.split_text(text):
            if piece.strip():
                chunk_pages.append((piece, None))

    if not chunk_pages:
        # Clean up the empty upload before raising so the caller can show an error.
        try:
            target_path.unlink()
        except OSError:
            pass
        raise ValueError(
            "No readable text could be extracted from this file."
        )

    docs: List[Document] = []
    ids: List[str] = []
    for i, (chunk, page) in enumerate(chunk_pages):
        ids.append(f"{document_id}:{i}")
        meta: dict = {
            "document_id": document_id,
            "document_name": original_name,
            "chunk_index": i,
        }
        if page is not None:
            meta["page"] = page
        docs.append(Document(page_content=chunk, metadata=meta))

    vectorstore.add_documents(docs, ids)

    record = IndexedDocument(
        id=document_id,
        name=original_name,
        extension=extension,
        size_bytes=len(file_bytes),
        chunk_count=len(chunk_pages),
        uploaded_at=time.time(),
    )

    index = _load_index()
    index.append(record)
    _save_index(index)
    return record
