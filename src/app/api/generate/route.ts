import { NextRequest, NextResponse } from "next/server";
import type { LinkedInProfile } from "@/lib/types";
import { checkRateLimit } from "@/lib/rate-limit";
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
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const rateCheck = checkRateLimit(ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Rate limit exceeded. Try again in ${rateCheck.retryAfter} seconds.` },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { name, linkedinUrl } = body;

    // Use provided name, or extract from LinkedIn URL
    let personName: string | undefined;
    const linkedinProfile = (linkedinUrl && typeof linkedinUrl === "string" && linkedinUrl.includes("linkedin.com"))
      ? linkedinUrl.trim()
      : undefined;

    if (name && typeof name === "string" && name.trim()) {
      personName = name.trim();
    } else if (linkedinProfile) {
      const match = linkedinProfile.match(/linkedin\.com\/in\/([^/?]+)/);
      personName = match
        ? match[1].replace(/\/$/, "").split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
        : undefined;
    }

    if (!personName) {
      return NextResponse.json({ error: "Please provide a name" }, { status: 400 });
    }

    const profile: LinkedInProfile = {
      name: personName,
      headline: "",
      summary: linkedinProfile ? `LinkedIn profile: ${linkedinProfile}` : "",
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
