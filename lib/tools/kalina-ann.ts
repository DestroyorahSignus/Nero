import { tool } from "ai";
import { z } from "zod";

/**
 * KALINA ANN — Lady's rocket launcher. Heavy-ordnance data analysis over
 * inline CSV. Pure TypeScript (no sandbox needed): parse, describe,
 * group-by aggregate. Deterministic tools like this give LADY (the critic)
 * a verifiable external signal to judge against.
 */

type Row = Record<string, string>;

function parseCsv(csv: string): { headers: string[]; rows: Row[] } {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new Error("CSV needs a header row and at least one data row");
  }
  const split = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = split(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const vals = split(line);
    const row: Row = {};
    headers.forEach((h, i) => (row[h] = vals[i] ?? ""));
    return row;
  });
  return { headers, rows };
}

const numeric = (rows: Row[], col: string): number[] =>
  rows.map((r) => Number(r[col])).filter((n) => Number.isFinite(n));

export const csvDescribe = tool({
  description:
    "Profile a CSV dataset: row count, columns, and for each numeric column min/max/mean/median/stddev. Always run this before csv_aggregate so you know the real column names.",
  inputSchema: z.object({
    csv: z.string().min(10).describe("Raw CSV text including the header row"),
  }),
  execute: async ({ csv }) => {
    try {
      const { headers, rows } = parseCsv(csv);
      const stats = headers.map((h) => {
        const nums = numeric(rows, h);
        if (nums.length < rows.length * 0.5 || nums.length === 0) {
          const uniq = new Set(rows.map((r) => r[h]));
          return { column: h, type: "categorical", uniqueValues: uniq.size };
        }
        const sorted = [...nums].sort((a, b) => a - b);
        const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
        const std = Math.sqrt(
          nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length,
        );
        return {
          column: h,
          type: "numeric",
          count: nums.length,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          mean: round(mean),
          median: sorted[Math.floor(sorted.length / 2)],
          std: round(std),
        };
      });
      return { ok: true as const, rowCount: rows.length, columns: stats };
    } catch (err) {
      return { ok: false as const, error: msg(err) };
    }
  },
});

export const csvAggregate = tool({
  description:
    "Group a CSV by one column and aggregate a numeric column (sum, mean, count, min or max). Returns the aggregated table sorted descending by the metric.",
  inputSchema: z.object({
    csv: z.string().min(10).describe("Raw CSV text including the header row"),
    groupBy: z.string().describe("Column name to group by (exact match)"),
    metric: z.string().describe("Numeric column to aggregate (exact match)"),
    agg: z.enum(["sum", "mean", "count", "min", "max"]).default("sum"),
  }),
  execute: async ({ csv, groupBy, metric, agg }) => {
    try {
      const { headers, rows } = parseCsv(csv);
      if (!headers.includes(groupBy) || !headers.includes(metric)) {
        return {
          ok: false as const,
          error: `Column not found. Available columns: ${headers.join(", ")}`,
        };
      }
      const groups = new Map<string, number[]>();
      for (const r of rows) {
        const k = r[groupBy];
        const v = Number(r[metric]);
        if (!Number.isFinite(v)) continue;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(v);
      }
      const table = [...groups.entries()]
        .map(([key, vals]) => {
          let value: number;
          switch (agg) {
            case "sum":
              value = vals.reduce((a, b) => a + b, 0);
              break;
            case "mean":
              value = vals.reduce((a, b) => a + b, 0) / vals.length;
              break;
            case "count":
              value = vals.length;
              break;
            case "min":
              value = Math.min(...vals);
              break;
            case "max":
              value = Math.max(...vals);
              break;
          }
          return { [groupBy]: key, [`${agg}_${metric}`]: round(value) };
        })
        .sort(
          (a, b) =>
            (b[`${agg}_${metric}`] as number) - (a[`${agg}_${metric}`] as number),
        );
      return { ok: true as const, table };
    } catch (err) {
      return { ok: false as const, error: msg(err) };
    }
  },
});

const round = (n: number): number => Math.round(n * 10_000) / 10_000;
const msg = (e: unknown): string =>
  e instanceof Error ? e.message : "Unknown error";
