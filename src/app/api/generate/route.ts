import { NextRequest, NextResponse } from "next/server";
import { fetchLinkedInProfile } from "@/lib/linkedin";
import { generateEncyclopedia } from "@/lib/wiki-engine";
import fs from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;
    if (!url) return NextResponse.json({ error: "LinkedIn URL is required" }, { status: 400 });

    const profile = await fetchLinkedInProfile(url);
    const rawDir = path.join(process.cwd(), "data/raw/linkedin");
    await fs.mkdir(rawDir, { recursive: true });
    await fs.writeFile(path.join(rawDir, "profile.json"), JSON.stringify(profile, null, 2), "utf-8");

    // Fire and forget — status is polled via /api/status
    generateEncyclopedia(profile).catch((err) => console.error("Generation failed:", err));

    return NextResponse.json({ status: "started", name: profile.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
