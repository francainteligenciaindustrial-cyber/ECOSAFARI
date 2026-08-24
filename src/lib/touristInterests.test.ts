import { describe, it, expect } from "vitest";
import { TOURIST_INTEREST_GROUPS, TOURIST_INTEREST_OPTIONS } from "./touristInterests";

describe("touristInterests", () => {
  it("TOURIST_INTEREST_OPTIONS is the flattened union of every group's options", () => {
    const flattened = TOURIST_INTEREST_GROUPS.flatMap(g => g.options);
    expect(TOURIST_INTEREST_OPTIONS).toEqual(flattened);
  });

  it("has no duplicate option across groups (must match server.ts's validation list 1:1)", () => {
    const seen = new Set<string>();
    for (const option of TOURIST_INTEREST_OPTIONS) {
      expect(seen.has(option)).toBe(false);
      seen.add(option);
    }
  });

  it("every group has a label and at least one option", () => {
    for (const group of TOURIST_INTEREST_GROUPS) {
      expect(group.label.length).toBeGreaterThan(0);
      expect(group.options.length).toBeGreaterThan(0);
    }
  });
});
