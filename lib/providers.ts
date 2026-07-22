import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { openai, createOpenAI } from "@ai-sdk/openai";
import { google, createGoogleGenerativeAI } from "@ai-sdk/google";
import { groq, createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";
import { runConfig } from "./run-context";

export type AgentRole = "planner" | "executor" | "critic";
export type ProviderId = "anthropic" | "openai" | "google" | "groq";

/**
 * Default model per provider per role. The critic gets the strongest model
 * available — self-correction only works with a reliable external signal,
 * so we never let the judge be weaker than the worker.
 *
 * Every id can be overridden via NERO_<ROLE>_MODEL env vars, which isolates
 * the codebase from provider model-id churn.
 */
const DEFAULTS: Record<ProviderId, Record<AgentRole, string>> = {
  anthropic: {
    planner: "claude-sonnet-5",
    executor: "claude-sonnet-5",
    critic: "claude-opus-4-8",
  },
  openai: {
    planner: "gpt-4.1",
    executor: "gpt-4.1-mini",
    critic: "gpt-4.1",
  },
  google: {
    planner: "gemini-2.5-flash",
    executor: "gemini-2.5-flash",
    critic: "gemini-2.5-pro",
  },
  // Groq rotates model ids aggressively (llama-3.3-70b-versatile was
  // deprecated 2026-06-17); gpt-oss-120b is their recommended migration.
  groq: {
    planner: "openai/gpt-oss-120b",
    executor: "openai/gpt-oss-120b",
    critic: "openai/gpt-oss-120b",
  },
};

const ENV_OVERRIDE: Record<AgentRole, string | undefined> = {
  planner: process.env.NERO_PLANNER_MODEL,
  executor: process.env.NERO_EXECUTOR_MODEL,
  critic: process.env.NERO_CRITIC_MODEL,
};

export function isProviderId(p: string): p is ProviderId {
  return p === "anthropic" || p === "openai" || p === "google" || p === "groq";
}

/**
 * Active provider: a BYOK request override (from the console's key vault)
 * wins over the LLM_PROVIDER env var.
 */
export function activeProvider(): ProviderId {
  const override = runConfig().provider;
  if (override) return override;
  const p = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();
  if (isProviderId(p)) return p;
  throw new Error(
    `Unknown LLM_PROVIDER "${p}". Use anthropic | openai | google | groq.`,
  );
}

/** True if the server has an env API key for the given provider. */
export function serverKeyConfigured(provider: ProviderId): boolean {
  const envVar: Record<ProviderId, string | undefined> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    groq: process.env.GROQ_API_KEY,
  };
  return Boolean(envVar[provider]);
}

export function resolveModel(role: AgentRole): LanguageModel {
  const provider = activeProvider();
  const id = ENV_OVERRIDE[role] ?? DEFAULTS[provider][role];
  const byokKey = runConfig().apiKey;

  // BYOK path: build a provider instance bound to the request-scoped key.
  // The key never leaves this call — nothing is cached or logged.
  if (byokKey) {
    switch (provider) {
      case "anthropic":
        return createAnthropic({ apiKey: byokKey })(id);
      case "openai":
        return createOpenAI({ apiKey: byokKey })(id);
      case "google":
        return createGoogleGenerativeAI({ apiKey: byokKey })(id);
      case "groq":
        return createGroq({ apiKey: byokKey })(id);
    }
  }

  // Server-key path: default singletons read the env vars.
  switch (provider) {
    case "anthropic":
      return anthropic(id);
    case "openai":
      return openai(id);
    case "google":
      return google(id);
    case "groq":
      return groq(id);
  }
}

export function modelLabel(role: AgentRole): string {
  return `${activeProvider()}/${ENV_OVERRIDE[role] ?? DEFAULTS[activeProvider()][role]}`;
}
