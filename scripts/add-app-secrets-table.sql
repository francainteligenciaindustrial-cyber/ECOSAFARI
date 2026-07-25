-- ECOSAFARI BRASIL: TABELA DE SEGREDOS DA APLICAÇÃO (app_secrets)
-- Rode isso no SQL Editor do Supabase. Substitui o arquivo local
-- "google_tokens.json" que o backend usava antes para guardar os tokens
-- OAuth do Google Calendar — um arquivo em disco não sobrevive ao ambiente
-- serverless da Vercel (sistema de arquivos efêmero/somente leitura em
-- produção), então essa integração nunca funcionava de fato lá. Guardar
-- aqui também mantém os tokens sob o mesmo controle de acesso (RLS +
-- service_role) das demais tabelas, em vez de texto puro em disco.
--
-- Uma linha por chave (key/value), no mesmo espírito da tabela rate_limits
-- já usada para o rate limiting compartilhado entre instâncias serverless.

CREATE TABLE IF NOT EXISTS app_secrets (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Sem policies públicas — só o backend (com a service_role key) lê/grava
-- esta tabela, exatamente como as demais tabelas do projeto.
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura pública de app_secrets" ON app_secrets;
DROP POLICY IF EXISTS "Permitir escrita pública de app_secrets" ON app_secrets;
