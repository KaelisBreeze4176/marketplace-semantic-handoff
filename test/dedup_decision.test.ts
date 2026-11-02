import assert from "node:assert/strict";
import test from "node:test";
import { decideHandoff } from "../src/dedup_decision.js";

test("a near-duplicate buyer edit joins the seller's existing order handoff", () => {
  const result = decideHandoff("asset-buyer-edit", [
    { id: "asset-original", score: 0.92, metadata: { orderId: "order-2048" } },
    { id: "asset-other", score: 0.61, metadata: { orderId: "order-99" } },
  ]);

  assert.deepEqual(result, {
    action: "attach_to_existing",
    assetId: "asset-buyer-edit",
    orderId: "order-2048",
    similarity: 0.92,
  });
});

test("a distinct buyer asset starts a new handoff", () => {
  assert.deepEqual(
    decideHandoff("asset-new", [{ id: "asset-original", score: 0.72, metadata: { orderId: "order-2048" } }]),
    { action: "create_new_handoff", assetId: "asset-new", similarity: 0.72 },
  );
});
