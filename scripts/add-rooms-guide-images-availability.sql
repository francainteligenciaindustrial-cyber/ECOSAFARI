-- ECOSAFARI BRASIL: DETALHES PEDIDOS NA ATA DA REUNIÃO (Eco Safari e Jaguar)
-- Rode isso no SQL Editor do Supabase. Idempotente: seguro rodar mais de uma vez.
--
-- Fecha 3 lacunas encontradas ao comparar o site com a ata da reunião:
--  1. Pousada não tinha estrutura de quartos ("quantidade de quartos, cada
--     quarto quantas pessoas") — só um número agregado de capacidade.
--  2. Guia só tinha uma foto de perfil, não uma galeria — a ata pede
--     "galerias" (plural) no perfil do guia, igual pousada/atração já têm.
--  3. Atrações (Paradas Legais/Restaurantes) não tinham nenhuma informação
--     de disponibilidade/horário de funcionamento.

-- 1. Quartos da pousada — array de {type, capacity, quantity}, guardado
-- como string JSON, no mesmo padrão de "features"/"activities"/"experiences".
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS rooms TEXT;

-- 2. Galeria de fotos do guia — array de URLs, mesmo padrão de
-- "languages"/"specialty"/"interests" (guides.images fica separado de
-- guides."photoUrl", que continua sendo a foto de perfil/avatar).
ALTER TABLE guides ADD COLUMN IF NOT EXISTS images TEXT;

-- 3. Disponibilidade/horário de funcionamento da atração — texto livre
-- (ex: "Terça a domingo, 11h às 22h"), editável pelo admin ou pelo próprio
-- parceiro no Portal do Parceiro.
ALTER TABLE atracoes ADD COLUMN IF NOT EXISTS availability TEXT;
