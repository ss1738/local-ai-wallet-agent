import type { RiskAssessment } from "../types.js";
import type { RiskEngine, RiskInput } from "./risk.js";

// Deterministic PRNG (mulberry32) so training and scoring are reproducible,
// which keeps the model's behaviour stable across runs and in CI.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Vec = number[];

interface INode {
  feature?: number;
  split?: number;
  left?: INode;
  right?: INode;
  size?: number; // set on external (leaf) nodes
}

/** Average path length of an unsuccessful search in a BST of n points. */
function cFactor(n: number): number {
  if (n <= 1) return 0;
  return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
}

function buildTree(data: Vec[], depth: number, maxDepth: number, rng: () => number): INode {
  if (depth >= maxDepth || data.length <= 1) return { size: data.length };
  const dims = data[0].length;
  const feature = Math.floor(rng() * dims);
  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v[feature] < min) min = v[feature];
    if (v[feature] > max) max = v[feature];
  }
  if (min === max) return { size: data.length };
  const split = min + rng() * (max - min);
  const left: Vec[] = [];
  const right: Vec[] = [];
  for (const v of data) (v[feature] < split ? left : right).push(v);
  return {
    feature,
    split,
    left: buildTree(left, depth + 1, maxDepth, rng),
    right: buildTree(right, depth + 1, maxDepth, rng),
  };
}

function pathLength(v: Vec, node: INode, depth: number): number {
  if (node.size !== undefined) return depth + cFactor(node.size);
  return v[node.feature!] < node.split!
    ? pathLength(v, node.left!, depth + 1)
    : pathLength(v, node.right!, depth + 1);
}

/**
 * Isolation Forest anomaly detector. Trains an ensemble of random isolation
 * trees on a sample of the data; points that are isolated in few splits are
 * anomalous. Score is in (0, 1); higher means more anomalous.
 */
export class IsolationForest {
  private trees: INode[] = [];
  private readonly c: number;

  constructor(data: Vec[], nTrees = 100, sampleSize = 256, seed = 42) {
    const rng = mulberry32(seed);
    const n = Math.min(sampleSize, data.length);
    const maxDepth = Math.ceil(Math.log2(Math.max(2, n)));
    this.c = cFactor(n);
    for (let t = 0; t < nTrees; t++) {
      const sample: Vec[] = [];
      for (let i = 0; i < n; i++) sample.push(data[Math.floor(rng() * data.length)]);
      this.trees.push(buildTree(sample, 0, maxDepth, rng));
    }
  }

  score(v: Vec): number {
    let avg = 0;
    for (const tree of this.trees) avg += pathLength(v, tree, 0);
    avg /= this.trees.length;
    return Math.pow(2, -avg / this.c);
  }
}

const TYPICAL_AMOUNT = 50;

/** Raw feature vector for a transfer: log-amount and unknown-recipient flag. */
function rawFeatures(amount: number, recipientUnknown: boolean): Vec {
  return [Math.log1p(amount), recipientUnknown ? 1 : 0];
}

/**
 * Risk engine backed by a trained Isolation Forest. The model is fit on a
 * profile of the account's transactions: a dense cluster of normal behaviour
 * (modest amounts to known recipients) plus sparse coverage of the anomaly
 * region so the trees can isolate it. Transfers that deviate (large amounts,
 * unfamiliar recipients) fall in low-density space and score as anomalous.
 * Features are standardized so their scales are comparable. A hard balance
 * check stays deterministic, in code, on top of the model.
 */
export class ForestRiskEngine implements RiskEngine {
  private readonly forest: IsolationForest;
  private readonly mean: Vec;
  private readonly std: Vec;

  constructor(seed = 42) {
    const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    const data: Vec[] = [];
    // Dense cluster of normal behaviour.
    for (let i = 0; i < 300; i++) {
      const amount = Math.max(1, TYPICAL_AMOUNT * (0.3 + rng() * 1.4)); // ~15..120
      data.push(rawFeatures(amount, false));
    }
    // Sparse anomaly-region coverage: unusually large amounts.
    for (let i = 0; i < 25; i++) {
      data.push(rawFeatures(TYPICAL_AMOUNT * (4 + rng() * 30), rng() < 0.6)); // ~200..1700
    }
    // Sparse coverage of unfamiliar recipients at normal amounts.
    for (let i = 0; i < 15; i++) {
      data.push(rawFeatures(Math.max(1, TYPICAL_AMOUNT * (0.3 + rng() * 1.4)), true));
    }

    const dims = data[0].length;
    this.mean = Array(dims).fill(0);
    this.std = Array(dims).fill(0);
    for (const v of data) for (let d = 0; d < dims; d++) this.mean[d] += v[d];
    for (let d = 0; d < dims; d++) this.mean[d] /= data.length;
    for (const v of data) for (let d = 0; d < dims; d++) this.std[d] += (v[d] - this.mean[d]) ** 2;
    for (let d = 0; d < dims; d++) this.std[d] = Math.sqrt(this.std[d] / data.length) || 1;

    this.forest = new IsolationForest(data.map((v) => this.standardize(v)), 120, 256, seed);
  }

  private standardize(v: Vec): Vec {
    return v.map((x, d) => (x - this.mean[d]) / this.std[d]);
  }

  async assess(input: RiskInput): Promise<RiskAssessment> {
    const unknown = !input.knownRecipients.includes(input.recipient.toLowerCase());
    const score = this.forest.score(this.standardize(rawFeatures(input.amount, unknown)));

    const reasons: string[] = [];
    if (unknown) reasons.push("Recipient is not in your normal set");
    if (input.amount > TYPICAL_AMOUNT * 3) reasons.push("Amount is unusually large for this account");
    if (input.amount > input.balance) reasons.push("Amount exceeds available balance");
    if (reasons.length === 0) reasons.push("Matches your normal pattern");

    let level: RiskAssessment["level"] = score >= 0.62 ? "high" : score >= 0.55 ? "medium" : "low";
    if (input.amount > input.balance) level = "high"; // deterministic safety floor

    return { score, level, reasons };
  }
}
