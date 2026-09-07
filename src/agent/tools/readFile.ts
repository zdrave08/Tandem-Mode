import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "./types.js";

const MAX_LINES = 2000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const readFileTool: ToolDefinition = {
  name: "read_file",
  description:
    "Pročitaj sadržaj fajla sa brojevima linija (cat -n stil). Putanja može biti relativna na radni direktorijum.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Putanja do fajla." },
      offset: { type: "integer", description: "Linija od koje se počinje (1-indeksirano). Podrazumevano 1." },
      limit: { type: "integer", description: `Maksimalan broj linija za čitanje. Podrazumevano ${MAX_LINES}.` },
    },
    required: ["path"],
  },
  isDestructive: () => false,
  async execute(args, ctx) {
    const filePath = String(args["path"] ?? "");
    const offset = Math.max(1, Number(args["offset"] ?? 1));
    const limit = Math.max(1, Number(args["limit"] ?? MAX_LINES));
    const resolved = path.resolve(ctx.cwd, filePath);

    try {
      const stats = await stat(resolved);
      if (stats.size > MAX_FILE_BYTES) {
        return {
          output: `Fajl je prevelik za čitanje (${stats.size} bajtova, limit ${MAX_FILE_BYTES}). Verovatno nije tekstualni izvorni fajl (npr. state/binarni/vendored fajl) — proveri putanju ili koristi shell alat sa limitiranim izlazom.`,
          isError: true,
        };
      }
      const raw = await readFile(resolved, "utf8");
      const lines = raw.split(/\r\n|\n/);
      const slice = lines.slice(offset - 1, offset - 1 + limit);
      const numbered = slice
        .map((line, i) => `${String(offset + i).padStart(6, " ")}\t${line}`)
        .join("\n");
      const truncated = offset - 1 + limit < lines.length;
      return {
        output: numbered + (truncated ? `\n... (isečeno, ukupno ${lines.length} linija)` : ""),
        isError: false,
      };
    } catch (err) {
      return { output: `Greška pri čitanju ${resolved}: ${(err as Error).message}`, isError: true };
    }
  },
};
