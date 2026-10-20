-- ECOSAFARI BRASIL: DOMÍNIO PRÓPRIO DO SITE OFICIAL DA POUSADA
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- Com isso, ex.: pousadavagalume.com abre o site oficial da pousada
-- (/site/<slug>) direto na raiz, com o endereço da pousada na barra. Reserva,
-- cadastro e pagamento continuam no domínio principal do EcoSafari.
-- O domínio também precisa ser adicionado ao projeto na Vercel (Settings >
-- Domains) e apontado no DNS — ver RUNBOOK.md.
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "customDomain" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pousadas_custom_domain ON pousadas (lower("customDomain")) WHERE "customDomain" IS NOT NULL AND "customDomain" <> '';
