-- ECOSAFARI BRASIL: DETALHAMENTO DE SERVIÇOS E ACOMODAÇÕES DA POUSADA
-- Rode isso no SQL Editor do Supabase.
--
-- Aba "Serviços" do portal do parceiro — tipos de culinária, transporte,
-- entretenimento e um texto livre de atendimento/necessidades especiais.
-- Mesmo padrão TEXT+JSON já usado em features/activities/unavailableDates.
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "cuisineTypes" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "transportOptions" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "entertainmentOptions" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "serviceNotes" TEXT;

-- "rooms" e "menu" já existem como colunas TEXT (JSON) — as novas
-- propriedades por quarto (hasAC/hasTV/hasMinibar/bathroomType) e por item
-- de cardápio (category) entram dentro desse mesmo JSON, sem precisar de
-- coluna nova.
