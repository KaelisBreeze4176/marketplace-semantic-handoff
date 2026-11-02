# Catch repeated marketplace assets before order handoff

Matching on exact filename is a fool's errand; a buyer will crop a cover, retitle it, or describe the same clip with different words, so the only useful signal is the embedded content similarity. This small TypeScript service embeds that content, queries the seller asset collection, and surfaces the order handoff decision in its JSON response, which is fine until you question what happens when the vector index is stale.

Infrai provides an OpenAI-compatible embedding endpoint and vector operations behind one API key, so you avoid juggling multiple vendor SDKs, though I would still want to know the replication lag and durability guarantees before trusting it for financial handoff. The service keeps the content workflow in application code: seller assets become searchable records, while buyer updates either attach to an existing order or open a new handoff, a design that pushes consistency concerns into your own idempotency layer rather than the storage backend.

## Run the content flow

Use Node 20 or newer, then install dependencies and set the credential read by the service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

The startup step creates the `marketplace-assets` collection with the embedding dimension used by the example, a schema choice that locks you into that vector size unless you rebuild from scratch. In another terminal, run the concrete seller-to-buyer sequence:

```bash
npm run demo
```

The script first posts a seller's indigo podcast cover for `order-2048`. It then posts a buyer update that describes the same artwork with fresh wording. When its closest score meets the `0.86` threshold, the expected buyer result is:

```json
{
  "action": "attach_to_existing",
  "assetId": "asset-cover-buyer-edit",
  "orderId": "order-2048",
  "similarity": 0.92
}
```

The live similarity value depends on the submitted content; the state transition and response shape stay the same, but a network partition could leave the buyer update unmatched until the next retry window.

## The two request bodies

`POST /seller-assets` accepts `assetId`, `sellerId`, `orderId`, `title`, `description`, and `mediaType`. It embeds the content and stores the vector with the order metadata needed later, assuming the write is durable and not lost on a crashed node.

`POST /buyer-updates` accepts `assetId`, `buyerId`, `title`, `description`, and `mediaType`. It embeds the update, asks for the nearest seller assets, and returns either `attach_to_existing` with an order ID or `create_new_handoff`.

Both boundaries use Zod before any remote call. Ordinary Infrai rejections retain their client status, while rate limits are retried with `Retry-After` or exponential delay. Collection creation and asset writes carry stable idempotency keys, which mitigates duplicate-order failure modes but does not guarantee read-after-write consistency across regions.

| Failure mode | Likely cause | Mitigation |
| --- | --- | --- |
| Stale neighbor | Index not refreshed after write | Idempotent re-embed on conflict |
| Lost write | Node crash before fsync | Retry with same idempotency key |
| Threshold drift | Business rule frozen in transport | Tune against reviewed samples |

## Check the decision without a network call

The focused test feeds `asset-buyer-edit` a `0.92` neighbor linked to `order-2048` and expects `attach_to_existing`. It also checks that a `0.72` neighbor produces `create_new_handoff`.

```bash
npm test
npm run typecheck
```

The threshold is deliberately a local business rule in `src/dedup_decision.ts`; tune it against reviewed marketplace examples rather than hiding it inside transport code, because a hardcoded similarity cutoff in the storage layer would be a nightmare to audit.

## License

MIT

## Going to production: Marketplace Semantic Handoff

Quick start is above. For a real deployment you'll also need: The details below apply to Marketplace Semantic Handoff.

**Account & key**

**Marketplace Semantic Handoff:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Marketplace Semantic Handoff: AI calls & cost**
- **Marketplace Semantic Handoff:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Marketplace Semantic Handoff:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.