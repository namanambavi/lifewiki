import GenerateForm from "@/components/GenerateForm";

export default function Home() {
  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 20px", fontFamily: "sans-serif" }}>
      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <h1 style={{ fontSize: "36px", marginBottom: "8px", fontFamily: "'Linux Libertine', Georgia, serif", fontWeight: "normal" }}>
          WikiPeople
        </h1>
        <p style={{ color: "#54595d", fontSize: "16px", marginBottom: "32px" }}>
          Paste a name. Get their entire Wikipedia.
        </p>
        <GenerateForm />
      </div>
    </div>
  );
}
