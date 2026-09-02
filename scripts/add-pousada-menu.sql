-- ECOSAFARI BRASIL: CARDÁPIO DE BAR/RESTAURANTE DA POUSADA
-- Rode isso no SQL Editor do Supabase.
--
-- Mesmo padrão do menu de atracoes (item + preço, guardado como TEXT com
-- JSON serializado) — algumas pousadas têm bar/restaurante próprio e
-- querem listar o cardápio no perfil (aba "Bar/Restaurantes" do portal do
-- parceiro).
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS menu TEXT;
