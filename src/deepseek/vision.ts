import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { TandemEnv } from "../config/env.js";
import { parseUsage } from "./client.js";
import type { UsageInfo } from "./types.js";

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const DEFAULT_QUESTION =
  "Describe in detail what is visible in the image — if it is a bug screenshot, focus on the visible error, the message text, and the UI context.";

export interface VisionResult {
  text: string;
  usage: UsageInfo;
}

export async function describeImage(
  env: TandemEnv,
  imagePath: string,
  question?: string,
  signal?: AbortSignal
): Promise<VisionResult> {
  const ext = path.extname(imagePath).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    throw new Error(`Unsupported image format '${ext}'. Supported: JPEG, PNG, GIF, WebP.`);
  }

  const stats = await stat(imagePath);
  if (stats.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image is too large (${(stats.size / 1024 / 1024).toFixed(1)} MiB, limit 32 MiB).`);
  }

  const buffer = await readFile(imagePath);
  const dataUri = `data:${mime};base64,${buffer.toString("base64")}`;

  const response = await fetch(`${env.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.apiKey}`,
    },
    ...(signal ? { signal } : {}),
    body: JSON.stringify({
      model: "deepseek-v4-flash-vision-exp",
      stream: false,
      thinking: { type: "disabled" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: question?.trim() || DEFAULT_QUESTION },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`DeepSeek vision API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const message = (data["choices"] as Array<Record<string, unknown>> | undefined)?.[0]?.["message"] as
    | Record<string, unknown>
    | undefined;
  const content = message?.["content"];
  if (typeof content !== "string" || !content) {
    throw new Error("Vision response contained no text.");
  }

  return { text: content, usage: parseUsage((data["usage"] as Record<string, unknown>) ?? {}) };
}
