-- ECOSAFARI BRASIL: AGENDA DE DISPONIBILIDADE + "SITE PRÓPRIO" DA POUSADA
-- Rode isso no SQL Editor do Supabase.

-- Datas específicas em que a pousada não aceita reserva (manutenção,
-- reforma, evento fechado etc) — mesmo padrão já usado em guides
-- (unavailableDates), editável pela própria pousada no portal do parceiro.
-- Guardado como TEXT (JSON de um array de strings YYYY-MM-DD), igual guides.
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "unavailableDates" TEXT;

-- Escolha entre "criar site manualmente" (usa o editor + /site/:slug
-- gerados pela EcoSafari, os campos officialSiteImages/teamPhotoUrl/etc)
-- e "já tenho meu próprio site" (aponta pro link real em vez de gerar um).
-- hasOwnWebsite=false é o padrão: pousadas existentes continuam usando o
-- site gerado até o parceiro marcar que já tem o próprio.
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "hasOwnWebsite" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "ownWebsiteUrl" TEXT;
