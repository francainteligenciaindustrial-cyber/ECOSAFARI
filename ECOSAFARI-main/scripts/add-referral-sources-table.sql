-- ECOSAFARI BRASIL: TABELA DE ORIGEM DOS VISITANTES
-- Guarda as respostas da pesquisa "como você chegou até nós?" mostrada no
-- primeiro acesso do site. Rode isso no SQL Editor do Supabase:

CREATE TABLE IF NOT EXISTS referral_sources (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  "otherText" TEXT,
  timestamp TEXT
);

ALTER TABLE referral_sources ENABLE ROW LEVEL SECURITY;
-- Sem policies públicas: só o backend (service_role) lê/grava essa tabela,
-- consistente com o resto do banco depois do lockdown de RLS.
