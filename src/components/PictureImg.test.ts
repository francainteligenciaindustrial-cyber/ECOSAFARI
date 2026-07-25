import { describe, it, expect } from "vitest";
import { toWebpCandidate } from "./PictureImg";

describe("toWebpCandidate", () => {
  it("swaps .png for .webp under /pousadas/", () => {
    expect(toWebpCandidate("/pousadas/vagalume-gazebo.png")).toBe("/pousadas/vagalume-gazebo.webp");
  });

  it("swaps .png for .webp under /species/", () => {
    expect(toWebpCandidate("/species/onca-pintada.png")).toBe("/species/onca-pintada.webp");
  });

  it("handles .jpg and .jpeg too", () => {
    expect(toWebpCandidate("/pousadas/foo.jpg")).toBe("/pousadas/foo.webp");
    expect(toWebpCandidate("/pousadas/foo.jpeg")).toBe("/pousadas/foo.webp");
  });

  it("returns null for external URLs — no .webp sibling was ever generated for those", () => {
    expect(toWebpCandidate("https://images.unsplash.com/photo-123?auto=format")).toBeNull();
  });

  it("returns null for paths outside /pousadas/ and /species/", () => {
    expect(toWebpCandidate("/favicon.svg")).toBeNull();
  });

  it("returns null for already-webp sources", () => {
    expect(toWebpCandidate("/pousadas/vagalume-gazebo.webp")).toBeNull();
  });
});
