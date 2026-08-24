-- ECOSAFARI BRASIL: INTERESSES DO PERFIL DE TURISTA
-- Rode isso no SQL Editor do Supabase.
--
-- Categorias fixas (passeios/aventuras, fauna/flora) que o turista marca no
-- próprio perfil — dado estruturado pra IA do chat cruzar depois contra
-- atividades de pousada/guia, em vez do texto livre solto que já existia em
-- "preferences". Coluna nova, sem ambiguidade de tipo com nada legado.
ALTER TABLE turistas ADD COLUMN IF NOT EXISTS interests JSONB DEFAULT '[]'::jsonb;
