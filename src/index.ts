import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { RuleIntentParser } from "./intent/parser.js";
import { MockWallet } from "./wallet/wallet.js";
import { RuleRiskEngine } from "./risk/risk.js";
import { PolicyEngine } from "./policy/policy.js";
import { makeConfirm } from "./confirm/confirm.js";
import { WalletAgent } from "./agent.js";

async function main(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  const agent = new WalletAgent({
    parser: new RuleIntentParser(),
    wallet: new MockWallet(),
    risk: new RuleRiskEngine(),
    policy: new PolicyEngine({ maxTransfer: 1000, allowedAssets: ["USDt", "BTC"] }),
    confirm: makeConfirm(rl),
  });

  console.log("Local AI Wallet Agent (M1 skeleton, mock wallet, testnet dry-run)");
  console.log('Try: "balance", "history", "send 40 usdt to alex", "send 800 usdt to 0xnew".');
  console.log('Type "exit" to quit.\n');

  for (;;) {
    const line = (await rl.question("> ")).trim();
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
