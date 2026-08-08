/**
 * Repair structured-output text from models that don't return a clean object.
 *
 * Groq's openai/gpt-oss-120b (our free default) is the main offender: instead
 * of an instance that fills the schema, it sometimes returns the JSON *Schema*
 * itself — `{"$schema":…,"type":"object","properties":{…},"required":[…]}` —
 * or concatenates the schema in front of the real object. With Groq's native
 * `structuredOutputs` disabled these come back as TEXT (not a fatal API error),
 * so `experimental_repairText` on generateObject/streamObject can recover them.
 *
 * Recovery strategy, string/escape aware:
 *   1. strip a ```json fence if present,
 *   2. scan out every balanced top-level {…} object,
 *   3. a plain (non-schema) object is a candidate as-is; a schema envelope is
 *      skipped, except we try its `properties` (gpt-oss sometimes stuffs the
 *      real values there),
 *   4. return the LAST candidate (the real object usually trails the schema).
 *
 * Returns null when nothing usable is found — the caller's schema validation
 * then fails as before, so this only ever helps.
 */
export function repairStructuredJson(text: string): string | null {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  const candidates: string[] = [];
  for (const raw of topLevelObjects(s)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const obj = parsed as Record<string, unknown>;
    if (isSchemaEnvelope(obj)) {
      const props = obj.properties;
      if (props && typeof props === "object" && !isSchemaEnvelope(props as Record<string, unknown>)) {
        candidates.push(JSON.stringify(props));
      }
      continue;
    }
    candidates.push(raw);
  }
  return candidates.length ? candidates[candidates.length - 1] : null;
}

/**
 * True for the free-model structured-output failures worth RETRYING (they're
 * intermittent — a re-sample usually succeeds): schema-validation and
 * object-generation errors. Excludes auth/key errors, which are configuration
 * problems that must surface immediately, not be retried or masked.
 */
export function isStructuredOutputError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/api[_ ]?key|unauthor|invalid[_ ]?api|\b401\b|missing/i.test(msg)) return false;
  return /schema|no object generated|response did not match|json|structured|additionalProperties/i.test(
    msg,
  );
}

/** Looks like a JSON Schema envelope rather than a data instance. */
function isSchemaEnvelope(o: Record<string, unknown>): boolean {
  const keys = Object.keys(o);
  return (
    "$schema" in o ||
    (keys.includes("type") && keys.includes("properties")) ||
    (keys.includes("properties") && keys.includes("required"))
  );
}

/** Every balanced, top-level `{…}` substring, respecting strings/escapes. */
function topLevelObjects(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}" && depth > 0) {
      if (--depth === 0 && start >= 0) {
        out.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out;
}
