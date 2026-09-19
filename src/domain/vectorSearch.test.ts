import { describe, expect, it } from "vitest";
import { cosineSimilarity, rankByEmbedding } from "./vectorSearch";

describe("vector search helpers", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("ranks more similar vectors first", () => {
    const ranked = rankByEmbedding([1, 0], [
      { item: "close", embedding: [0.9, 0.1] },
      { item: "far", embedding: [0, 1] },
    ]);
    expect(ranked[0].item).toBe("close");
  });
});
