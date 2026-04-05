import Link from "next/link";
import { listPeople } from "@/lib/wiki-io";
import GenerateForm from "@/components/GenerateForm";

export default async function Home() {
  const people = await listPeople();

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 20px", fontFamily: "sans-serif" }}>
      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: "48px" }}>
        <h1 style={{ fontSize: "36px", marginBottom: "8px", fontFamily: "'Linux Libertine', Georgia, serif", fontWeight: "normal" }}>
          WikiPeople
        </h1>
        <p style={{ color: "#54595d", fontSize: "16px", marginBottom: "32px" }}>
          Paste a name. Get their entire Wikipedia.
        </p>
        <GenerateForm />
      </div>

      {/* Existing encyclopedias grid */}
      {people.length > 0 && (
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "16px", borderBottom: "1px solid #a2a9b1", paddingBottom: "8px" }}>
            Existing Encyclopedias
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
            {people.map((person) => {
              const firstName = person.name.split(" ")[0];
              return (
                <Link
                  key={person.slug}
                  href={`/${person.slug}`}
                  style={{
                    display: "block",
                    background: "#fff",
                    border: "1px solid #a2a9b1",
                    borderRadius: "2px",
                    padding: "16px",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ fontSize: "16px", fontWeight: "bold", color: "#3366cc", marginBottom: "4px" }}>
                    {person.name}
                  </div>
                  <div style={{ fontSize: "13px", color: "#54595d", marginBottom: "8px" }}>
                    {firstName}opedia
                  </div>
                  <div style={{ fontSize: "12px", color: "#72777d" }}>
                    {person.articleCount} article{person.articleCount !== 1 ? "s" : ""}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
