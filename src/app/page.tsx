import fs from "fs";
import path from "path";
import MainPage from "@/components/MainPage";
import { MainPageData } from "@/lib/types";

const MAIN_PAGE_JSON = path.join(process.cwd(), "data/wiki/main-page.json");

export default function Home() {
  const exists = fs.existsSync(MAIN_PAGE_JSON);

  if (exists) {
    const raw = fs.readFileSync(MAIN_PAGE_JSON, "utf-8");
    const data: MainPageData = JSON.parse(raw);
    return <MainPage data={data} />;
  }

  // Empty state — no wiki generated yet
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "sans-serif",
        background: "#f8f9fa",
        padding: "24px",
      }}
    >
      <h1
        style={{
          fontSize: "36px",
          fontWeight: "bold",
          color: "#202122",
          marginBottom: "12px",
        }}
      >
        WikiPeople
      </h1>
      <p
        style={{
          fontSize: "16px",
          color: "#54595d",
          marginBottom: "28px",
          textAlign: "center",
        }}
      >
        Paste a LinkedIn URL. Get your own Wikipedia.
      </p>
      <form
        style={{
          display: "flex",
          gap: "8px",
          width: "100%",
          maxWidth: "480px",
        }}
      >
        <input
          type="url"
          name="linkedinUrl"
          placeholder="https://linkedin.com/in/yourprofile"
          style={{
            flex: 1,
            padding: "10px 14px",
            border: "2px solid #36c",
            borderRadius: "4px",
            fontSize: "14px",
            outline: "none",
          }}
        />
        <button
          type="submit"
          style={{
            background: "#36c",
            color: "#fff",
            border: "none",
            padding: "10px 20px",
            borderRadius: "4px",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          Generate Wiki
        </button>
      </form>
    </main>
  );
}
