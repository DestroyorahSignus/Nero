import { AsyncLocalStorage } from "node:async_hooks";
import type { ProviderId } from "./providers";

/**
 * Per-request run configuration — the BYOK (bring-your-own-key) mechanism.
 *
 * Keys arriving from the client travel here via AsyncLocalStorage so they
 * flow to every provider/tool call inside the run WITHOUT being threaded
 * through every function signature, and WITHOUT ever touching module or
 * global state (concurrent requests stay isolated). Nothing in this file
 * persists or logs a key: it lives for the duration of one request.
 */
export interface RunConfig {
  provider?: ProviderId;
  apiKey?: string;
  tavilyKey?: string;
  /** HITL: gate dangerous tools behind operator approval (default on). */
  approvalMode?: boolean;
}

const storage = new AsyncLocalStorage<RunConfig>();

export function withRunConfig<T>(config: RunConfig, fn: () => Promise<T>): Promise<T> {
  return storage.run(config, fn);
}

export function runConfig(): RunConfig {
  return storage.getStore() ?? {};
}
