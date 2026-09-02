-- ECOSAFARI BRASIL: MÚLTIPLAS PROPRIEDADES POR LOGIN DE PARCEIRO
-- Rode isso no SQL Editor do Supabase.
--
-- Até agora, 1 login de parceiro = 1 pousada/atração/guia (guardado em
-- app_metadata.partnerId no próprio usuário do Supabase Auth). Esta tabela
-- guarda vínculos ADICIONAIS — um dono de mais de uma pousada consegue
-- gerenciar todas com o mesmo login, sem precisar de uma conta por
-- propriedade. app_metadata continua sendo a propriedade "principal";
-- partner_links guarda as extras. Ver requirePartnerAccess/
-- provisionPartnerLogin/GET /api/my-partner-properties em server.ts.
CREATE TABLE IF NOT EXISTS partner_links (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "partnerType" TEXT NOT NULL CHECK ("partnerType" IN ('pousada', 'atracao', 'guia')),
  "partnerId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("userId", "partnerType", "partnerId")
);
CREATE INDEX IF NOT EXISTS partner_links_user_idx ON partner_links ("userId");

-- Sem policies públicas — só o backend (service_role) lê/grava, mesmo padrão
-- do resto do projeto (ver lockdown-rls.sql).
ALTER TABLE partner_links ENABLE ROW LEVEL SECURITY;
