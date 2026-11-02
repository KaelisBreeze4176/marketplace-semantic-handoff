export type Neighbor = {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
};

export type HandoffDecision =
  | { action: "attach_to_existing"; assetId: string; orderId: string; similarity: number }
  | { action: "create_new_handoff"; assetId: string; similarity: number | null };

export function decideHandoff(assetId: string, neighbors: Neighbor[], threshold = 0.86): HandoffDecision {
  const closest = [...neighbors].sort((a, b) => b.score - a.score)[0];
  const orderId = closest?.metadata?.orderId;

  if (closest && closest.score >= threshold && typeof orderId === "string") {
    return { action: "attach_to_existing", assetId, orderId, similarity: closest.score };
  }

  return { action: "create_new_handoff", assetId, similarity: closest?.score ?? null };
}
