import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error("Uso: tsx scripts/create-admin.ts <email> <senha>");
    process.exit(1);
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error("SUPABASE_SERVICE_ROLE_KEY não configurada no .env");
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "admin" }
  });

  if (error) {
    console.error("Erro ao criar admin:", error.message);
    process.exit(1);
  }

  console.log(`Admin criado com sucesso: ${data.user?.email} (id: ${data.user?.id})`);
}

main();
