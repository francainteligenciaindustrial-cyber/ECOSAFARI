import { describe, expect, it } from "vitest";
import { readGpsFromJpeg } from "./exifGps";

// Monta um JPEG mínimo (SOI + APP1/EXIF com IFD0 → GPS IFD) em memória.
function jpegWithGps(lat: [number, number, number], latRef: string, lng: [number, number, number], lngRef: string, little = false): ArrayBuffer {
  const tiff: number[] = [];
  const w16 = (v: number) => (little ? tiff.push(v & 255, v >> 8) : tiff.push(v >> 8, v & 255));
  const w32 = (v: number) => (little ? tiff.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24) : tiff.push(v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255));
  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]));
  w16(42);
  w32(8); // IFD0 em 8
  // IFD0: 1 entrada (GPS pointer)
  w16(1);
  w16(0x8825); w16(4); w32(1); w32(26); // GPS IFD em 26
  w32(0);
  // GPS IFD (offset 26): 4 entradas
  const ratOffset = 26 + 2 + 4 * 12 + 4; // 80
  w16(4);
  w16(1); w16(2); w32(2); tiff.push(latRef.charCodeAt(0), 0, 0, 0);
  w16(2); w16(5); w32(3); w32(ratOffset);
  w16(3); w16(2); w32(2); tiff.push(lngRef.charCodeAt(0), 0, 0, 0);
  w16(4); w16(5); w32(3); w32(ratOffset + 24);
  w32(0);
  for (const v of [...lat, ...lng]) { w32(Math.round(v * 100)); w32(100); }

  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const size = app1.length + 2;
  const bytes = [0xff, 0xd8, 0xff, 0xe1, size >> 8, size & 255, ...app1, 0xff, 0xd9];
  return new Uint8Array(bytes).buffer;
}

describe("readGpsFromJpeg", () => {
  it("lê latitude/longitude do Pantanal (sul/oeste negativos)", () => {
    const gps = readGpsFromJpeg(jpegWithGps([17, 21, 0], "S", [56, 45, 36], "W"));
    expect(gps).toEqual({ latitude: -17.35, longitude: -56.76 });
  });

  it("funciona com EXIF little-endian (Intel)", () => {
    const gps = readGpsFromJpeg(jpegWithGps([16, 30, 0], "S", [56, 0, 0], "W", true));
    expect(gps).toEqual({ latitude: -16.5, longitude: -56 });
  });

  it("retorna null sem EXIF ou quando não é JPEG", () => {
    expect(readGpsFromJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toBeNull();
    expect(readGpsFromJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull();
  });
});
