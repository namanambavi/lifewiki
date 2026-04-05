import { NextRequest, NextResponse } from "next/server";
import type { LinkedInProfile } from "@/lib/types";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const profile: LinkedInProfile = {
      name: name.trim(),
      headline: "",
      summary: "",
      location: "",
      positions: [],
      education: [],
      skills: [],
      connections: [],
    };

    const personSlug = slugify(profile.name);

    // Create person directory structure
    const personDir = path.join(process.cwd(), "data/users", personSlug);
    const rawDir = path.join(personDir, "raw/linkedin");
    await fs.mkdir(rawDir, { recursive: true });

    // Save raw profile
    const profilePath = path.join(rawDir, "profile.json");
    await fs.writeFile(profilePath, JSON.stringify(profile, null, 2), "utf-8");

    // Initialize status file
    const statusPath = path.join(personDir, "generation-status.json");
    await fs.writeFile(
      statusPath,
      JSON.stringify({
        phase: "fetching",
        totalArticles: 0,
        completedArticles: 0,
        currentArticle: "Starting research agent...",
        log: [],
      }),
      "utf-8"
    );

    // Spawn worker process
    const worker = spawn(
      "npx",
      ["tsx", "scripts/generate-worker.ts", personSlug, profilePath],
      {
        cwd: process.cwd(),
        stdio: "pipe",
        detached: true,
        env: { ...process.env },
      }
    );

    worker.stdout?.on("data", (data) =>
      console.log(`[worker] ${data.toString().trim()}`)
    );
    worker.stderr?.on("data", (data) =>
      console.error(`[worker-err] ${data.toString().trim()}`)
    );
    worker.on("error", (err) =>
      console.error("[worker] Failed to spawn:", err)
    );
    worker.unref();

    return NextResponse.json({ status: "started", name: profile.name, personSlug });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
