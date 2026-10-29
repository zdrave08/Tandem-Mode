import path from "node:path";
import { describeImage } from "../../deepseek/vision.js";
import type { ToolDefinition } from "./types.js";

export const viewImageTool: ToolDefinition = {
  name: "view_image",
  description:
    "View an image (bug screenshot, mockup, diagram) and get a text description or an answer to a question about it. Use when the user mentions a screenshot or image and gives its path. Supported formats: JPEG, PNG, GIF, WebP.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the image." },
      question: {
        type: "string",
        description: "What specifically to ask about the image. Defaults to a general description focused on a possible error.",
      },
    },
    required: ["path"],
  },
  isDestructive: () => false,
  async execute(args, ctx) {
    const imagePath = String(args["path"] ?? "");
    const question = args["question"] ? String(args["question"]) : undefined;
    const resolved = path.resolve(ctx.cwd, imagePath);

    try {
      const { text, usage } = await describeImage(ctx.env, resolved, question, ctx.signal);
      // vision-exp has no published price list; the cost is reported at the Flash
      // rate as the best available estimate (the actual token counts are exact).
      ctx.usage.add("deepseek-v4-flash", usage);
      return { output: text, isError: false };
    } catch (err) {
      return { output: `Image analysis error: ${(err as Error).message}`, isError: true };
    }
  },
};
