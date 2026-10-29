import type { ToolSpec } from "../../deepseek/types.js";
import type { TandemEnv } from "../../config/env.js";
import type { UsageAccumulator } from "../usage.js";

export interface ToolContext {
  cwd: string;
  env: TandemEnv;
  /** Tools that call the API themselves (vision, web search) report their usage here. */
  usage: UsageAccumulator;
  signal?: AbortSignal;
}

export interface ToolResult {
  output: string;
  isError: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Whether this specific invocation changes state (file/process/git). */
  isDestructive: (args: Record<string, unknown>) => boolean;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

export function toToolSpec(tool: ToolDefinition): ToolSpec {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}
