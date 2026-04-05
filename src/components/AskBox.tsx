"use client";
import { useState } from "react";

export default function AskBox() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setAnswer("");
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: question.trim() }) });
      const data = await res.json();
      setAnswer(data.answer || data.error || "No answer");
    } catch { setAnswer("Error connecting to server"); }
    finally { setLoading(false); }
  }

  return (
    <div className="section-box">
      <div className="section-header" style={{ background: "#e1d5e7", borderBottom: "1px solid #a2a9b1" }}>Ask this encyclopedia</div>
      <div className="section-body" style={{ fontFamily: "sans-serif" }}>
        <form onSubmit={handleAsk} style={{ display: "flex", gap: "4px" }}>
          <input type="text" value={question} onChange={e => setQuestion(e.target.value)} placeholder="e.g. What connects them to TensorFlow?" style={{ flex: 1, padding: "4px 8px", border: "1px solid #a2a9b1", fontSize: "12px" }} />
          <button type="submit" disabled={loading} style={{ background: "#f8f9fa", border: "1px solid #a2a9b1", padding: "4px 10px", fontSize: "12px", cursor: "pointer" }}>{loading ? "..." : "Ask"}</button>
        </form>
        {answer && <div style={{ marginTop: "8px", fontSize: "13px", lineHeight: 1.6 }}>{answer}</div>}
      </div>
    </div>
  );
}
