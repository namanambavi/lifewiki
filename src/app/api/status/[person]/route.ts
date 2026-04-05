import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import type { GenerationStatus } from "@/lib/types";

interface Props {
  params: Promise<{ person: string }>;
}

export async function GET(_request: Request, { params }: Props) {
  const { person } = await params;
  const statusPath = path.join(process.cwd(), "data/users", person, "generation-status.json");
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
