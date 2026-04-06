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
  const [name, setName] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const startGeneration = useCallback(async () => {
    const nameVal = name.trim();
    const urlVal = linkedinUrl.trim();
    if ((!nameVal && !urlVal) || loading) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameVal || undefined,
          linkedinUrl: urlVal || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to start generation");
        setLoading(false);
        return;
      }

      const personSlug = data.personSlug || slugify(nameVal || "unknown");

      setStatus({
        phase: "fetching",
        totalArticles: 0,
        completedArticles: 0,
        currentArticle: "Starting research agent...",
      });

      const poll = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/status/${personSlug}`);
          const statusData: GenerationStatus = await statusRes.json();
          setStatus(statusData);

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
          // transient fetch error
        }
      }, 2000);
    } catch {
      setError("Failed to connect to server");
      setLoading(false);
    }
  }, [name, linkedinUrl, loading, router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startGeneration();
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

  // Show form with two fields
  return (
    <div>
      <form onSubmit={handleSubmit} style={{ maxWidth: "480px", margin: "0 auto" }}>
        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", fontSize: "13px", color: "#54595d", marginBottom: "4px", fontFamily: "sans-serif" }}>
            Full name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jensen Huang"
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #a2a9b1",
              borderRadius: "4px",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", color: "#54595d", marginBottom: "4px", fontFamily: "sans-serif" }}>
            LinkedIn URL <span style={{ color: "#a2a9b1" }}>(optional, improves research)</span>
          </label>
          <input
            type="text"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="linkedin.com/in/jensenhuang"
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #a2a9b1",
              borderRadius: "4px",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />
        </div>
        <button
          type="submit"
          disabled={loading || (!name.trim() && !linkedinUrl.trim())}
          style={{
            width: "100%",
            background: loading ? "#8899bb" : "#36c",
            color: "#fff",
            border: "none",
            padding: "10px 16px",
            borderRadius: "4px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Starting..." : "Generate Encyclopedia"}
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
