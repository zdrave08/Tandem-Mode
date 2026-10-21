import { runWebSearch } from "../../deepseek/webSearch.js";
import type { ToolDefinition } from "./types.js";

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description:
    "Search the web for current information — error messages, library documentation, news. Use when the answer requires something that is not in the code or repo context.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query." },
    },
    required: ["query"],
  },
  isDestructive: () => false,
  async execute(args, ctx) {
    const query = String(args["query"] ?? "");
    try {
      const { text, usage } = await runWebSearch(ctx.env, query, ctx.signal);
      // Responses API nema objavljen zaseban cenovnik — trošak se prijavljuje
      // po Flash tarifi kao najbolja dostupna procena (stvarni tokeni su tačni).
      ctx.usage.add("deepseek-v4-flash", usage);
      return { output: text, isError: false };
    } catch (err) {
      return { output: `Search error: ${(err as Error).message}`, isError: true };
    }
  },
};
