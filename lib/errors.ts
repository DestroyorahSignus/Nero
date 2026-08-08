/**
 * Best-effort human-readable message from any thrown value.
 *
 * Providers (notably the AI SDK / Groq) sometimes surface a plain object or a
 * nested error payload rather than an Error. `String(obj)` then yields the
 * useless "[object Object]" — which not only reads badly in the RUN ERROR
 * banner but also defeats string-matching error classifiers. Dig for a real
 * message across the common shapes before falling back to a JSON dump.
 */
export function errorMessage(err: unknown): string {
  if (err == null) return "unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || err.name || "Error";
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const asMsg = (v: unknown): string | undefined =>
      typeof v === "string" && v.trim() ? v : undefined;
    const nested =
      asMsg(o.message) ??
      asMsg((o.error as Record<string, unknown> | undefined)?.message) ??
      asMsg(
        ((o.data as Record<string, unknown> | undefined)?.error as
          | Record<string, unknown>
          | undefined)?.message,
      ) ??
      asMsg(o.error) ??
      asMsg(o.responseBody) ??
      asMsg(o.statusText);
    if (nested) return nested;
    try {
      const s = JSON.stringify(o);
      if (s && s !== "{}") return s.length > 500 ? s.slice(0, 500) + "…" : s;
    } catch {
      // circular / non-serializable — fall through
    }
  }
  return String(err);
}
