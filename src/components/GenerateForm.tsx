"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { GenerationStatus, LogEntry } from "@/lib/types";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function GenerateForm() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const startGeneration = useCallback(async () => {
    const value = input.trim();
    if (!value || loading) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          value.includes("linkedin.com")
            ? { linkedinUrl: value }
            : { name: value }
        ),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to start generation");
        setLoading(false);
        return;
      }

      const personSlug = data.personSlug || slugify(value);

      // Start showing progress immediately
      setStatus({
        phase: "fetching",
        totalArticles: 0,
        completedArticles: 0,
        currentArticle: "Starting research agent...",
      });

      // Poll for status updates
      const poll = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/status/${personSlug}`);
          const statusData: GenerationStatus = await statusRes.json();
          setStatus(statusData);

          // Redirect as soon as first article is ready (progressive rendering)
          if (statusData.completedArticles > 0) {
            clearInterval(poll);
            router.push(`/${personSlug}`);
          }
          if (statusData.phase === "complete") {
            clearInterval(poll);
            router.push(`/${personSlug}`);
          }
          if (statusData.phase === "error") {
            clearInterval(poll);
            setError(statusData.error || "Generation failed");
            setStatus(null);
            setLoading(false);
          }
        } catch {
          // transient fetch error, keep polling
        }
      }, 2000);
    } catch {
      setError("Failed to connect to server");
      setLoading(false);
    }
  }, [input, loading, router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startGeneration();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      startGeneration();
    }
  }

  // Show progress view
  if (status) {
    return (
      <div style={{ fontFamily: "sans-serif", fontSize: "14px", textAlign: "center" }}>
        <p style={{ marginBottom: "8px" }}>
          <b>
            {status.phase === "fetching"
              ? "Researching on the web..."
              : status.phase === "planning"
                ? "Planning articles..."
                : status.phase === "generating"
                  ? `Generating articles (${status.completedArticles}/${status.totalArticles})...`
                  : "Finalizing..."}
          </b>
        </p>
        {status.currentArticle && (
          <p style={{ color: "#54595d", fontSize: "12px" }}>
            {status.currentArticle}
          </p>
        )}
        <div style={{ width: "300px", height: "4px", background: "#e8e8e8", borderRadius: "2px", margin: "12px auto" }}>
          <div
            style={{
              width: `${status.totalArticles > 0 ? (status.completedArticles / status.totalArticles) * 100 : 10}%`,
              height: "100%",
              background: "#36c",
              borderRadius: "2px",
              transition: "width 0.3s",
            }}
          />
        </div>

        {status.log && status.log.length > 0 && (
          <div
            style={{
              maxWidth: "500px",
              margin: "16px auto 0",
              textAlign: "left",
              maxHeight: "200px",
              overflowY: "auto",
              border: "1px solid #eaecf0",
              borderRadius: "4px",
              padding: "8px",
              background: "#fff",
            }}
          >
            {status.log.map((entry: LogEntry, i: number) => (
              <div
                key={i}
                style={{
                  fontSize: "12px",
                  padding: "2px 0",
                  color:
                    entry.type === "research"
                      ? "#0066cc"
                      : entry.type === "article"
                        ? "#228B22"
                        : entry.type === "error"
                          ? "#ba0000"
                          : "#54595d",
                  fontFamily: "monospace",
                }}
              >
                <span style={{ color: "#a2a9b1", marginRight: "4px" }}>
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                {entry.message}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Show form
  return (
    <div>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste a LinkedIn URL or type a name"
          disabled={loading}
          style={{
            padding: "8px 12px",
            border: "2px solid #36c",
            borderRadius: "4px",
            width: "400px",
            fontSize: "14px",
            opacity: loading ? 0.6 : 1,
          }}
        />
        <button
          type="submit"
          onClick={(e) => { e.preventDefault(); startGeneration(); }}
          disabled={loading}
          style={{
            background: loading ? "#8899bb" : "#36c",
            color: "#fff",
            border: "none",
            padding: "8px 16px",
            borderRadius: "4px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Starting..." : "Generate Wiki"}
        </button>
      </form>

      {error && (
        <p style={{ color: "#ba0000", marginTop: "12px", fontFamily: "sans-serif", fontSize: "13px", textAlign: "center" }}>
          {error}
        </p>
      )}
    </div>
  );
}
