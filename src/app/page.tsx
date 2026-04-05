import fs from "fs";
import path from "path";
import MainPage from "@/components/MainPage";
import GenerateForm from "@/components/GenerateForm";
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
  return <GenerateForm />;
}
