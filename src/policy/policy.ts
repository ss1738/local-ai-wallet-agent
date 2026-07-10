import type { Intent, PolicyDecision } from "../types.js";

export interface PolicyConfig {
  /** Hard cap per single transfer, enforced in code. */
  maxTransfer: number;
  allowedAssets: string[];
}

/**
 * Deterministic policy layer.
 *
 * It maps a parsed intent to a bounded set of allowed operations and enforces
 * hard limits in code, not in the model. This is the guarantee that a wrong or
 * manipulated model cannot invent an action outside this set: the model
 * proposes an intent, the policy decides what, if anything, is allowed.
 */
export class PolicyEngine {
  constructor(private readonly config: PolicyConfig) {}

  decide(intent: Intent): PolicyDecision {
    switch (intent.kind) {
      case "balance":
        return {
          allowed: true,
          operation: { type: "read_balance", asset: intent.asset ?? "USDt" },
        };

      case "history":
        return { allowed: true, operation: { type: "read_history" } };

      case "address":
        return { allowed: true, operation: { type: "read_address" } };

      case "insights":
        return {
          allowed: true,
          operation: { type: "answer_insights", query: intent.query },
        };

      case "transfer": {
        if (intent.amount == null || !intent.recipient) {
          return { allowed: false, reason: "Could not read the amount or recipient" };
        }
        const asset = intent.asset ?? "USDt";
        if (!this.config.allowedAssets.includes(asset)) {
          return { allowed: false, reason: `Asset ${asset} is not allowed` };
        }
        if (!(intent.amount > 0)) {
          return { allowed: false, reason: "Amount must be positive" };
        }
        if (intent.amount > this.config.maxTransfer) {
          return {
            allowed: false,
            reason: `Amount exceeds the per-transfer limit of ${this.config.maxTransfer} ${asset}`,
          };
        }
        return {
          allowed: true,
          operation: {
            type: "draft_transfer",
            amount: intent.amount,
            asset,
            recipient: intent.recipient,
          },
        };
      }

      default:
        return { allowed: false, reason: "I could not understand that request" };
    }
  }
}
