import { test } from "node:test";
import assert from "node:assert/strict";
import { RuleRiskEngine } from "../src/risk/risk.js";

test("a new recipient plus a large amount scores high", async () => {
  const r = await new RuleRiskEngine().assess({
    amount: 800,
    asset: "USDt",
    recipient: "0xnew",
    balance: 1250,
    knownRecipients: ["alex"],
  });
  assert.equal(r.level, "high");
  assert.ok(r.score >= 0.6);
});

test("a known, small transfer scores low", async () => {
  const r = await new RuleRiskEngine().assess({
    amount: 40,
    asset: "USDt",
    recipient: "alex",
    balance: 1250,
    knownRecipients: ["alex"],
  });
  assert.equal(r.level, "low");
});

test("spending more than the balance is flagged", async () => {
  const r = await new RuleRiskEngine().assess({
    amount: 5000,
    asset: "USDt",
    recipient: "alex",
    balance: 1250,
    knownRecipients: ["alex"],
  });
  assert.ok(r.reasons.some((reason) => /exceeds available balance/.test(reason)));
});
