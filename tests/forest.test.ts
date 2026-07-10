import { test } from "node:test";
import assert from "node:assert/strict";
import { ForestRiskEngine } from "../src/risk/forest.js";

const KNOWN = ["alex", "payroll", "coffee-shop", "landlord"];

function assess(engine: ForestRiskEngine, amount: number, recipient: string) {
  return engine.assess({ amount, asset: "USDt", recipient, balance: 1250, knownRecipients: KNOWN });
}

test("normal transfers score low", async () => {
  const e = new ForestRiskEngine();
  for (const amount of [40, 30, 60, 25, 75]) {
    const r = await assess(e, amount, "alex");
    assert.equal(r.level, "low", `amount ${amount} -> ${r.level} (${r.score.toFixed(3)})`);
  }
});

test("a large transfer to a new recipient scores high", async () => {
  const r = await assess(new ForestRiskEngine(), 800, "0xnew");
  assert.equal(r.level, "high");
  assert.ok(r.score > 0.6);
});

test("an unfamiliar recipient is flagged even at a normal amount", async () => {
  const r = await assess(new ForestRiskEngine(), 50, "0xstranger");
  assert.notEqual(r.level, "low");
});

test("overspending the balance is forced high (deterministic safety floor)", async () => {
  const e = new ForestRiskEngine();
  const r = await e.assess({
    amount: 5000,
    asset: "USDt",
    recipient: "alex",
    balance: 1250,
    knownRecipients: KNOWN,
  });
  assert.equal(r.level, "high");
});

test("evaluation: recall and precision on a planted anomaly set", async () => {
  const e = new ForestRiskEngine();
  const normals: Array<[number, string]> = [
    [35, "alex"],
    [45, "payroll"],
    [55, "landlord"],
    [28, "alex"],
    [68, "coffee-shop"],
    [42, "alex"],
  ];
  const anomalies: Array<[number, string]> = [
    [800, "0xnew"],
    [1000, "0xnew"],
    [50, "0xstranger"],
    [300, "0xnew"],
    [900, "payroll"],
  ];

  let tp = 0;
  let fn = 0;
  let fp = 0;
  let tn = 0;
  for (const [a, r] of normals) {
    const x = await assess(e, a, r);
    x.level === "low" ? tn++ : fp++;
  }
  for (const [a, r] of anomalies) {
    const x = await assess(e, a, r);
    x.level !== "low" ? tp++ : fn++;
  }

  const recall = tp / (tp + fn);
  const precision = tp / (tp + fp);
  assert.ok(recall >= 0.8, `recall ${recall.toFixed(2)}`);
  assert.ok(precision >= 0.8, `precision ${precision.toFixed(2)}`);
});
