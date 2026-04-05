"use client";
import { useState } from "react";
import type { GenerationStatus } from "@/lib/types";

export default function GenerateForm() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [error, setError] = useState("");

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setError("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          url.trim().includes("linkedin.com")
            ? { url: url.trim() }
            : { name: url.trim() }
        ),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to start generation");
        return;
      }

      const poll = setInterval(async () => {
        const statusRes = await fetch("/api/status");
        const statusData: GenerationStatus = await statusRes.json();
        setStatus(statusData);
        if (statusData.phase === "complete") { clearInterval(poll); window.location.reload(); }
        if (statusData.phase === "error") { clearInterval(poll); setError(statusData.error || "Generation failed"); }
      }, 1000);
    } catch { setError("Failed to connect to server"); }
  }

  return (
    <div style={{ textAlign: "center", padding: "80px 20px" }}>
      <h1 style={{ fontSize: "28px", marginBottom: "8px", fontFamily: "'Linux Libertine', Georgia, serif" }}>WikiPeople</h1>
      <p style={{ marginBottom: "24px", color: "#54595d", fontFamily: "sans-serif", fontSize: "14px" }}>Paste a LinkedIn URL or type any name. Get your own Wikipedia.</p>
      {!status && (
        <form onSubmit={handleGenerate} style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
          <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="linkedin.com/in/yourname or a name like 'Elon Musk'" style={{ padding: "8px 12px", border: "2px solid #36c", borderRadius: "4px", width: "400px", fontSize: "14px" }} />
          <button type="submit" style={{ background: "#36c", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "4px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>Generate Wiki</button>
        </form>
      )}
      {status && status.phase !== "complete" && (
        <div style={{ fontFamily: "sans-serif", fontSize: "14px" }}>
          <p style={{ marginBottom: "8px" }}>
            <b>{status.phase === "fetching" ? "Fetching LinkedIn profile..." : status.phase === "planning" ? "Planning articles..." : status.phase === "generating" ? `Generating articles (${status.completedArticles}/${status.totalArticles})...` : "Finalizing..."}</b>
          </p>
          {status.currentArticle && <p style={{ color: "#54595d", fontSize: "12px" }}>Current: {status.currentArticle}</p>}
          <div style={{ width: "300px", height: "4px", background: "#e8e8e8", borderRadius: "2px", margin: "12px auto" }}>
            <div style={{ width: `${status.totalArticles > 0 ? (status.completedArticles / status.totalArticles) * 100 : 10}%`, height: "100%", background: "#36c", borderRadius: "2px", transition: "width 0.3s" }} />
          </div>
        </div>
      )}
      {error && <p style={{ color: "#ba0000", marginTop: "12px", fontFamily: "sans-serif", fontSize: "13px" }}>{error}</p>}
    </div>
  );
}
