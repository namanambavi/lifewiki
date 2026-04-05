import { NextRequest, NextResponse } from "next/server";
import { fetchLinkedInProfile } from "@/lib/linkedin";
import type { LinkedInProfile } from "@/lib/types";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, name } = body;

    let profile: LinkedInProfile;

    if (url && process.env.LINKEDIN_API_URL && process.env.LINKEDIN_API_KEY) {
      profile = await fetchLinkedInProfile(url);
    } else {
      const personName = name || extractNameFromUrl(url) || "Test Person";
      profile = {
        name: personName,
        headline: "",
        summary: "",
        location: "",
        positions: [],
        education: [],
        skills: [],
        connections: [],
      };
      if (url) {
        profile.summary = `LinkedIn profile: ${url}`;
      }
    }

    // Save raw data
    const rawDir = path.join(process.cwd(), "data/raw/linkedin");
    await fs.mkdir(rawDir, { recursive: true });
    const profilePath = path.join(rawDir, "profile.json");
    await fs.writeFile(profilePath, JSON.stringify(profile, null, 2), "utf-8");

    // Initialize status file
    const statusPath = path.join(process.cwd(), "data/generation-status.json");
    await fs.writeFile(statusPath, JSON.stringify({
      phase: "fetching",
      totalArticles: 0,
      completedArticles: 0,
      currentArticle: "Starting research agent...",
    }), "utf-8");

    // Spawn worker process — runs Agent SDK natively outside Next.js bundler
    const worker = spawn("npx", ["tsx", "scripts/generate-worker.ts", profilePath], {
      cwd: process.cwd(),
      stdio: "pipe",
      detached: true,
      env: { ...process.env },
    });

    worker.stdout?.on("data", (data) => console.log(`[worker] ${data.toString().trim()}`));
    worker.stderr?.on("data", (data) => console.error(`[worker-err] ${data.toString().trim()}`));
    worker.on("error", (err) => console.error("[worker] Failed to spawn:", err));
    worker.unref(); // Don't keep the API route alive waiting for the worker

    return NextResponse.json({ status: "started", name: profile.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function extractNameFromUrl(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/linkedin\.com\/in\/([^/?]+)/);
  if (!match) return null;
  return match[1]
    .replace(/\/$/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
