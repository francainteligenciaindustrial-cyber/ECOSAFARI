import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import dotenv from "dotenv";

dotenv.config();

// Os 3 admins-chefe fundadores do projeto — únicos que podem votar em
// propostas de admin (ver requireChief e POST /api/admin/proposals/:id/vote
// em server.ts). Marcados direto no banco via service_role, nunca por uma
// rota que o cliente possa chamar, para que ninguém consiga virar chefe
// sozinho. Rode "npx tsx scripts/set-chief-admins.ts" uma vez para aplicar.
const CHIEF_EMAILS = [
  "francainteligenciaindustrial@gmail.com",
  "silvaeliton0920@gmail.com",
  "bernardo445@gmail.com",
];

async function main() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error("SUPABASE_SERVICE_ROLE_KEY não configurada no .env");
    process.exit(1);
  }
  const supabase = createClient(process.env.SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr || !existing) {
    console.error("Erro ao listar usuários:", listErr?.message);
    process.exit(1);
  }

  // Mesmo padrão do SITE_URL em server.ts: sem a env var definida, cai no
  // domínio real (não localhost) — um link de convite gerado sem isso
  // aponta pra uma página morta, exatamente o bug que já aconteceu antes.
  const siteUrl = (process.env.SITE_URL || "https://www.ecosafaribrasil.com.br").replace(/\/$/, "");

  for (const email of CHIEF_EMAILS) {
    const match = existing.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
    // isChief nunca substitui um papel que a conta já tenha (turista,
    // parceiro) — um guia ou turista pode virar admin-chefe sem perder o
    // próprio perfil de guia/turista.
    const chiefMetadata = { isAdmin: true, isChief: true };

    if (match) {
      const mergedMetadata = { ...(match.app_metadata || {}), ...chiefMetadata };
      const { error } = await supabase.auth.admin.updateUserById(match.id, { app_metadata: mergedMetadata });
      if (error) {
        console.error(`${email}: erro ao promover a admin-chefe:`, error.message);
      } else {
        console.log(`${email}: já tinha conta (id ${match.id}) — agora é admin-chefe. Papéis preservados: ${JSON.stringify(match.app_metadata || {})}`);
      }
      continue;
    }

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: randomUUID(),
      email_confirm: true,
      app_metadata: chiefMetadata,
    });
    if (createErr || !created.user) {
      console.error(`${email}: erro ao criar conta:`, createErr?.message);
      continue;
    }

    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${siteUrl}/parceiro` },
    });
    if (linkErr) {
      console.warn(`${email}: conta criada como admin-chefe, mas falha ao gerar link de acesso:`, linkErr.message);
    } else {
      console.log(`${email}: conta criada como admin-chefe. Link para definir a senha:\n${linkData.properties?.action_link}`);
    }
  }
}

main();
