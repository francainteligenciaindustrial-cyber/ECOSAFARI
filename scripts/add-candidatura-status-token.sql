-- ECOSAFARI BRASIL: TOKEN DE CONSULTA DE CANDIDATURA
-- Rode isso no SQL Editor do Supabase. Adiciona a coluna usada por
-- GET /api/candidaturas/status para exigir email + token (não só email) —
-- sem isso, qualquer um que soubesse/chutasse o email de um candidato via
-- /status-candidatura conseguia ver nome, telefone e mensagem dele.

ALTER TABLE candidaturas ADD COLUMN IF NOT EXISTS "statusToken" TEXT;
