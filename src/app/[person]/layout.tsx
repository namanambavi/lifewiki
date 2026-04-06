import fs from "fs";
import path from "path";
import WikiHeader from "@/components/WikiHeader";
import WikiTabs from "@/components/WikiTabs";
import type { MainPageData } from "@/lib/types";

interface PersonLayoutProps {
  children: React.ReactNode;
  params: Promise<{ person: string }>;
}

export default async function PersonLayout({ children, params }: PersonLayoutProps) {
  const { person } = await params;
  const mainPagePath = path.join(process.cwd(), "data/users", person, "wiki", "main-page.json");

  let encyclopediaName = "MyLife.wiki";
  try {
    if (fs.existsSync(mainPagePath)) {
      const raw = fs.readFileSync(mainPagePath, "utf-8");
      const data: MainPageData = JSON.parse(raw);
      encyclopediaName = data.encyclopediaName;
    }
  } catch {
    // fallback to default name
  }

  return (
    <>
      <WikiHeader encyclopediaName={encyclopediaName} personSlug={person} />
      <WikiTabs personSlug={person} />
      {children}
    </>
  );
}
