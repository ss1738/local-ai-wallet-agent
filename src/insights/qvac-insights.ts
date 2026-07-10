import type { TxRecord } from "../types.js";
import type { InsightsEngine } from "./insights.js";
import { RuleInsightsEngine, txToDoc } from "./insights.js";

// Minimal view of the @qvac/sdk RAG surface, verified against the published
// SDK types. @qvac/sdk is an optional dependency, imported dynamically.
interface QvacSdk {
  LLAMA_3_2_1B_INST_Q4_0: unknown;
  GTE_LARGE_FP16: unknown;
  loadModel(o: { modelSrc: unknown; modelType?: string; modelConfig?: { ctx_size?: number } }): Promise<string>;
  ragIngest(o: { modelId: string; workspace?: string; documents: string[] }): Promise<unknown>;
  ragSearch(o: {
    modelId: string;
    workspace?: string;
    query: string;
    topK?: number;
  }): Promise<Array<{ content: string; score: number }>>;
  completion(o: {
    modelId: string;
    history: Array<{ role: string; content: string }>;
  }): { final: Promise<{ contentText: string }> };
}

async function loadSdk(): Promise<QvacSdk> {
  // @ts-ignore optional dependency: @qvac/sdk is only present when AI_MODE=qvac is used
  const mod = await import("@qvac/sdk");
  return mod as unknown as QvacSdk;
}

/**
 * Retrieval-augmented spending insights, fully on-device via QVAC. Transaction
 * history is embedded and ingested into a local vector workspace; a question
 * retrieves the relevant transactions and a small on-device LLM answers from
 * them, grounded in the retrieved lines only. Falls back to the rule-based
 * summary if the SDK or a model is unavailable, so the agent never breaks.
 *
 * Enable with AI_MODE=qvac after `npm install @qvac/sdk`. The first call
 * downloads a small embedding model and LLM.
 */
export class QvacInsightsEngine implements InsightsEngine {
  private fallback = new RuleInsightsEngine();
  private prepared: Promise<{ sdk: QvacSdk; embedId: string; llmId: string }> | null = null;
  private ingestedCount = -1;

  private async prepare(history: TxRecord[]) {
    if (!this.prepared) {
      this.prepared = (async () => {
        const sdk = await loadSdk();
        const embedId = await sdk.loadModel({ modelSrc: sdk.GTE_LARGE_FP16, modelType: "embeddings" });
        const llmId = await sdk.loadModel({
          modelSrc: sdk.LLAMA_3_2_1B_INST_Q4_0,
          modelConfig: { ctx_size: 2048 },
        });
        return { sdk, embedId, llmId };
      })();
    }
    const ctx = await this.prepared;
    if (this.ingestedCount !== history.length) {
      await ctx.sdk.ragIngest({
        modelId: ctx.embedId,
        workspace: "tx",
        documents: history.map(txToDoc),
      });
      this.ingestedCount = history.length;
    }
    return ctx;
  }

  async answer(question: string, history: TxRecord[]): Promise<string> {
    if (history.length === 0) return "No transaction history yet.";
    try {
      const { sdk, embedId, llmId } = await this.prepare(history);
      const hits = await sdk.ragSearch({ modelId: embedId, workspace: "tx", query: question, topK: 5 });
      const context = hits.map((h) => h.content).join("\n");
      const run = sdk.completion({
        modelId: llmId,
        history: [
          {
            role: "system",
            content:
              "Answer the question using ONLY the transactions provided. Be concise. If it cannot be answered from them, say so.",
          },
          { role: "user", content: `Transactions:\n${context}\n\nQuestion: ${question}` },
        ],
      });
      const { contentText } = await run.final;
      return contentText.trim() || this.fallback.answer(question, history);
    } catch {
      return this.fallback.answer(question, history);
    }
  }
}
