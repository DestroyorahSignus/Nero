import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

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
    planner: "claude-sonnet-4-6",
    executor: "claude-sonnet-4-6",
    critic: "claude-sonnet-4-6",
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
  groq: {
    planner: "llama-3.3-70b-versatile",
    executor: "llama-3.3-70b-versatile",
    critic: "llama-3.3-70b-versatile",
  },
};

const ENV_OVERRIDE: Record<AgentRole, string | undefined> = {
  planner: process.env.NERO_PLANNER_MODEL,
  executor: process.env.NERO_EXECUTOR_MODEL,
  critic: process.env.NERO_CRITIC_MODEL,
};

export function activeProvider(): ProviderId {
  const p = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();
  if (p === "anthropic" || p === "openai" || p === "google" || p === "groq") {
    return p;
  }
  throw new Error(
    `Unknown LLM_PROVIDER "${p}". Use anthropic | openai | google | groq.`,
  );
}

export function resolveModel(role: AgentRole): LanguageModel {
  const provider = activeProvider();
  const id = ENV_OVERRIDE[role] ?? DEFAULTS[provider][role];
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
