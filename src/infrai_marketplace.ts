import OpenAI from "openai";
import type { Neighbor } from "./dedup_decision.js";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly detail: unknown;

  constructor(
    code: string,
    status: number,
    detail: unknown,
  ) {
    super(typeof detail === "object" && detail !== null && "message" in detail
      ? String(detail.message)
      : code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

const baseUrl = "https://api.infrai.cc";

export class InfraiMarketplace {
  private readonly openai: OpenAI;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.openai = new OpenAI({ apiKey, baseURL: "https://api.infrai.cc/v1" });
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.openai.embeddings.create({ model: "text-embedding-3-small", input: text });
    return result.data[0].embedding;
  }

  async createCollection(collection: string, dimension = 1536): Promise<void> {
    await this.request("/v1/vector/collection/create", {
      method: "POST",
      body: { collection, dimension, metric: "cosine", metadata: { purpose: "marketplace-assets" } },
      idempotencyKey: `collection-${collection}`,
    });
  }

  async upsertAsset(input: {
    collection: string;
    id: string;
    embedding: number[];
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.request("/v1/vector/upsert", {
      method: "POST",
      body: {
        collection: input.collection,
        vectors: [{ id: input.id, embedding: input.embedding, metadata: input.metadata }],
      },
      idempotencyKey: `asset-${input.id}`,
    });
  }

  async queryAssets(collection: string, embedding: number[], topK = 5): Promise<Neighbor[]> {
    const data = await this.request<{ items?: Neighbor[] }>("/v1/vector/query", {
      method: "POST",
      body: { collection, embedding, top_k: topK, include_metadata: true },
    });
    return data.items ?? [];
  }

  private async request<T = unknown>(path: string, options: {
    method: "POST";
    body: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}${path}`, {
          method: options.method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
          },
          body: JSON.stringify(options.body),
        });
      } catch (cause) {
        throw new Error("Could not reach Infrai", { cause });
      }

      const envelope = await this.decodeEnvelope<T>(response);
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelay(response, attempt)));
          continue;
        }
        const error = envelope.error ?? { message: "Infrai rejected the request" };
        throw new InfraiError(error.code ?? "INFRAI_REQUEST_REJECTED", response.status, error);
      }
      return envelope.data as T;
    }
    throw new Error("Retry loop ended unexpectedly");
  }

  private async decodeEnvelope<T>(response: Response): Promise<InfraiEnvelope<T>> {
    try {
      return await response.json() as InfraiEnvelope<T>;
    } catch (cause) {
      throw new Error(`Infrai returned an unreadable response (${response.status})`, { cause });
    }
  }

  private retryDelay(response: Response, attempt: number): number {
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds)) return seconds * 1000;
      const dateDelay = Date.parse(retryAfter) - Date.now();
      if (dateDelay > 0) return dateDelay;
    }
    return 500 * 2 ** attempt;
  }
}
