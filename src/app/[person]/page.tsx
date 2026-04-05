import fs from "fs";
import path from "path";
import MainPage from "@/components/MainPage";
import { notFound } from "next/navigation";
import type { MainPageData } from "@/lib/types";

interface Props {
  params: Promise<{ person: string }>;
}

export default async function PersonMainPage({ params }: Props) {
  const { person } = await params;
  const mainPagePath = path.join(process.cwd(), "data/users", person, "wiki", "main-page.json");

  try {
    if (!fs.existsSync(mainPagePath)) {
      notFound();
    }
    const raw = fs.readFileSync(mainPagePath, "utf-8");
    const data: MainPageData = JSON.parse(raw);
    return <MainPage data={data} personSlug={person} />;
  } catch {
    notFound();
  }
}
