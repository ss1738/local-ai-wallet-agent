import type { TxRecord } from "../types.js";

export interface InsightsEngine {
  /** Answer a plain-language question about the account's transaction history. */
  answer(question: string, history: TxRecord[]): Promise<string>;
}

/** Turn a transaction into a short natural-language line, for RAG or display. */
export function txToDoc(t: TxRecord): string {
  return t.direction === "out"
    ? `On ${t.date} you sent ${t.amount} ${t.asset} to ${t.counterparty}.`
    : `On ${t.date} you received ${t.amount} ${t.asset} from ${t.counterparty}.`;
}

/**
 * Rule-based baseline: a factual summary computed from the history. Runs with
 * no model, and serves as the fallback for the QVAC-backed engine.
 */
export class RuleInsightsEngine implements InsightsEngine {
  async answer(_question: string, history: TxRecord[]): Promise<string> {
    if (history.length === 0) return "No transaction history yet.";
    const out = history.filter((t) => t.direction === "out").reduce((s, t) => s + t.amount, 0);
    const inc = history.filter((t) => t.direction === "in").reduce((s, t) => s + t.amount, 0);
    const byParty = new Map<string, number>();
    for (const t of history) {
      if (t.direction === "out") byParty.set(t.counterparty, (byParty.get(t.counterparty) ?? 0) + t.amount);
    }
    const top = [...byParty.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k} (${v})`)
      .join(", ");
    return `Recent history: ${history.length} transactions, ${out} out and ${inc} in. Top recipients: ${top || "none"}.`;
  }
}
