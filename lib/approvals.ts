import { Redis } from "@upstash/redis";
import type { Tool, ToolSet } from "ai";
import type { ApprovalData } from "@/ai/types";

/**
 * Mid-run human-in-the-loop approvals.
 *
 * The run stays alive while a dangerous tool call waits for a human verdict:
 * the tool's execute() awaits a decision that arrives on a SIDE CHANNEL
 * (POST /api/approve) — Redis-backed when configured, in-process fallback
 * for dev. On multi-instance serverless deployments Redis is required so an
 * approval POST that lands on another instance still reaches the waiting run.
 *
 * Fail-closed by design: no answer within APPROVAL_TIMEOUT_MS = deny.
 */

export const APPROVAL_TIMEOUT_MS = 90_000;
const POLL_MS = 500;
const TTL_SECONDS = 300;

type Decision = "pending" | "approved" | "denied";

const memStore = new Map<string, Decision>();

function redis(): Redis | null {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return Redis.fromEnv();
  }
  return null;
}

const key = (id: string): string => `nero:approval:${id}`;

async function open(id: string): Promise<void> {
  const client = redis();
  if (client) await client.set(key(id), "pending", { ex: TTL_SECONDS });
  else memStore.set(key(id), "pending");
}

/** The human side: called by POST /api/approve. False if unknown/expired/decided. */
export async function decide(id: string, approved: boolean): Promise<boolean> {
  const client = redis();
  const k = key(id);
  const current = client ? await client.get<Decision>(k) : memStore.get(k);
  if (current !== "pending") return false;
  const next: Decision = approved ? "approved" : "denied";
  if (client) await client.set(k, next, { ex: TTL_SECONDS });
  else memStore.set(k, next);
  return true;
}

async function awaitDecision(
  id: string,
  timeoutMs: number,
): Promise<"approved" | "denied" | "timeout"> {
  const client = redis();
  const k = key(id);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const d = client ? await client.get<Decision>(k) : memStore.get(k);
    if (d === "approved") return "approved";
    if (d === "denied") return "denied";
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return "timeout";
}

/**
 * ApprovalBroker: owns one run's approval round-trips. Emits the pending
 * `data-approval` part, blocks on the store, then reconciles the same part
 * (same id) to its final status so the card animates in place.
 */
export class ApprovalBroker {
  constructor(
    private readonly emit: (id: string, data: ApprovalData) => void,
    private readonly getAttempt: () => number,
  ) {}

  async request(toolName: string, input: unknown): Promise<boolean> {
    const id = `approval-${crypto.randomUUID()}`;
    await open(id);
    const base: ApprovalData = {
      toolName,
      input,
      status: "pending",
      attempt: this.getAttempt(),
    };
    this.emit(id, base);
    const outcome = await awaitDecision(id, APPROVAL_TIMEOUT_MS);
    this.emit(id, {
      ...base,
      status: outcome === "approved" ? "approved" : outcome === "timeout" ? "timeout" : "denied",
      reason:
        outcome === "timeout"
          ? `no operator decision within ${APPROVAL_TIMEOUT_MS / 1000}s — failed closed`
          : undefined,
    });
    return outcome === "approved";
  }
}

/** Tools that pause for a human verdict when the gate is armed. */
const DANGEROUS_TOOLS = new Set(["run_js"]);

/**
 * Security belongs at the gateway: wrap dangerous tools so execute()
 * blocks on the broker. Denial/timeout returns a structured error the
 * agent can reason about — the run adapts instead of dying.
 */
export function withApprovalGate(
  tools: ToolSet,
  broker: ApprovalBroker,
  enabled: boolean,
): ToolSet {
  if (!enabled) return tools;
  const wrapped: ToolSet = {};
  for (const [name, t] of Object.entries(tools)) {
    if (!DANGEROUS_TOOLS.has(name) || !t.execute) {
      wrapped[name] = t;
      continue;
    }
    const original = t.execute.bind(t);
    wrapped[name] = {
      ...t,
      execute: async (input: unknown, options: unknown) => {
        const approved = await broker.request(name, input);
        if (!approved) {
          return {
            ok: false as const,
            error: `${name} was DENIED by the human operator (or the request timed out). Do not retry this call; accomplish the goal another way or explain the limitation.`,
          };
        }
        return (original as (i: unknown, o: unknown) => Promise<unknown>)(input, options);
      },
    } as Tool;
  }
  return wrapped;
}
