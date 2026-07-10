import type { Intent } from "../types.js";

export interface IntentParser {
  parse(input: string): Promise<Intent>;
}

/**
 * Deterministic, dependency-free intent parser.
 *
 * It runs with no model so the agent is demoable immediately. When QVAC is
 * wired in, an LlmIntentParser will implement this same interface; its output
 * still flows through the deterministic policy layer, so the model can only
 * ever propose an intent, never execute an action directly.
 */
export class RuleIntentParser implements IntentParser {
  async parse(input: string): Promise<Intent> {
    const raw = input.trim();
    const lower = raw.toLowerCase();

    if (/\b(balance|how much|funds?)\b/.test(lower)) {
      return { kind: "balance", raw };
    }
    if (/\b(history|transactions?|recent|activity)\b/.test(lower)) {
      return { kind: "history", raw };
    }
    if (/\b(address|receive|deposit|my wallet)\b/.test(lower)) {
      return { kind: "address", raw };
    }

    const transfer = lower.match(
      /\b(?:send|transfer|pay)\s+([\d.]+)\s*([a-z]{2,6})?\s+to\s+(.+)$/,
    );
    if (transfer) {
      const rawAsset = (transfer[2] ?? "usdt").toUpperCase();
      return {
        kind: "transfer",
        amount: Number(transfer[1]),
        asset: rawAsset === "USDT" ? "USDt" : rawAsset,
        recipient: transfer[3].trim(),
        raw,
      };
    }

    if (/\b(spen[dt]|spending|what did i|insight)/.test(lower)) {
      return { kind: "insights", query: raw, raw };
    }

    return { kind: "unknown", raw };
  }
}
