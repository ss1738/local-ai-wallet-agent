import type { Intent, IntentKind } from "../types.js";
import type { IntentParser } from "./parser.js";
import { RuleIntentParser } from "./parser.js";

const VALID_KINDS: IntentKind[] = [
  "balance",
  "history",
  "address",
  "transfer",
  "insights",
  "unknown",
];

const SYSTEM = [
  "You convert a user's crypto wallet request into a JSON object.",
  'Fields: "kind" (one of balance, history, address, transfer, insights, unknown),',
  '"amount" (number, only for a transfer), "asset" (string like USDt or ETH, only for a transfer),',
  '"recipient" (string, only for a transfer).',
  "Reply with only the JSON object, no prose.",
].join(" ");

// Minimal view of the @qvac/sdk surface this parser uses, verified against the
// published SDK types. @qvac/sdk bundles heavy on-device inference engines, so
// it is an OPTIONAL dependency: imported dynamically and typed locally, which
// keeps the base install light and CI fast.
interface QvacSdk {
  LLAMA_3_2_1B_INST_Q4_0: unknown;
  loadModel(o: { modelSrc: unknown; modelConfig?: { ctx_size?: number } }): Promise<string>;
  completion(o: {
    modelId: string;
    history: Array<{ role: string; content: string }>;
    responseFormat?: { type: "text" | "json_object" };
  }): { final: Promise<{ contentText: string }> };
}

async function loadSdk(): Promise<QvacSdk> {
  // @ts-ignore optional dependency: @qvac/sdk is only present when AI_MODE=qvac is used
  const mod = await import("@qvac/sdk");
  return mod as unknown as QvacSdk;
}

/**
 * On-device LLM intent parser backed by QVAC. The model proposes a structured
 * intent from natural language; the deterministic policy layer still validates
 * and bounds every action, so the model never executes anything directly. If
 * the SDK or model is unavailable, or the output is not valid JSON, it falls
 * back to the rule-based parser so the agent never breaks.
 *
 * Enable with AI_MODE=qvac after `npm install @qvac/sdk`. The first call
 * downloads a small quantized on-device model (Llama 3.2 1B).
 */
export class LlmIntentParser implements IntentParser {
  private fallback = new RuleIntentParser();
  private modelIdPromise: Promise<string> | null = null;

  private async modelId(sdk: QvacSdk): Promise<string> {
    if (!this.modelIdPromise) {
      this.modelIdPromise = sdk.loadModel({
        modelSrc: sdk.LLAMA_3_2_1B_INST_Q4_0,
        modelConfig: { ctx_size: 2048 },
      });
    }
    return this.modelIdPromise;
  }

  async parse(input: string): Promise<Intent> {
    try {
      const sdk = await loadSdk();
      const modelId = await this.modelId(sdk);
      const run = sdk.completion({
        modelId,
        history: [
          { role: "system", content: SYSTEM },
          { role: "user", content: input },
        ],
        responseFormat: { type: "json_object" },
      });
      const { contentText } = await run.final;
      const obj = JSON.parse(contentText) as Record<string, unknown>;
      const kind = (VALID_KINDS as string[]).includes(String(obj.kind))
        ? (obj.kind as IntentKind)
        : "unknown";
      return {
        kind,
        amount: typeof obj.amount === "number" ? obj.amount : undefined,
        asset: typeof obj.asset === "string" ? obj.asset : undefined,
        recipient: typeof obj.recipient === "string" ? obj.recipient : undefined,
        raw: input,
      };
    } catch {
      // SDK missing, model unavailable, or unparseable output: stay functional.
      return this.fallback.parse(input);
    }
  }
}
