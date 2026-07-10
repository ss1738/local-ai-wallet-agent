import type { IntentParser } from "./intent/parser.js";
import type { Wallet } from "./wallet/wallet.js";
import type { RiskEngine } from "./risk/risk.js";
import type { PolicyEngine } from "./policy/policy.js";
import type { Confirm } from "./confirm/confirm.js";

export interface AgentDeps {
  parser: IntentParser;
  wallet: Wallet;
  risk: RiskEngine;
  policy: PolicyEngine;
  confirm: Confirm;
}

/**
 * The agent wires the pieces together in one direction only:
 *   language -> intent -> policy -> (read | draft + risk + confirm)
 * The model never reaches the wallet directly. It proposes an intent; the
 * deterministic policy decides the operation; a transfer is drafted, risk
 * scored, and held at the confirmation gate before anything could be sent.
 */
export class WalletAgent {
  constructor(private readonly deps: AgentDeps) {}

  /** Handle one natural-language request end to end. Returns a line to print. */
  async handle(input: string): Promise<string> {
    const intent = await this.deps.parser.parse(input);
    const decision = this.deps.policy.decide(intent);

    if (!decision.allowed || !decision.operation) {
      return `Blocked: ${decision.reason ?? "not allowed"}`;
    }

    const op = decision.operation;
    switch (op.type) {
      case "read_balance": {
        const label = this.deps.wallet.assetLabel();
        const bal = await this.deps.wallet.getBalance(label);
        return `Balance: ${bal} ${label}`;
      }

      case "read_address":
        return `Address: ${await this.deps.wallet.getAddress()}`;

      case "read_history": {
        const hist = await this.deps.wallet.getHistory();
        return hist
          .map(
            (t) =>
              `${t.date}  ${t.direction === "out" ? "-" : "+"}${t.amount} ${t.asset}  ${t.counterparty}`,
          )
          .join("\n");
      }

      case "answer_insights": {
        // Placeholder until QVAC RAG over history is wired in M2.
        const hist = await this.deps.wallet.getHistory(50);
        const out = hist
          .filter((t) => t.direction === "out")
          .reduce((sum, t) => sum + t.amount, 0);
        return `Local insight (rule-based for now): total outgoing in recent history is ${out} USDt. QVAC-powered Q&A lands in M2.`;
      }

      case "draft_transfer": {
        const asset = op.asset ?? "USDt";
        const amount = op.amount!;
        const recipient = op.recipient!;

        const balance = await this.deps.wallet.getBalance(asset);
        const known = await this.deps.wallet.knownRecipients();
        const draft = await this.deps.wallet.draftTransfer({ amount, asset, recipient });
        const risk = await this.deps.risk.assess({
          amount,
          asset,
          recipient,
          balance,
          knownRecipients: known,
        });

        console.log("\nDraft transfer:");
        console.log(`  ${draft.amount} ${draft.asset}  ->  ${draft.recipient}`);
        console.log(`  est. network fee: ${draft.networkFeeEstimate} ${draft.asset}`);
        console.log(`  risk: ${risk.level.toUpperCase()} (${risk.score.toFixed(2)})`);
        for (const reason of risk.reasons) console.log(`    - ${reason}`);

        const ok = await this.deps.confirm("Confirm this transfer?");
        if (!ok) return "Cancelled. Nothing was sent.";

        // M1 is a testnet dry-run: we never broadcast yet. WDK signing and
        // broadcast land at M1 completion, still behind this same gate.
        return "Confirmed. [dry-run] Broadcast is disabled in M1, so nothing left your wallet.";
      }

      default:
        return "Nothing to do.";
    }
  }
}
