import express from "express";
import { z } from "zod";
import { decideHandoff } from "./dedup_decision.js";
import { InfraiError, InfraiMarketplace } from "./infrai_marketplace.js";

const sellerAssetSchema = z.object({
  assetId: z.string().min(1),
  sellerId: z.string().min(1),
  orderId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  mediaType: z.enum(["image", "video", "audio", "document"]),
});

const buyerUpdateSchema = z.object({
  assetId: z.string().min(1),
  buyerId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  mediaType: z.enum(["image", "video", "audio", "document"]),
});

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const collection = process.env.INFRAI_COLLECTION ?? "marketplace-assets";
const semanticIndex = new InfraiMarketplace(apiKey);
const app = express();
app.use(express.json());

function assetText(asset: { title: string; description: string; mediaType: string }): string {
  return `${asset.mediaType}\n${asset.title}\n${asset.description}`;
}

app.post("/seller-assets", async (request, response, next) => {
  try {
    const asset = sellerAssetSchema.parse(request.body);
    const embedding = await semanticIndex.embed(assetText(asset));
    await semanticIndex.upsertAsset({
      collection,
      id: asset.assetId,
      embedding,
      metadata: { sellerId: asset.sellerId, orderId: asset.orderId, mediaType: asset.mediaType },
    });
    response.status(201).json({ assetId: asset.assetId, state: "indexed", orderId: asset.orderId });
  } catch (error) {
    next(error);
  }
});

app.post("/buyer-updates", async (request, response, next) => {
  try {
    const update = buyerUpdateSchema.parse(request.body);
    const embedding = await semanticIndex.embed(assetText(update));
    const neighbors = await semanticIndex.queryAssets(collection, embedding);
    response.json(decideHandoff(update.assetId, neighbors));
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: "invalid_request", issues: error.issues });
    return;
  }
  if (error instanceof InfraiError) {
    const status = error.status >= 400 && error.status < 500 ? error.status : 502;
    response.status(status).json({ error: error.code, message: error.message });
    return;
  }
  response.status(500).json({ error: "service_error" });
});

async function start(): Promise<void> {
  await semanticIndex.createCollection(collection);
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => console.log(`Marketplace dedup service listening on http://localhost:${port}`));
}

await start();
