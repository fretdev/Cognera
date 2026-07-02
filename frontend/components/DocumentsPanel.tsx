"use client";

import { useEffect, useState } from "react";
import { Trash2, Upload, FileText } from "lucide-react";
import { apiGet, apiUpload, apiDelete } from "@/lib/api";

type Document = { id: string; title: string; summary: string | null; created_at: string };

export default function DocumentsPanel() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  // Maps doc id → confirm state. First click = "confirm?", second = delete.
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadDocuments() {
    setLoadingList(true);
    try {
      const docs = await apiGet<Document[]>("/documents");
      setDocuments(docs);
    } catch {
      // silent
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => { loadDocuments(); }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setStatus("uploading");
    setError("");
    try {
      await apiUpload("/documents/upload", file);
      setFile(null);
      const input = document.getElementById("file-input") as HTMLInputElement;
      if (input) input.value = "";
      await loadDocuments();
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (deletingId === id) {
      // Second click — actually delete.
      try {
        await apiDelete(`/documents/${id}`);
        setDocuments((prev) => prev.filter((d) => d.id !== id));
      } catch {
        // silent — document may already be gone
      }
      setDeletingId(null);
    } else {
      // First click — ask for confirmation.
      setDeletingId(id);
      setTimeout(() => setDeletingId((cur) => (cur === id ? null : cur)), 3000);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-medium text-ink">Documents</h1>
      <p className="mt-2 text-sm text-muted">
        Upload PDFs to enable source-grounded chat, summarization, and quiz
        generation.
      </p>

      <form
        onSubmit={handleUpload}
        className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5"
      >
        <label
          htmlFor="file-input"
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted transition-colors hover:bg-bg"
        >
          <Upload size={18} strokeWidth={1.75} />
          <span>{file ? file.name : "Choose a PDF to upload…"}</span>
        </label>
        <input
          id="file-input"
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="submit"
          disabled={!file || status === "uploading"}
          className="btn-primary w-full justify-center"
        >
          {status === "uploading" ? "Uploading & processing…" : "Upload PDF"}
        </button>
        {status === "error" && (
          <p className="text-sm text-[#f28b82]">{error}</p>
        )}
        <p className="text-xs text-muted">
          Text is extracted, chunked, and embedded on upload. Large PDFs may
          take a few seconds.
        </p>
      </form>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-muted">Uploaded</h2>
        {loadingList && <p className="text-sm text-muted">Loading…</p>}
        {!loadingList && documents.length === 0 && (
          <p className="text-sm text-muted">No documents yet.</p>
        )}
        <ul className="flex flex-col gap-2">
          {documents.map((doc) => {
            const confirming = deletingId === doc.id;
            return (
              <li
                key={doc.id}
                className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <FileText
                  size={16}
                  strokeWidth={1.75}
                  className="flex-shrink-0 text-muted"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {doc.title}
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(doc.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, doc.id)}
                  aria-label={
                    confirming
                      ? "Click again to confirm deletion"
                      : "Delete document"
                  }
                  className={`flex-shrink-0 rounded-md p-1.5 transition-colors ${
                    confirming
                      ? "text-[#f28b82]"
                      : "text-muted hover:text-[#f28b82]"
                  }`}
                >
                  <Trash2 size={15} strokeWidth={1.75} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
