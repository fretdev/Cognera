"use client";

import { useEffect, useState } from "react";
import { apiGet, apiUpload } from "@/lib/api";

type Document = {
  id: string;
  title: string;
  summary: string | null;
  created_at: string;
};

export default function DocumentsPanel() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState("");
  const [loadingList, setLoadingList] = useState(true);

  async function loadDocuments() {
    setLoadingList(true);
    try {
      const docs = await apiGet<Document[]>("/documents");
      setDocuments(docs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setStatus("uploading");
    setError("");
    try {
      await apiUpload("/documents/upload", file);
      setFile(null);
      await loadDocuments();
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Your documents</h1>
      <p className="mt-1 text-sm text-muted">
        Upload course material as a PDF — it gets indexed so you can ask
        questions about it in chat.
      </p>

      <form
        onSubmit={handleUpload}
        className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5"
      >
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 py-8 text-center transition-colors hover:bg-bg">
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <span className="text-sm font-medium text-ink">
            {file ? file.name : "Click to choose a PDF"}
          </span>
          <span className="mt-1 text-xs text-muted">Up to 20MB</span>
        </label>

        <button
          type="submit"
          disabled={!file || status === "uploading"}
          className="gradient-bg rounded-full px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {status === "uploading" ? "Uploading & processing…" : "Upload PDF"}
        </button>

        {status === "error" && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-xs text-muted">
          Processing extracts text, splits it into chunks, and embeds each
          chunk — larger PDFs may take a little while.
        </p>
      </form>

      <h2 className="mb-3 mt-10 text-sm font-medium text-muted">Uploaded</h2>
      {loadingList && <p className="text-sm text-muted">Loading…</p>}
      {!loadingList && documents.length === 0 && (
        <p className="text-sm text-muted">
          Nothing here yet — upload your first PDF above.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className="rounded-xl border border-border bg-surface p-4 text-sm"
          >
            <p className="font-medium text-ink">{doc.title}</p>
            <p className="mt-0.5 text-xs text-muted">
              {new Date(doc.created_at).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
