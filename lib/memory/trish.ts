import { Redis } from "@upstash/redis";

/**
 * TRISH — memory. Two tiers:
 *  - working memory: reflections for the *current* session, injected into
 *    the executor prompt on retry (the Reflexion mechanism).
 *  - long-term memory: completed run records for the eval dashboard.
 *
 * Backed by Upstash Redis when configured; otherwise an in-process Map so
 * local dev needs zero infra. On serverless the Map only survives a warm
 * instance — the README is explicit about this.
 */

export interface StoredReflection {
  attempt: number;
  critique: string;
  reflection: string;
  at: number;
}

export interface RunRecord {
  sessionId: string;
  goal: string;
  score: number;
  rank: string;
  attempts: number;
  totalTokens: number;
  estCostUsd: number;
  elapsedMs: number;
  at: number;
}

const TTL_SECONDS = 60 * 60; // working memory: 1 hour
const memFallback = new Map<string, unknown>();

function redis(): Redis | null {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return Redis.fromEnv();
  }
  return null;
}

export interface ApprovalDecision {
  approved: boolean;
  reason?: string;
}

const REPLAY_TTL_SECONDS = 60 * 60 * 24 * 7; // replays live a week on Redis

export const trish = {

  async addReflection(sessionId: string, r: StoredReflection): Promise<void> {
    const key = `nero:reflections:${sessionId}`;
    const existing = await this.getReflections(sessionId);
    const next = [...existing, r].slice(-5); // cap memory hygiene
    const client = redis();
    if (client) {
      await client.set(key, JSON.stringify(next), { ex: TTL_SECONDS });
    } else {
      memFallback.set(key, next);
    }
  },

  async getReflections(sessionId: string): Promise<StoredReflection[]> {
    const key = `nero:reflections:${sessionId}`;
    const client = redis();
    if (client) {
      const raw = await client.get<string | StoredReflection[]>(key);
      if (!raw) return [];
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    }
    return (memFallback.get(key) as StoredReflection[]) ?? [];
  },

  async saveRun(record: RunRecord): Promise<void> {
    const key = "nero:runs";
    const client = redis();
    if (client) {
      await client.lpush(key, JSON.stringify(record));
      await client.ltrim(key, 0, 99);
    } else {
      const list = (memFallback.get(key) as RunRecord[]) ?? [];
      memFallback.set(key, [record, ...list].slice(0, 100));
    }
  },

  /** HITL approval decisions — written by /api/approve, polled by the broker. */
  async setApproval(id: string, d: ApprovalDecision): Promise<void> {
    const key = `nero:approval:${id}`;
    const client = redis();
    if (client) {
      await client.set(key, JSON.stringify(d), { ex: 600 });
    } else {
      memFallback.set(key, d);
    }
  },

  async getApproval(id: string): Promise<ApprovalDecision | null> {
    const key = `nero:approval:${id}`;
    const client = redis();
    if (client) {
      const raw = await client.get<string | ApprovalDecision>(key);
      if (!raw) return null;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    }
    return (memFallback.get(key) as ApprovalDecision) ?? null;
  },

  /** Replay snapshots — the final UIMessage[] of a completed run. */
  async saveReplay(sessionId: string, messages: unknown): Promise<void> {
    const key = `nero:replay:${sessionId}`;
    const client = redis();
    if (client) {
      await client.set(key, JSON.stringify(messages), { ex: 60 * 60 * 24 * 7 });
    } else {
      memFallback.set(key, messages);
    }
  },

  async getReplay(sessionId: string): Promise<unknown | null> {
    const key = `nero:replay:${sessionId}`;
    const client = redis();
    if (client) {
      const raw = await client.get<string | unknown>(key);
      if (!raw) return null;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    }
    return memFallback.get(key) ?? null;
  },

  async recentRuns(limit = 20): Promise<RunRecord[]> {
    const key = "nero:runs";
    const client = redis();
    if (client) {
      const raw = await client.lrange<string | RunRecord>(key, 0, limit - 1);
      return raw.map((r) => (typeof r === "string" ? JSON.parse(r) : r));
    }
    return ((memFallback.get(key) as RunRecord[]) ?? []).slice(0, limit);
  },
};
