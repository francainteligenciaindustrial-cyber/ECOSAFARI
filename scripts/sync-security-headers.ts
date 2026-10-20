// Regrava o bloco de cabeçalhos globais do vercel.json a partir de
// src/lib/securityHeaders.ts (a fonte única). Rode depois de mudar o CSP:
//   npx tsx scripts/sync-security-headers.ts
// O teste src/lib/securityHeaders.test.ts falha se alguém esquecer.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SECURITY_HEADERS } from "../src/lib/securityHeaders.js";

const vercelPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../vercel.json");
const vercel = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
const globalBlock = vercel.headers.find((h: { source: string }) => h.source === "/(.*)");
if (!globalBlock) throw new Error('vercel.json sem o bloco de headers "/(.*)"');

globalBlock.headers = Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value }));
fs.writeFileSync(vercelPath, JSON.stringify(vercel, null, 2) + "\n");
console.log("vercel.json atualizado com", Object.keys(SECURITY_HEADERS).length, "cabeçalhos.");
