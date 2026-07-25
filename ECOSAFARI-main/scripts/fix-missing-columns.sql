-- ECOSAFARI BRASIL: COLUNAS FALTANTES
-- Essas colunas foram adicionadas ao código em turnos recentes, mas o ALTER
-- TABLE correspondente nunca chegou a rodar no seu banco Supabase de verdade
-- (eu só tinha atualizado o texto do script /api/supabase/sql, não bastava).
-- Isso fazia com que "verified", "viewCount", "officialSiteUrl" e o
-- "photoUrl" das avaliações parecessem funcionar (o servidor guarda em
-- memória), mas sumissem a cada restart porque a gravação real no banco
-- falhava silenciosamente. Rode isso no SQL Editor do Supabase:

ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT true;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "viewCount" INTEGER DEFAULT 0;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "officialSiteUrl" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "teamPhotoUrl" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "teamSectionTitle" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "teamSectionText" TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
