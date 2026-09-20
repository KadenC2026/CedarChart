import { describe, expect, it } from "vitest";
import { termColorClass } from "./terms";

describe("planner term colours", () => {
  it("assigns a distinct, stable colour token to each planner slot", () => {
    expect(Array.from({ length: 12 }, (_, index) => termColorClass(index))).toEqual([
      "term-color-1", "term-color-2", "term-color-3", "term-color-4",
      "term-color-5", "term-color-6", "term-color-7", "term-color-8",
      "term-color-9", "term-color-10", "term-color-11", "term-color-12",
    ]);
  });

  it("keeps colour assignments stable if future planner slots are added", () => {
    expect(termColorClass(12)).toBe("term-color-1");
    expect(termColorClass(-1)).toBe("term-color-12");
  });
});
