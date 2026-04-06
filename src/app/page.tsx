import GenerateForm from "@/components/GenerateForm";
import Link from "next/link";

export default function Home() {
  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "60px 20px 40px", fontFamily: "sans-serif" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "40px" }}>
        <h1 style={{ fontSize: "42px", marginBottom: "8px", fontFamily: "'Linux Libertine', Georgia, serif", fontWeight: "normal" }}>
          lifewiki
        </h1>
        <p style={{ color: "#54595d", fontSize: "18px", marginBottom: "8px" }}>
          Your life, as a Wikipedia.
        </p>
        <p style={{ color: "#72777d", fontSize: "14px", marginBottom: "32px" }}>
          Type any name. An AI agent researches the web and generates a full personal encyclopedia
          with 50+ interlinked Wikipedia-style articles.
        </p>
      </div>

      {/* Generate Form */}
      <div style={{ marginBottom: "48px" }}>
        <GenerateForm />
      </div>

      {/* Example */}
      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <p style={{ fontSize: "13px", color: "#72777d", marginBottom: "8px" }}>
          See an example:
        </p>
        <Link
          href="/naman-ambavi"
          style={{
            color: "#36c",
            fontSize: "15px",
            textDecoration: "none",
            borderBottom: "1px solid #b8cce8",
          }}
        >
          Namanopedia — 50 articles about Naman Ambavi
        </Link>
      </div>

      {/* How it works */}
      <div style={{ borderTop: "1px solid #eaecf0", paddingTop: "32px", marginBottom: "32px" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: "#202122" }}>
          How it works
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", fontSize: "13px", color: "#54595d" }}>
          <div>
            <div style={{ fontSize: "24px", marginBottom: "6px" }}>1</div>
            <div style={{ fontWeight: 600, color: "#202122", marginBottom: "4px" }}>Research</div>
            An AI agent searches the web for the person, their companies, schools, and achievements.
          </div>
          <div>
            <div style={{ fontSize: "24px", marginBottom: "6px" }}>2</div>
            <div style={{ fontWeight: 600, color: "#202122", marginBottom: "4px" }}>Compile</div>
            Every discovery becomes a Wikipedia article with infoboxes, citations, and cross-references.
          </div>
          <div>
            <div style={{ fontSize: "24px", marginBottom: "6px" }}>3</div>
            <div style={{ fontWeight: 600, color: "#202122", marginBottom: "4px" }}>Browse</div>
            50+ interlinked articles. Click any company, school, or person to read their article.
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: "1px solid #eaecf0",
        paddingTop: "24px",
        textAlign: "center",
        fontSize: "13px",
        color: "#72777d",
      }}>
        <p style={{ marginBottom: "12px" }}>
          Open source. MIT license.
        </p>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "16px" }}>
          <a
            href="https://github.com/namanambavi/lifewiki"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#36c", textDecoration: "none", display: "flex", alignItems: "center", gap: "4px" }}
          >
            <svg height="16" width="16" viewBox="0 0 16 16" fill="#54595d">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            GitHub
          </a>
          <span style={{ color: "#c8ccd1" }}>|</span>
          <a
            href="https://mylife.wiki"
            style={{ color: "#36c", textDecoration: "none" }}
          >
            mylife.wiki
          </a>
          <span style={{ color: "#c8ccd1" }}>|</span>
          <span>MIT License</span>
        </div>
        <p style={{ marginTop: "16px", fontSize: "11px", color: "#a2a9b1" }}>
          Encyclopedias are AI-generated and may contain inaccuracies. Not affiliated with Wikipedia or the Wikimedia Foundation.
        </p>
      </div>
    </div>
  );
}
