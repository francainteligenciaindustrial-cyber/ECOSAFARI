// One-time setup: creates the public "site-media" Supabase Storage bucket
// used by POST /api/upload-image (see server.ts). Safe to re-run — no-ops
// if the bucket already exists.
//
// Usage: node scripts/create-storage-bucket.mjs
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env.

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: existing, error: listError } = await supabase.storage.listBuckets();
if (listError) {
  console.error("Erro ao listar buckets:", listError.message);
  process.exit(1);
}

if (existing?.some((b) => b.name === "site-media")) {
  console.log("Bucket 'site-media' já existe — nada a fazer.");
} else {
  const { error } = await supabase.storage.createBucket("site-media", {
    public: true,
    fileSizeLimit: "8MB",
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  });
  if (error) {
    console.error("Erro ao criar bucket:", error.message);
    process.exit(1);
  }
  console.log("Bucket 'site-media' criado com sucesso.");
}
