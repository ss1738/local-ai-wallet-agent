import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { RuleIntentParser } from "./intent/parser.js";
import { LlmIntentParser } from "./intent/llm-parser.js";
import { RuleInsightsEngine } from "./insights/insights.js";
import { QvacInsightsEngine } from "./insights/qvac-insights.js";
import { MockWallet } from "./wallet/wallet.js";
import { WdkWallet } from "./wallet/wdk-wallet.js";
import { ForestRiskEngine } from "./risk/forest.js";
import { PolicyEngine } from "./policy/policy.js";
import { makeConfirm } from "./confirm/confirm.js";
import { WalletAgent } from "./agent.js";

async function main(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  const useWdk = process.env.WALLET_MODE === "wdk";
  const wallet = useWdk ? new WdkWallet({ rpc: process.env.WDK_RPC }) : new MockWallet();

  const useQvac = process.env.AI_MODE === "qvac";
  const parser = useQvac ? new LlmIntentParser() : new RuleIntentParser();
  const insights = useQvac ? new QvacInsightsEngine() : new RuleInsightsEngine();

  const agent = new WalletAgent({
    parser,
    wallet,
    risk: new ForestRiskEngine(),
    policy: new PolicyEngine({ maxTransfer: 1000, allowedAssets: ["USDt", "BTC", "ETH"] }),
    confirm: makeConfirm(rl),
    insights,
  });

  if (useWdk) {
    console.log("Local AI Wallet Agent (real WDK wallet, Sepolia testnet, read-only)");
    console.log(`Address: ${await wallet.getAddress()}`);
    console.log("Fund it from a Sepolia faucet to see a live balance. Transfers stay dry-run.\n");
  } else {
    console.log("Local AI Wallet Agent (M1 skeleton, mock wallet, testnet dry-run)");
    console.log("Set WALLET_MODE=wdk to connect a real Sepolia wallet.\n");
  }
  if (useQvac) {
    console.log("On-device intent parsing via QVAC. The first request downloads a small model.");
  }
  console.log('Try: "balance", "address", "history", "send 40 usdt to alex", "send 800 usdt to 0xnew".');
  console.log('Type "exit" to quit.\n');

  for (;;) {
    let line: string;
    try {
      line = (await rl.question("> ")).trim();
    } catch {
      break; // stdin closed (Ctrl-D or end of piped input)
    }
    if (line === "exit" || line === "quit") break;
    if (!line) continue;
    try {
      const out = await agent.handle(line);
      console.log(out + "\n");
    } catch (err) {
      console.log(`Error: ${(err as Error).message}\n`);
    }
  }

  rl.close();
}

main();
