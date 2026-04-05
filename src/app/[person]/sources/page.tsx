import fs from "fs/promises";
import path from "path";
import { getRawDir } from "@/lib/wiki-io";

interface Props {
  params: Promise<{ person: string }>;
}

interface SourceFile {
  name: string;
  dir: string;
  size: number;
}

export default async function PersonSourcesPage({ params }: Props) {
  const { person } = await params;
  const rawDir = getRawDir(person);

  const sources: SourceFile[] = [];

  async function walk(dir: string, prefix: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath, `${prefix}${entry.name}/`);
        } else {
          const stat = await fs.stat(fullPath);
          sources.push({
            name: entry.name,
            dir: prefix,
            size: stat.size,
          });
        }
      }
    } catch {
      // directory may not exist
    }
  }

  await walk(rawDir, "");

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "16px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "20px", marginBottom: "8px" }}>Raw Sources</h1>
      <p style={{ fontSize: "13px", color: "#54595d", marginBottom: "16px" }}>
        {sources.length} source file{sources.length !== 1 ? "s" : ""} collected during research
      </p>

      {sources.length === 0 ? (
        <p style={{ fontSize: "14px", color: "#54595d" }}>No raw sources found.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #a2a9b1", textAlign: "left" }}>
              <th style={{ padding: "8px 4px" }}>Directory</th>
              <th style={{ padding: "8px 4px" }}>File</th>
              <th style={{ padding: "8px 4px" }}>Size</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #eaecf0" }}>
                <td style={{ padding: "6px 4px", color: "#54595d" }}>{source.dir || "/"}</td>
                <td style={{ padding: "6px 4px" }}>{source.name}</td>
                <td style={{ padding: "6px 4px", color: "#54595d" }}>
                  {source.size < 1024
                    ? `${source.size} B`
                    : source.size < 1048576
                      ? `${(source.size / 1024).toFixed(1)} KB`
                      : `${(source.size / 1048576).toFixed(1)} MB`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
