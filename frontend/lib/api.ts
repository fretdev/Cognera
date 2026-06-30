import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

// Client-component-only helper: pulls the current session's access token and
// attaches it as a Bearer token so the FastAPI backend can verify who's
// calling. Routes that don't need auth simply ignore the header.
async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);

  // Don't set Content-Type manually here — the browser needs to set its
  // own multipart boundary, which it can only do if you let it.
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: await authHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}
