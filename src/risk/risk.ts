import type { RiskAssessment } from "../types.js";

export interface RiskInput {
  amount: number;
  asset: string;
  recipient: string;
  balance: number;
  knownRecipients: string[];
}

export interface RiskEngine {
  assess(input: RiskInput): Promise<RiskAssessment>;
}

/**
 * Rule-based on-device risk gate. This is the placeholder for the trained
 * anomaly model delivered in milestone M2. It is deterministic and fully
 * explainable by design: every score comes with the reasons behind it, and
 * limits are enforced here in code rather than by any model.
 */
export class RuleRiskEngine implements RiskEngine {
  constructor(private readonly largeAmount = 500) {}

  async assess(input: RiskInput): Promise<RiskAssessment> {
    const reasons: string[] = [];
    let score = 0;

    if (!input.knownRecipients.includes(input.recipient.toLowerCase())) {
      score += 0.5;
      reasons.push("Recipient has not been paid before");
    }
    if (input.amount >= this.largeAmount) {
      score += 0.3;
      reasons.push(`Amount is large (>= ${this.largeAmount} ${input.asset})`);
    }
    if (input.amount > input.balance) {
      score += 0.6;
      reasons.push("Amount exceeds available balance");
    }
    if (reasons.length === 0) {
      reasons.push("Matches your normal pattern");
    }

    score = Math.min(score, 1);
    const level: RiskAssessment["level"] =
      score >= 0.6 ? "high" : score >= 0.3 ? "medium" : "low";

    return { score, level, reasons };
  }
}
