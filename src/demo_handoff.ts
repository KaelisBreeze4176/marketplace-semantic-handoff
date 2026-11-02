export {};

const baseUrl = process.env.SERVICE_URL ?? "http://localhost:3000";

async function post(path: string, body: Record<string, string>): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(result));
  return result;
}

const seller = await post("/seller-assets", {
  assetId: "asset-cover-v1",
  sellerId: "seller-studio-7",
  orderId: "order-2048",
  title: "Indigo podcast cover with white microphone",
  description: "Square cover art, centered microphone, pale title lettering",
  mediaType: "image",
});

const buyer = await post("/buyer-updates", {
  assetId: "asset-cover-buyer-edit",
  buyerId: "buyer-42",
  title: "Podcast artwork in indigo with a white mic",
  description: "Square artwork with a centered microphone and light title text",
  mediaType: "image",
});

console.log(JSON.stringify({ seller, buyer }, null, 2));
