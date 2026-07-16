import type { LanguageModelUsage } from "ai";

/**
 * Hard guardrail around a run. Reflexion-style loops cost 10–30x a single
 * pass and intrinsic self-correction can loop forever without a cap, so
 * every run carries a token budget and an attempt ceiling.
 */
export class TokenBudget {
  private spentInput = 0;
  private spentOutput = 0;
  private calls = 0;

  constructor(
    public readonly maxTotalTokens: number = Number(
      process.env.NERO_TOKEN_BUDGET ?? 150_000,
    ),
  ) {}

  record(usage: LanguageModelUsage | undefined): void {
    if (!usage) return;
    this.spentInput += usage.inputTokens ?? 0;
    this.spentOutput += usage.outputTokens ?? 0;
    this.calls += 1;
  }

  get inputTokens(): number {
    return this.spentInput;
  }
  get outputTokens(): number {
    return this.spentOutput;
  }
  get totalTokens(): number {
    return this.spentInput + this.spentOutput;
  }
  get llmCalls(): number {
    return this.calls;
  }

  get exceeded(): boolean {
    return this.totalTokens >= this.maxTotalTokens;
  }

  /**
   * Blended cost estimate. Real pricing varies by provider/model; this is a
   * deliberately conservative flat rate ($3/M input, $15/M output) so the
   * dashboard number is an upper bound, not marketing.
   */
  get estCostUsd(): number {
    return (this.spentInput * 3 + this.spentOutput * 15) / 1_000_000;
  }
}

export const MAX_REFLECTIONS = Number(process.env.NERO_MAX_REFLECTIONS ?? 2);
