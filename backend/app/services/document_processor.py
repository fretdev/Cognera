"""
PDF text extraction + chunking — the first two steps of the RAG pipeline.
extract_text() pulls plain text out of a PDF; chunk_text() splits that into
overlapping windows small enough to embed and retrieve individually.
"""
import fitz  # PyMuPDF


def extract_text(pdf_bytes: bytes) -> str:
    """Extract plain text from a PDF's raw bytes.

    Raises if the bytes aren't a valid PDF — callers should treat that as
    a 400 (bad input), not a 500 (server bug)."""
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        return "\n\n".join(page.get_text() for page in doc)


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """Split text into overlapping word-count chunks.

    Overlap means each chunk shares a few words with its neighbor, so an
    idea that straddles a chunk boundary doesn't get cut in a way that
    breaks retrieval. 500 words is a reasonable default for course-material
    PDFs — small enough for precise retrieval, large enough to hold context.
    """
    words = text.split()
    if not words:
        return []

    chunks = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunk = " ".join(words[start:end])
        if chunk.strip():
            chunks.append(chunk)
        start += chunk_size - overlap

    return chunks
