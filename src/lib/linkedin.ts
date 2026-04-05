import type { LinkedInProfile } from "./types";

export function extractUsername(url: string): string {
  const match = url.match(/linkedin\.com\/in\/([^/?]+)/);
  if (!match) throw new Error(`Invalid LinkedIn URL: ${url}`);
  return match[1].replace(/\/$/, "");
}

export async function fetchLinkedInProfile(linkedinUrl: string): Promise<LinkedInProfile> {
  const apiUrl = process.env.LINKEDIN_API_URL;
  const apiKey = process.env.LINKEDIN_API_KEY;

  if (!apiUrl) throw new Error("LINKEDIN_API_URL environment variable is required");
  if (!apiKey) throw new Error("LINKEDIN_API_KEY environment variable is required");

  const response = await fetch(`${apiUrl}?url=${encodeURIComponent(linkedinUrl)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`LinkedIn API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return normalizeProfile(data);
}

function normalizeProfile(raw: Record<string, unknown>): LinkedInProfile {
  return {
    name: (raw.name as string) || (raw.full_name as string) || "Unknown",
    headline: (raw.headline as string) || "",
    summary: (raw.summary as string) || (raw.about as string) || "",
    location: (raw.location as string) || "",
    positions: Array.isArray(raw.positions) ? raw.positions.map((p: Record<string, unknown>) => ({
      title: (p.title as string) || "",
      company: (p.company as string) || (p.company_name as string) || "",
      startDate: (p.startDate as string) || (p.start_date as string) || "",
      endDate: (p.endDate as string | null) || (p.end_date as string | null) || null,
      description: (p.description as string) || "",
    })) : [],
    education: Array.isArray(raw.education) ? raw.education.map((e: Record<string, unknown>) => ({
      school: (e.school as string) || (e.school_name as string) || "",
      degree: (e.degree as string) || (e.degree_name as string) || "",
      field: (e.field as string) || (e.field_of_study as string) || "",
      startDate: (e.startDate as string) || (e.start_date as string) || "",
      endDate: (e.endDate as string) || (e.end_date as string) || "",
    })) : [],
    skills: Array.isArray(raw.skills) ? raw.skills.map((s: unknown) =>
      typeof s === "string" ? s : (s as Record<string, unknown>).name as string
    ) : [],
    connections: Array.isArray(raw.connections) ? raw.connections.map((c: Record<string, unknown>) => ({
      name: (c.name as string) || "",
      headline: (c.headline as string) || "",
      company: (c.company as string) || undefined,
    })) : [],
  };
}
