import { describe, expect, it } from "vitest";
import { safeEqual } from "./safeEqual";

describe("safeEqual", () => {
  it("aceita strings iguais", () => {
    expect(safeEqual("Bearer abc123", "Bearer abc123")).toBe(true);
  });

  it("recusa strings diferentes, inclusive de tamanhos diferentes", () => {
    expect(safeEqual("Bearer abc123", "Bearer abc124")).toBe(false);
    expect(safeEqual("", "Bearer abc123")).toBe(false);
    expect(safeEqual("Bearer abc1234", "Bearer abc123")).toBe(false);
  });
});
