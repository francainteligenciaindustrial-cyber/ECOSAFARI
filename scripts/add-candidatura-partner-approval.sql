-- ECOSAFARI BRASIL: APROVAÇÃO DE CANDIDATURA VIRA PARCEIRO DE VERDADE
-- Rode isso no SQL Editor do Supabase. Idempotente: seguro rodar mais de uma vez.
--
-- Suporta POST /api/candidaturas/:id/approve, que substitui o fluxo manual
-- antigo (aprovar status → criar registro na mão → convidar acesso na mão)
-- por um único botão "Aprovar" que cria o registro do parceiro (pousada,
-- guia ou atração) e o login dele de uma vez.
--
--  1. "atracaoName"/"atracaoType" — candidatura de parceiro também passa a
--     cobrir Atrações (Parada Legal / Restaurante), não só guia e pousada.
--  2. "partnerId" — preenchido na aprovação, aponta pro registro criado em
--     pousadas/guides/atracoes (rastreabilidade: essa candidatura já virou
--     um parceiro de verdade, e qual).

ALTER TABLE candidaturas ADD COLUMN IF NOT EXISTS "atracaoName" TEXT;
ALTER TABLE candidaturas ADD COLUMN IF NOT EXISTS "atracaoType" TEXT;
ALTER TABLE candidaturas ADD COLUMN IF NOT EXISTS "partnerId" TEXT;
