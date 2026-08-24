import { describe, it, expect } from "vitest";
import { isAdminUser, isChiefUser, isTouristUser, isPartnerUser } from "./authRoles";

function user(app_metadata: Record<string, unknown>) {
  return { app_metadata };
}

describe("isAdminUser", () => {
  it("is true for the isAdmin flag", () => {
    expect(isAdminUser(user({ isAdmin: true }))).toBe(true);
  });
  it("is true for the legacy role field", () => {
    expect(isAdminUser(user({ role: "admin" }))).toBe(true);
  });
  it("is false for a plain tourist/partner account", () => {
    expect(isAdminUser(user({ role: "tourist" }))).toBe(false);
    expect(isAdminUser(user({ role: "partner" }))).toBe(false);
  });
  it("is false for null/undefined user", () => {
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser(undefined)).toBe(false);
  });
  it("does not treat a truthy non-boolean isAdmin as admin", () => {
    expect(isAdminUser(user({ isAdmin: "true" }))).toBe(false);
    expect(isAdminUser(user({ isAdmin: 1 }))).toBe(false);
  });
});

describe("isChiefUser", () => {
  it("is true only for the isChief flag", () => {
    expect(isChiefUser(user({ isChief: true }))).toBe(true);
    expect(isChiefUser(user({ isAdmin: true }))).toBe(false);
    expect(isChiefUser(null)).toBe(false);
  });
});

describe("isTouristUser", () => {
  it("is true for the isTourist flag", () => {
    expect(isTouristUser(user({ isTourist: true }))).toBe(true);
  });
  it("is true for the legacy role field", () => {
    expect(isTouristUser(user({ role: "tourist" }))).toBe(true);
  });
  it("coexists with an admin/partner account (additive flag, not exclusive)", () => {
    expect(isTouristUser(user({ role: "partner", isTourist: true }))).toBe(true);
    expect(isTouristUser(user({ isAdmin: true, isTourist: true }))).toBe(true);
  });
  it("is false when neither the flag nor the legacy role match", () => {
    expect(isTouristUser(user({ role: "admin" }))).toBe(false);
    expect(isTouristUser(user({ role: "partner" }))).toBe(false);
  });
});

describe("isPartnerUser", () => {
  it("is true only for the legacy partner role", () => {
    expect(isPartnerUser(user({ role: "partner" }))).toBe(true);
  });
  it("is false for admin/tourist accounts and unauthenticated visitors", () => {
    expect(isPartnerUser(user({ role: "admin" }))).toBe(false);
    expect(isPartnerUser(user({ role: "tourist" }))).toBe(false);
    expect(isPartnerUser(null)).toBe(false);
    expect(isPartnerUser(undefined)).toBe(false);
  });
});
