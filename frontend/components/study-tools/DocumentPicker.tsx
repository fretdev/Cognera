"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

type Document = { id: string; title: string };

export default function DocumentPicker({
  selected,
  onChange,
  count,
  onCountChange,
  countLabel,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  count: number;
  onCountChange: (n: number) => void;
  countLabel: string;
}) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<Document[]>("/documents")
      .then(setDocuments)
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    onChange(
      selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]
    );
  }

  if (loading) return <p className="text-sm text-muted">Loading documents…</p>;

  if (documents.length === 0) {
    return (
      <p className="text-sm text-muted">
        No documents yet — upload something on the Documents page first.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-xs font-medium text-muted">SOURCE DOCUMENTS</p>
        <div className="flex flex-col gap-1.5">
          {documents.map((doc) => (
            <label
              key={doc.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-ink transition-colors hover:bg-surface"
            >
              <input
                type="checkbox"
                checked={selected.includes(doc.id)}
                onChange={() => toggle(doc.id)}
                className="accent-[#4285F4]"
              />
              <span className="truncate">{doc.title}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium text-muted">
          {countLabel}
        </label>
        <input
          type="number"
          min={1}
          max={25}
          value={count}
          onChange={(e) => onCountChange(Number(e.target.value))}
          className="w-24 rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink outline-none"
        />
      </div>
    </div>
  );
}
