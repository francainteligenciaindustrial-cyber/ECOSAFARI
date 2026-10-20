// Gera um .webp ao lado de cada .png/.jpg de public/pousadas e
// public/species (foo.png -> foo.webp), limitado a 1920px no maior lado.
// O original fica intacto: as URLs .png gravadas no Supabase continuam
// válidas e o <PictureImg> prefere o .webp, caindo no original se faltar.
// Substitui o antigo optimize_png.py (mesma saída, sem depender de Python).
//   node scripts/optimize-images.mjs          # só os que faltam
//   node scripts/optimize-images.mjs --force  # regera todos
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const MAX_DIM = 1920;
const QUALITY = 78;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const targets = ["pousadas", "species"].map(d => path.join(root, d));
const force = process.argv.includes("--force");

let before = 0;
let after = 0;
for (const dir of targets) {
  for (const name of fs.readdirSync(dir).sort()) {
    if (!/\.(png|jpe?g)$/i.test(name)) continue;
    const src = path.join(dir, name);
    const out = src.replace(/\.(png|jpe?g)$/i, ".webp");
    if (!force && fs.existsSync(out)) continue;
    await sharp(src)
      .rotate()
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 5 })
      .toFile(out);
    const a = fs.statSync(src).size;
    const b = fs.statSync(out).size;
    before += a;
    after += b;
    console.log(`${path.relative(root, src)}  ${(a / 1e6).toFixed(2)} MB -> ${(b / 1e6).toFixed(2)} MB`);
  }
}
if (before) console.log(`\nTotal: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB (${Math.round((1 - after / before) * 100)}% menor)`);
else console.log("Nada a fazer — todo .png/.jpg já tem .webp (use --force para regerar).");
