-- ECOSAFARI BRASIL: ESTACIONAMENTO/WI-FI + ABA "REDES SOCIAIS" DA POUSADA
-- Rode isso no SQL Editor do Supabase.

ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "hasParking" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "hasWifi" BOOLEAN NOT NULL DEFAULT false;

-- officialSiteUrl (já existe) passa a representar o Instagram — pousadas
-- antigas que já tinham um link de Instagram salvo ali não perdem esse
-- dado. Os três abaixo são novos.
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "facebookUrl" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "tiktokUrl" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "youtubeUrl" TEXT;
