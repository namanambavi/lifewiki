import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is required. Get one at console.anthropic.com");
    client = new Anthropic({ apiKey });
  }
  return client;
}

export async function generateText(prompt: string, systemPrompt?: string): Promise<string> {
  const anthropic = getClient();
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 4096,
    system: systemPrompt || "You are a Wikipedia article writer. Write in a neutral, encyclopedic tone.",
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text : "";
}

export async function generateJSON<T>(prompt: string, systemPrompt?: string): Promise<T> {
  const text = await generateText(
    prompt + "\n\nRespond with valid JSON only. No markdown code fences.",
    systemPrompt
  );
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned) as T;
}

export async function generateBatch(
  prompts: { id: string; prompt: string; systemPrompt?: string }[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const BATCH_SIZE = 5;

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
