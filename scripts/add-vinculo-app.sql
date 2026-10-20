-- ECOSAFARI BRASIL: VÍNCULO POUSADA DO SITE ↔ POUSADA DO APP ECOSAFARI GO
-- Rode no SQL Editor do Supabase DO SITE. Pode rodar mais de uma vez.
--
-- Guarda o ID (UUID) da pousada no app. O vínculo é feito pelo admin em
-- Gestão → Pousadas → Editar, escolhendo da lista que vem do próprio app —
-- nunca pelo nome, que pode se repetir. Com isso, os avistamentos aprovados
-- no app alimentam o calendário de melhor época e o mapa do site.
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "appLodgeId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pousadas_app_lodge ON pousadas ("appLodgeId") WHERE "appLodgeId" IS NOT NULL AND "appLodgeId" <> '';
