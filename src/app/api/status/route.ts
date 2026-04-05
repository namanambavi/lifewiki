import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import type { GenerationStatus } from "@/lib/types";

export async function GET() {
  const statusPath = path.join(process.cwd(), "data/generation-status.json");
  try {
    const raw = await fs.readFile(statusPath, "utf-8");
    const status: GenerationStatus = JSON.parse(raw);
    return NextResponse.json(status);
  } catch {
    return NextResponse.json({
      phase: "complete",
      totalArticles: 0,
      completedArticles: 0,
      currentArticle: "",
    });
  }
}
