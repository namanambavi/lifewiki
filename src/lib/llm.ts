import Anthropic from "@anthropic-ai/sdk";
import type { Tool, MessageParam, ContentBlock, ToolUseBlock, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";

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
// Simple generation (no tools)
// ---------------------------------------------------------------------------

export async function generateText(
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const anthropic = getClient();
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 4096,
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
    systemPrompt
  );
  const cleaned = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
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

// ---------------------------------------------------------------------------
// Agentic loop — LLM with tools, runs until stop_reason is "end_turn"
// ---------------------------------------------------------------------------

export type ToolHandler = (
  toolName: string,
  input: Record<string, unknown>
) => Promise<string>;

export interface AgentResult {
  finalText: string;
  toolCalls: { name: string; input: Record<string, unknown>; output: string }[];
}

export async function runAgent(
  systemPrompt: string,
  userPrompt: string,
  tools: Tool[],
  handleTool: ToolHandler,
  maxTurns: number = 20
): Promise<AgentResult> {
  const anthropic = getClient();
  const messages: MessageParam[] = [{ role: "user", content: userPrompt }];
  const toolCalls: AgentResult["toolCalls"] = [];
  let finalText = "";

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    // Collect any text blocks
    const textBlocks = response.content.filter(
      (b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text"
    );
    if (textBlocks.length > 0) {
      finalText = textBlocks.map((b) => b.text).join("\n");
    }

    // If the model is done (no tool calls), return
    if (response.stop_reason === "end_turn") {
      return { finalText, toolCalls };
    }

    // Process tool calls
    const toolUseBlocks = response.content.filter(
      (b): b is ToolUseBlock => b.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) {
      return { finalText, toolCalls };
    }

    // Add assistant message with all content blocks
    messages.push({ role: "assistant", content: response.content });

    // Execute each tool and collect results
    const toolResults: ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      const input = toolUse.input as Record<string, unknown>;
      const output = await handleTool(toolUse.name, input);
      toolCalls.push({ name: toolUse.name, input, output });
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: output,
      });
    }

    // Add tool results as user message
    messages.push({ role: "user", content: toolResults });
  }

  return { finalText, toolCalls };
}
