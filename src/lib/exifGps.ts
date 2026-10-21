// Lê as coordenadas GPS gravadas pela câmera/celular no EXIF de um JPEG —
// é assim que o post do turista marca sozinho o local onde a foto foi
// tirada. Precisa rodar no arquivo ORIGINAL (antes do upload), porque o
// servidor/navegador pode recomprimir a imagem e descartar o EXIF.
// Sem dependência externa: só o pedaço do formato TIFF/EXIF que o GPS usa.

export interface GpsCoords {
  latitude: number;
  longitude: number;
}

const TAG_GPS_IFD = 0x8825;
const GPS_LAT_REF = 0x0001;
const GPS_LAT = 0x0002;
const GPS_LNG_REF = 0x0003;
const GPS_LNG = 0x0004;

export function readGpsFromJpeg(buffer: ArrayBuffer): GpsCoords | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null; // não é JPEG
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    const size = view.getUint16(offset + 2);
    if (marker === 0xe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966) {
      // "Exif\0\0" — o bloco TIFF começa logo depois.
      return readTiffGps(view, offset + 10);
    }
    if (marker === 0xda || size < 2) return null; // começou a imagem em si: sem EXIF
    offset += 2 + size;
  }
  return null;
}

function readTiffGps(view: DataView, tiff: number): GpsCoords | null {
  if (tiff + 8 > view.byteLength) return null;
  const order = view.getUint16(tiff);
  const little = order === 0x4949;
  if (!little && order !== 0x4d4d) return null;
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  const inRange = (o: number, len: number) => o >= 0 && o + len <= view.byteLength;

  const ifd0 = tiff + u32(tiff + 4);
  const gpsPointer = findTag(view, ifd0, TAG_GPS_IFD, little);
  if (gpsPointer === null) return null;
  const gpsIfd = tiff + u32(gpsPointer + 8);
  if (!inRange(gpsIfd, 2)) return null;

  const entries = u16(gpsIfd);
  const tags = new Map<number, number>();
  for (let i = 0; i < entries; i++) {
    const entry = gpsIfd + 2 + i * 12;
    if (!inRange(entry, 12)) return null;
    tags.set(u16(entry), entry);
  }

  const ref = (tag: number) => {
    const entry = tags.get(tag);
    return entry === undefined ? "" : String.fromCharCode(view.getUint8(entry + 8));
  };
  const dms = (tag: number) => {
    const entry = tags.get(tag);
    if (entry === undefined || u16(entry + 2) !== 5 || u32(entry + 4) < 3) return null; // 3 RATIONAL
    const at = tiff + u32(entry + 8);
    if (!inRange(at, 24)) return null;
    const part = (k: number) => {
      const den = u32(at + k * 8 + 4);
      return den ? u32(at + k * 8) / den : 0;
    };
    return part(0) + part(1) / 60 + part(2) / 3600;
  };

  const lat = dms(GPS_LAT);
  const lng = dms(GPS_LNG);
  if (lat === null || lng === null || (lat === 0 && lng === 0)) return null;
  const latitude = ref(GPS_LAT_REF) === "S" ? -lat : lat;
  const longitude = ref(GPS_LNG_REF) === "W" ? -lng : lng;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude: Math.round(latitude * 1e6) / 1e6, longitude: Math.round(longitude * 1e6) / 1e6 };
}

function findTag(view: DataView, ifd: number, tag: number, little: boolean): number | null {
  if (ifd + 2 > view.byteLength) return null;
  const entries = view.getUint16(ifd, little);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > view.byteLength) return null;
    if (view.getUint16(entry, little) === tag) return entry;
  }
  return null;
}

export async function readGpsFromFile(file: File): Promise<GpsCoords | null> {
  if (!/jpe?g$/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) return null;
  try {
    // O EXIF fica no começo do arquivo — 256 KB bastam e evitam ler fotos enormes inteiras.
    return readGpsFromJpeg(await file.slice(0, 256 * 1024).arrayBuffer());
  } catch {
    return null;
  }
}
