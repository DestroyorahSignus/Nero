import { tool } from "ai";
import { z } from "zod";
import vm from "node:vm";

/**
 * NICO — the gunsmith. Executes agent-written JavaScript.
 *
 * Demo-grade isolation: `node:vm` with a frozen context, no `require`,
 * no `process`, and a hard wall-clock timeout. This is honest-by-design:
 * node:vm is NOT a security boundary against a hostile adversary — the
 * README documents swapping this executor for Vercel Sandbox (Firecracker
 * microVMs) or E2B in production. The tool *interface* stays identical.
 */

const MAX_OUTPUT = 4_000;

export const runJs = tool({
  description:
    "Execute a JavaScript snippet in an isolated sandbox and return everything passed to console.log plus the final expression value. No network, no filesystem, no imports — pure computation only (math, string/array/data processing, algorithms). 2 second CPU limit.",
  inputSchema: z.object({
    code: z
      .string()
      .min(1)
      .max(6_000)
      .describe(
        "JavaScript source. Use console.log for intermediate output; the value of the last expression is also returned.",
      ),
  }),
  execute: async ({ code }) => {
    const logs: string[] = [];
    const sandbox = {
      console: {
        log: (...args: unknown[]) => {
          logs.push(args.map(fmt).join(" "));
        },
        error: (...args: unknown[]) => {
          logs.push("[error] " + args.map(fmt).join(" "));
        },
      },
      Math,
      JSON,
      Date,
      // Explicitly no: require, process, fetch, globalThis escape hatches.
    };
    try {
      const context = vm.createContext(sandbox, {
        codeGeneration: { strings: false, wasm: false },
      });
      const result = vm.runInContext(code, context, {
        timeout: 2_000,
        displayErrors: true,
      });
      return {
        ok: true as const,
        logs: logs.join("\n").slice(0, MAX_OUTPUT),
        result: fmt(result).slice(0, MAX_OUTPUT),
      };
    } catch (err) {
      return {
        ok: false as const,
        logs: logs.join("\n").slice(0, MAX_OUTPUT),
        error: describeError(err),
      };
    }
  },
});

/**
 * Errors thrown inside the sandbox are built from the vm context's own realm,
 * so `err instanceof Error` is FALSE here — using it collapses every failure
 * ("ReferenceError: require is not defined") into a useless generic string,
 * and the executor is explicitly instructed to adapt based on this text.
 * Duck-type instead so the agent sees what actually went wrong.
 */
function describeError(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const e = err as { name?: unknown; message?: unknown };
    const name = typeof e.name === "string" ? e.name : "Error";
    return `${name}: ${String(e.message)}`;
  }
  return "Execution failed";
}

function fmt(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}
