-- ECOSAFARI BRASIL: ATRAÇÕES, PERFIL DE GUIA MAIS RICO E AVALIAÇÕES UNIFICADAS
-- Rode isso no SQL Editor do Supabase. Idempotente: seguro rodar mais de uma vez.
--
-- Cobre 3 melhorias:
--  1. Nova tabela "atracoes" — parceiro que não é hospedagem ("Parada Legal"
--     ou "Restaurante"), separado de "pousadas" porque nem todo parceiro tem
--     quartos pra reservar.
--  2. Novos campos em "guides" (bio, idade, origem, interesses, nota, foto de
--     perfil) para um perfil de guia mais completo.
--  3. "reviews" passa a aceitar avaliação de atração e de guia, não só de
--     pousada (colunas "atracaoId"/"guideId" novas, ambas opcionais).
--
-- Não cria nenhuma coluna de "dono" nas tabelas — o vínculo de acesso de
-- parceiro (autoatendimento) fica inteiramente no app_metadata do usuário no
-- Supabase Auth (role="partner", partnerType, partnerId), criado só pelo
-- backend com a service_role key via POST /api/partners/invite. Isso é
-- reforçado no Express (requirePartnerAccess em server.ts) e não depende de
-- nenhuma policy de RLS adicional.

-- ============================================================
-- 1. TABELA DE ATRAÇÕES
-- ============================================================
CREATE TABLE IF NOT EXISTS atracoes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('parada_legal', 'restaurante')),
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  images TEXT,      -- armazenado como string JSON, igual pousadas.images
  menu TEXT,         -- cardápio (string JSON) — só relevante para type = 'restaurante'
  rating FLOAT DEFAULT 5.0,
  verified BOOLEAN DEFAULT false,
  "dateCreated" TEXT
);

-- Sem policies públicas — só o backend (com a service_role key) lê/grava,
-- exatamente como as demais tabelas do projeto (ver lockdown-rls.sql).
ALTER TABLE atracoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura pública de atracoes" ON atracoes;
DROP POLICY IF EXISTS "Permitir escrita pública de atracoes" ON atracoes;

CREATE INDEX IF NOT EXISTS idx_atracoes_type ON atracoes (type);

-- ============================================================
-- 2. NOVOS CAMPOS EM GUIDES
-- ============================================================
ALTER TABLE guides ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS birthplace TEXT;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS interests TEXT; -- armazenado como string JSON, igual languages/specialty
ALTER TABLE guides ADD COLUMN IF NOT EXISTS rating FLOAT DEFAULT 5.0;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS "photoUrl" TEXT; -- foto de perfil pública, exibida em /guias/:id

-- ============================================================
-- 3. AVALIAÇÕES UNIFICADAS (pousada, atração OU guia)
-- ============================================================
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "atracaoId" TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "guideId" TEXT;
-- "pousadaId" já existia e continua igual; nenhuma avaliação antiga precisa
-- de alteração — todas continuam válidas com "atracaoId"/"guideId" nulos.

CREATE INDEX IF NOT EXISTS idx_reviews_atracao ON reviews ("atracaoId");
CREATE INDEX IF NOT EXISTS idx_reviews_guide ON reviews ("guideId");
