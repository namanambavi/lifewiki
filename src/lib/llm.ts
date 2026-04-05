import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
      throw new Error(
        "ANTHROPIC_API_KEY environment variable is required. Get one at console.anthropic.com"
      );
    client = new Anthropic({ apiKey });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Simple generation (no tools) — used for article writing and JSON generation
// ---------------------------------------------------------------------------

export async function generateText(
  prompt: string,
  systemPrompt?: string,
  maxTokens: number = 4096
): Promise<string> {
  const anthropic = getClient();
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system:
      systemPrompt ||
      "You are a Wikipedia article writer. Write in a neutral, encyclopedic tone.",
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text : "";
}

export async function generateJSON<T>(
  prompt: string,
  systemPrompt?: string
): Promise<T> {
  const text = await generateText(
    prompt + "\n\nRespond with valid JSON only. No markdown code fences.",
    systemPrompt,
    8192 // larger token limit for JSON responses
  );
  let cleaned = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // JSON was truncated (hit token limit). Try to repair:
    // If it's an array, find the last complete object and close the array
    if (cleaned.startsWith("[")) {
      const lastCompleteObj = cleaned.lastIndexOf("}");
      if (lastCompleteObj > 0) {
        cleaned = cleaned.slice(0, lastCompleteObj + 1) + "]";
        return JSON.parse(cleaned) as T;
      }
    }
    throw new Error(`Invalid JSON from LLM: ${text.slice(0, 200)}...`);
  }
}

export async function generateBatch(
  prompts: { id: string; prompt: string; systemPrompt?: string }[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const BATCH_SIZE = 10;

  for (let i = 0; i < prompts.length; i += BATCH_SIZE) {
    const batch = prompts.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async ({ id, prompt, systemPrompt }) => {
        const text = await generateText(prompt, systemPrompt);
        return { id, text };
      })
    );
    for (const { id, text } of batchResults) {
      results.set(id, text);
    }
  }

  return results;
}
