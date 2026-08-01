import type { ProviderId } from "./providers";

/**
 * Allow-listed model ids the console may request per provider.
 *
 * Single source of truth shared by two places:
 *   - the Command Deck's per-role dropdowns (client), and
 *   - the /api/agent route's header validation (server) — an unknown id is
 *     ignored so the role falls back to the env/DEFAULTS model, never letting
 *     an arbitrary client string reach a provider.
 *
 * Selecting nothing (the "default" option in the UI) sends no header, so the
 * server resolves the role from NERO_<ROLE>_MODEL or DEFAULTS as before.
 *
 * Keep this list current with each provider's live ids — it is deliberately
 * the ONE place to edit when a provider rotates models.
 */
export const MODEL_OPTIONS: Record<ProviderId, string[]> = {
  anthropic: [
    "claude-opus-5",
    "claude-opus-4-8",
    "claude-sonnet-5",
    "claude-haiku-4-5-20251001",
  ],
  openai: ["gpt-4.1", "gpt-4.1-mini"],
  google: ["gemini-2.5-pro", "gemini-2.5-flash"],
  // Groq rotates ids aggressively; gpt-oss-120b is the current recommended id.
  groq: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
};

/** True if `id` is an allow-listed model for `provider`. */
export function isKnownModel(provider: ProviderId, id: string): boolean {
  return MODEL_OPTIONS[provider]?.includes(id) ?? false;
}
