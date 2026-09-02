-- ECOSAFARI BRASIL: POSTS DO TURISTA + FOTO DE CAPA (perfil estilo Facebook)
-- Rode isso no SQL Editor do Supabase.
--
-- Texto + foto opcional que o turista publica no próprio perfil — não é um
-- feed público, só o próprio turista vê os próprios posts.

-- Foto de capa do perfil — puramente estética, mesmo padrão de photoUrl.
ALTER TABLE turistas ADD COLUMN IF NOT EXISTS "coverPhotoUrl" TEXT;

CREATE TABLE IF NOT EXISTS turista_posts (
  id TEXT PRIMARY KEY,
  "turistaId" TEXT NOT NULL,
  text TEXT,
  "photoUrl" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS turista_posts_turista_idx ON turista_posts ("turistaId");

-- Sem policies públicas — só o backend (service_role) lê/grava, mesmo padrão
-- do resto do projeto (ver lockdown-rls.sql).
ALTER TABLE turista_posts ENABLE ROW LEVEL SECURITY;
