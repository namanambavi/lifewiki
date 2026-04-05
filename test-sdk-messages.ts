import { query } from "@anthropic-ai/claude-agent-sdk";
async function main() {
  console.log("Starting...");
  for await (const message of query({
    prompt: "What is 2+2? Answer in one word.",
    options: { allowedTools: [], maxTurns: 3 },
  })) {
    console.log("MSG:", JSON.stringify({
      type: (message as any).type,
      hasResult: "result" in message,
      resultType: typeof (message as any).result,
      keys: Object.keys(message).slice(0, 8),
    }));
  }
  console.log("LOOP ENDED");
}
main().catch(e => console.error("ERR:", e));
