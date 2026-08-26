-- ECOSAFARI BRASIL: CALENDÁRIO GOOGLE DEDICADO POR POUSADA
-- Rode isso no SQL Editor do Supabase.
--
-- Até então toda reserva confirmada de toda pousada caía no mesmo
-- calendário "primary" da conta Google conectada (ver POST /api/auth/google
-- em server.ts) — sem separação nenhuma entre pousadas. Esta coluna guarda
-- o ID de um calendário Google dedicado por pousada, dentro dessa MESMA
-- conta já conectada (não é uma segunda conexão OAuth por pousada).
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "googleCalendarId" TEXT;
