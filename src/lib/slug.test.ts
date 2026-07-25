import { describe, it, expect } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Pesqueiro Vagalume")).toBe("pesqueiro-vagalume");
  });

  it("strips accents", () => {
    expect(slugify("Refúgio Ecológico Onça-Pintada")).toBe("refugio-ecologico-onca-pintada");
  });

  it("collapses repeated non-alphanumeric runs into one hyphen", () => {
    expect(slugify("Pousada   do --- Cerrado!!!")).toBe("pousada-do-cerrado");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("  ---Ariranha---  ")).toBe("ariranha");
  });

  it("used as the URL for /site/:slug — must round-trip a pousada name uniquely enough to look it up again", () => {
    expect(slugify("Pesqueiro Vagalume")).not.toBe(slugify("Pesqueiro Vagalume 2"));
  });
});
