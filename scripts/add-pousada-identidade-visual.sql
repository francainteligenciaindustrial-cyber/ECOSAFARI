-- ECOSAFARI BRASIL: LOGO E PALETA DE CORES PRÓPRIA POR POUSADA
-- Rode isso no SQL Editor do Supabase.
--
-- Cada pousada pode ter sua própria logo + paleta de cores no Site Oficial
-- (/site/:slug), em vez de sempre herdar o verde/creme editorial padrão do
-- EcoSafari. Ausente = usa o padrão normalmente (nada muda pra quem não
-- configura). Ver PousadaOfficialSite.tsx.
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "themeColorPrimary" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "themeColorAccent" TEXT;

-- Pesqueiro Vagalume — logo (marinho + dourado, um vaga-lume) já enviada
-- pelo admin em public/pousadas/vagalume-logo.jpg. Ajuste os hex abaixo se
-- quiser um tom diferente; rode de novo a qualquer momento pra atualizar.
UPDATE pousadas
SET
  "logoUrl" = '/pousadas/vagalume-logo.jpg',
  "themeColorPrimary" = '#101B4C',
  "themeColorAccent" = '#E4B94E'
WHERE name = 'Pesqueiro Vagalume';
