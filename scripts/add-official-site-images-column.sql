-- ECOSAFARI BRASIL: GALERIA EXCLUSIVA DO SITE OFICIAL (/site/:slug)
-- Rode isso no SQL Editor do Supabase.
--
-- Antes, a página "Site Oficial" de cada pousada (/site/:slug) mostrava a
-- mesma galeria de fotos usada na visão detalhada do catálogo (coluna
-- "images") — não havia como ter fotos exclusivas de um lugar sem afetar o
-- outro. Esta coluna guarda uma galeria independente: quando vazia, o Site
-- Oficial cai de volta para "images" automaticamente (nenhuma pousada
-- existente fica sem fotos por não ter esse campo preenchido ainda).

ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "officialSiteImages" TEXT; -- armazenado como string JSON, igual "images"
