import { test } from "node:test";
import assert from "node:assert/strict";
import { RuleIntentParser } from "../src/intent/parser.js";
import { MockWallet } from "../src/wallet/wallet.js";
import { RuleRiskEngine } from "../src/risk/risk.js";
import { PolicyEngine } from "../src/policy/policy.js";
import { WalletAgent } from "../src/agent.js";
import { RuleInsightsEngine } from "../src/insights/insights.js";

function makeAgent(confirmAnswer: boolean): WalletAgent {
  return new WalletAgent({
    parser: new RuleIntentParser(),
    wallet: new MockWallet(),
    risk: new RuleRiskEngine(),
    policy: new PolicyEngine({ maxTransfer: 1000, allowedAssets: ["USDt", "BTC"] }),
    confirm: async () => confirmAnswer,
    insights: new RuleInsightsEngine(),
  });
}

test("reads balance", async () => {
  assert.equal(await makeAgent(false).handle("balance"), "Balance: 1250 USDt");
});

test("reads history", async () => {
  assert.match(await makeAgent(false).handle("history"), /alex/);
});

test("blocks an unknown request", async () => {
  assert.match(await makeAgent(false).handle("hello there"), /^Blocked/);
});

test("answers a spending-insights question from history", async () => {
  assert.match(await makeAgent(false).handle("what did i spend"), /transactions/i);
});

test("known small transfer, confirmed, broadcasts (simulated on the mock wallet)", async () => {
  const out = await makeAgent(true).handle("send 40 usdt to alex");
  assert.match(out, /Confirmed/);
  assert.match(out, /simulated/);
  assert.match(out, /Tx: 0x/);
});

test("declining a transfer sends nothing", async () => {
  assert.match(await makeAgent(false).handle("send 800 usdt to 0xnew"), /Cancelled/);
});

test("enforces the per-transfer limit in code, not the model", async () => {
  const out = await makeAgent(true).handle("send 5000 usdt to alex");
  assert.match(out, /exceeds the per-transfer limit/);
});
