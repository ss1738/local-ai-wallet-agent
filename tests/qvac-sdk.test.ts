import assert from "node:assert/strict";
import { test } from "node:test";

test("the pinned QVAC SDK exposes the adapter's required public API", async () => {
  const sdk = await import("@qvac/sdk");

  assert.equal(typeof sdk.loadModel, "function");
  assert.equal(typeof sdk.completion, "function");
  assert.equal(typeof sdk.ragIngest, "function");
  assert.equal(typeof sdk.ragSearch, "function");
  assert.ok(sdk.LLAMA_3_2_1B_INST_Q4_0);
  assert.ok(sdk.GTE_LARGE_FP16);
});
