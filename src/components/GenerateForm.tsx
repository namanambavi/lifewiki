"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GenerationStatus, LogEntry } from "@/lib/types";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function GenerateForm() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [error, setError] = useState("");
  const [personSlug, setPersonSlug] = useState("");
  const router = useRouter();

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setError("");

    // Derive slug from name for polling
    const inputName = url.trim().includes("linkedin.com")
      ? url.trim().split("/in/")[1]?.replace(/\/$/, "").split("-").join(" ") || "unknown"
      : url.trim();
    const slug = slugify(inputName);
    setPersonSlug(slug);

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

      const responseData = await res.json();
      const actualSlug = responseData.personSlug || slug;
      setPersonSlug(actualSlug);

      const poll = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/status/${actualSlug}`);
          const statusData: GenerationStatus = await statusRes.json();
          setStatus(statusData);
          // Redirect as soon as there's at least 1 article (progressive rendering)
          // The wiki is viewable now — remaining articles generate in background
          if (statusData.completedArticles > 0 && statusData.phase === "generating") {
            clearInterval(poll);
            router.push(`/${actualSlug}`);
          }
          if (statusData.phase === "complete") {
            clearInterval(poll);
            router.push(`/${actualSlug}`);
          }
          if (statusData.phase === "error") {
            clearInterval(poll);
            setError(statusData.error || "Generation failed");
          }
        } catch {
          // ignore transient fetch errors
        }
      }, 1000);
    } catch {
      setError("Failed to connect to server");
    }
  }

  return (
    <div>
      {!status && (
        <form onSubmit={handleGenerate} style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="linkedin.com/in/yourname or a name like 'Elon Musk'"
            style={{ padding: "8px 12px", border: "2px solid #36c", borderRadius: "4px", width: "400px", fontSize: "14px" }}
          />
          <button
            type="submit"
            style={{ background: "#36c", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "4px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
          >
            Generate Wiki
          </button>
        </form>
      )}

      {status && status.phase !== "complete" && (
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
            <p style={{ color: "#54595d", fontSize: "12px" }}>Current: {status.currentArticle}</p>
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

          {/* Log feed */}
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
      )}

      {error && (
        <p style={{ color: "#ba0000", marginTop: "12px", fontFamily: "sans-serif", fontSize: "13px", textAlign: "center" }}>
          {error}
        </p>
      )}
    </div>
  );
}
