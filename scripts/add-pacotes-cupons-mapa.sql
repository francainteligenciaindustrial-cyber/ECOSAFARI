-- ECOSAFARI BRASIL: PACOTES, CUPONS E MAPA
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.

-- 1) Mapa interativo: posição exata de pousadas e atrações. Sem isso o mapa
--    usa uma posição aproximada pela cidade escrita em "location".
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE atracoes ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE atracoes ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- 2) Pacotes combinados (pousada + guia + atrações), vendidos por pessoa e
--    pagos num único checkout do Stripe — um item por componente.
CREATE TABLE IF NOT EXISTS pacotes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  "pousadaId" TEXT NOT NULL REFERENCES pousadas(id) ON DELETE CASCADE,
  "guideId" TEXT,
  "atracaoIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  nights INTEGER NOT NULL CHECK (nights BETWEEN 1 AND 30),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  "imageUrl" TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pacotes_ativos ON pacotes (active, "createdAt" DESC);
ALTER TABLE pacotes ENABLE ROW LEVEL SECURITY;

-- 3) Cupons promocionais: % OU valor fixo, validade, limite de usos, valor
--    mínimo e (opcional) uma pousada específica.
CREATE TABLE IF NOT EXISTS cupons (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  "percentOff" NUMERIC CHECK ("percentOff" IS NULL OR ("percentOff" > 0 AND "percentOff" <= 100)),
  "amountOff" NUMERIC CHECK ("amountOff" IS NULL OR "amountOff" > 0),
  "minTotal" NUMERIC,
  "maxUses" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "validFrom" DATE,
  "validUntil" DATE,
  "pousadaId" TEXT REFERENCES pousadas(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (("percentOff" IS NULL) <> ("amountOff" IS NULL))
);
ALTER TABLE cupons ENABLE ROW LEVEL SECURITY;

-- Consome um uso de forma atômica: só incrementa se ainda houver usos.
-- Devolve false quando o cupom esgotou (o servidor desfaz a reserva).
CREATE OR REPLACE FUNCTION cupom_registrar_uso(cupom_id TEXT) RETURNS BOOLEAN
LANGUAGE sql AS $$
  WITH upd AS (
    UPDATE cupons SET "usedCount" = "usedCount" + 1
    WHERE id = cupom_id AND active AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM upd);
$$;
REVOKE ALL ON FUNCTION cupom_registrar_uso(TEXT) FROM PUBLIC, anon, authenticated;

-- 4) Reserva guarda o pacote e o cupom usados (o checkout do Stripe monta os
--    itens e o desconto a partir daqui, inclusive no "pagar depois").
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "pacoteId" TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "cupomCode" TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "discountAmount" NUMERIC;

-- Sem policies públicas — só o backend (service_role) lê/grava, mesmo padrão
-- de scripts/lockdown-rls.sql.
