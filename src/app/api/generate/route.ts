import { NextRequest, NextResponse } from "next/server";
import { fetchLinkedInProfile } from "@/lib/linkedin";
import { generateEncyclopedia } from "@/lib/wiki-engine";
import type { LinkedInProfile } from "@/lib/types";
import fs from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, name } = body;

    let profile: LinkedInProfile;

    if (url && process.env.LINKEDIN_API_URL && process.env.LINKEDIN_API_KEY) {
      // Full flow: fetch from LinkedIn API
      profile = await fetchLinkedInProfile(url);
    } else {
      // Test mode: generate from just a name (or name + URL for web research)
      // The Agent SDK will research the person via WebSearch
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

      // If a LinkedIn URL was given, let the agent research it even without the API
      if (url) {
        profile.summary = `LinkedIn profile: ${url}`;
      }
    }

    // Save raw data
    const rawDir = path.join(process.cwd(), "data/raw/linkedin");
    await fs.mkdir(rawDir, { recursive: true });
    await fs.writeFile(
      path.join(rawDir, "profile.json"),
      JSON.stringify(profile, null, 2),
      "utf-8"
    );

    // Fire and forget — status is polled via /api/status
    generateEncyclopedia(profile).catch((err) =>
      console.error("Generation failed:", err)
    );

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
  // Convert "naman-ambavi" to "Naman Ambavi"
  return match[1]
    .replace(/\/$/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
