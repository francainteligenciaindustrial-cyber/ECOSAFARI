-- ECOSAFARI BRASIL: RECEITA, CONFIANÇA E CRESCIMENTO
-- Rode no SQL Editor do Supabase DO SITE. Pode rodar mais de uma vez.

-- 1) Receita -------------------------------------------------------------
-- Comissão da EcoSafari por pousada (NULL = padrão da plataforma, variável
-- COMISSAO_PADRAO_PCT na Vercel).
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "commissionPct" NUMERIC CHECK ("commissionPct" IS NULL OR ("commissionPct" >= 0 AND "commissionPct" <= 50));

-- Plano da pousada: 'basico' (gratuito: catálogo e reservas) ou 'gestao'
-- (pago: agenda, caixa, colaboradores, resultados...). Pousadas que já
-- existem quando a coluna é criada ficam em 'gestao' para nada parar de
-- funcionar; as novas nascem no 'basico'.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pousadas' AND column_name = 'plano') THEN
    ALTER TABLE pousadas ADD COLUMN plano TEXT NOT NULL DEFAULT 'gestao' CHECK (plano IN ('basico', 'gestao'));
    ALTER TABLE pousadas ALTER COLUMN plano SET DEFAULT 'basico';
  END IF;
END $$;

-- Snapshot financeiro de cada reserva (valores no momento da reserva).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "commissionPct" NUMERIC;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "commissionAmount" NUMERIC;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "afiliadoCode" TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "afiliadoCommission" NUMERIC;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "conservationAmount" NUMERIC;

-- Valor combinado dos serviços avulsos (site/logo).
ALTER TABLE pedidos_site ADD COLUMN IF NOT EXISTS valor NUMERIC;

-- 2) Preço por temporada: {"1": 400, ..., "12": 600} — mês sem valor usa a
--    diária padrão (pricePerNight).
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "precosPorMes" JSONB;

-- 3) Afiliados: agências e influenciadores com link de indicação (?ref=).
CREATE TABLE IF NOT EXISTS afiliados (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'influenciador' CHECK (tipo IN ('agencia', 'influenciador', 'outro')),
  email TEXT,
  telefone TEXT,
  "commissionPct" NUMERIC NOT NULL DEFAULT 5 CHECK ("commissionPct" >= 0 AND "commissionPct" <= 30),
  cliques INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE afiliados ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bookings_afiliado ON bookings ("afiliadoCode") WHERE "afiliadoCode" IS NOT NULL;

CREATE OR REPLACE FUNCTION afiliado_registrar_clique(p_code TEXT) RETURNS VOID
LANGUAGE sql AS $$
  UPDATE afiliados SET cliques = cliques + 1 WHERE code = upper(p_code) AND active;
$$;
REVOKE ALL ON FUNCTION afiliado_registrar_clique(TEXT) FROM PUBLIC, anon, authenticated;

-- 4) Avaliação verificada: ligada à reserva de quem se hospedou.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "verifiedStay" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "bookingId" TEXT;

-- 5) Conservação: % de cada reserva destinado a um projeto ambiental (sai da
--    comissão da EcoSafari). NULL = padrão (CONSERVACAO_PADRAO_PCT).
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "conservationPct" NUMERIC CHECK ("conservationPct" IS NULL OR ("conservationPct" >= 0 AND "conservationPct" <= 20));
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "conservationPartner" TEXT;

-- 6) Pousada em destaque (estratégia Pantanal Norte).
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;
