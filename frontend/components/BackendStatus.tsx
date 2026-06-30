"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

type Status = "checking" | "ok" | "error";

export default function BackendStatus() {
  const [healthStatus, setHealthStatus] = useState<Status>("checking");
  const [authStatus, setAuthStatus] = useState<Status>("checking");
  const [authDetail, setAuthDetail] = useState<string>("");

  useEffect(() => {
    apiGet<{ status: string }>("/health")
      .then(() => setHealthStatus("ok"))
      .catch(() => setHealthStatus("error"));

    apiGet<{ user_id: string; email: string }>("/auth/me")
      .then((res) => {
        setAuthStatus("ok");
        setAuthDetail(res.email);
      })
      .catch((err) => {
        setAuthStatus("error");
        setAuthDetail(err.message);
      });
  }, []);

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <p>
        {healthStatus === "checking" && "Checking backend…"}
        {healthStatus === "ok" && <span className="text-green-700">✓ Backend is reachable</span>}
        {healthStatus === "error" && <span className="text-red-700">✗ Backend unreachable</span>}
      </p>
      <p>
        {authStatus === "checking" && "Checking authenticated request…"}
        {authStatus === "ok" && (
          <span className="text-green-700">✓ Backend verified your token (signed in as {authDetail})</span>
        )}
        {authStatus === "error" && (
          <span className="text-red-700">✗ Backend rejected the token: {authDetail}</span>
        )}
      </p>
    </div>
  );
}
