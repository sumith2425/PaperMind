"""Tests for document ingestion and deletion."""

from __future__ import annotations

import pytest
from langchain_text_splitters import RecursiveCharacterTextSplitter

from backend.app import config, documents, vectorstore


def _expected_chunks(text: str) -> int:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=config.CHUNK_SIZE,
        chunk_overlap=config.CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    return len(splitter.split_text(text))


def test_ingest_txt_produces_expected_chunks(monkeypatch):
    monkeypatch.setattr(config, "CHUNK_SIZE", 200)
    monkeypatch.setattr(config, "CHUNK_OVERLAP", 40)

    text = (
        "Mini Jarvis is a small assistant. " * 80
        + "\n\nIt uses retrieval augmented generation. " * 40
    )

    record = documents.ingest_file(
        original_name="notes.txt", file_bytes=text.encode("utf-8")
    )

    expected = _expected_chunks(text)
    assert expected > 1, "fixture text must produce multiple chunks"
    assert record.chunk_count == expected
    assert vectorstore.collection_size() == expected
    assert (config.UPLOADS_DIR / f"{record.id}.txt").exists()
    assert documents.get_document(record.id) is not None


def test_ingest_pdf_produces_expected_chunks(monkeypatch, make_pdf_bytes):
    monkeypatch.setattr(config, "CHUNK_SIZE", 120)
    monkeypatch.setattr(config, "CHUNK_OVERLAP", 20)

    sentence = "Mini Jarvis routes between RAG and web search. "
    pdf_bytes = make_pdf_bytes(sentence * 12)

    record = documents.ingest_file(
        original_name="paper.pdf", file_bytes=pdf_bytes
    )

    # PDFs are now chunked per-page so citations can include page numbers.
    from backend.app.documents import _read_pdf_pages

    pages = _read_pdf_pages(config.UPLOADS_DIR / f"{record.id}.pdf")
    expected = sum(_expected_chunks(text) for _, text in pages)

    assert expected >= 1
    assert record.chunk_count == expected
    assert vectorstore.collection_size() == expected
    assert (config.UPLOADS_DIR / f"{record.id}.pdf").exists()


def test_ingest_rejects_unsupported_extension():
    with pytest.raises(ValueError):
        documents.ingest_file(original_name="bad.docx", file_bytes=b"x")


def test_ingest_rejects_empty_text():
    with pytest.raises(ValueError):
        documents.ingest_file(original_name="empty.txt", file_bytes=b"   \n")


def test_delete_cleans_chroma_and_disk():
    text = "Hello world. " * 200
    record = documents.ingest_file(
        original_name="story.txt", file_bytes=text.encode()
    )
    file_path = config.UPLOADS_DIR / f"{record.id}.txt"

    assert file_path.exists()
    assert vectorstore.collection_size() == record.chunk_count
    assert documents.get_document(record.id) is not None

    assert documents.delete_document(record.id) is True

    assert not file_path.exists(), "uploaded file should be removed from disk"
    assert vectorstore.collection_size() == 0, "Chroma chunks should be gone"
    assert documents.get_document(record.id) is None
    assert documents.delete_document(record.id) is False


def test_delete_only_removes_target_document():
    """Deleting one doc must not nuke chunks belonging to another."""

    rec_a = documents.ingest_file(
        original_name="a.txt", file_bytes=(b"alpha. " * 200)
    )
    rec_b = documents.ingest_file(
        original_name="b.txt", file_bytes=(b"bravo. " * 200)
    )

    total_before = vectorstore.collection_size()
    assert total_before == rec_a.chunk_count + rec_b.chunk_count

    documents.delete_document(rec_a.id)

    assert vectorstore.collection_size() == rec_b.chunk_count
    assert documents.get_document(rec_b.id) is not None
