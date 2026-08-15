-- ECOSAFARI BRASIL: SISTEMA DE COINS (favoritos, recompensas, resgates)
-- Rode isso no SQL Editor do Supabase.
--
-- As Coins são ganhas no aplicativo separado (foto de avistamento aprovada
-- lá) — o site NUNCA gera Coins por conta própria. O saldo aqui é só um
-- espelho, atualizado pelo app via POST /api/integrations/app-coins-sync
-- (ver server.ts) sempre que o app credita ou debita Coins de um usuário com
-- o mesmo email de uma conta de turista aqui no site. O turista gasta as
-- Coins com desconto nas pousadas parceiras (recompensas/resgates abaixo).

ALTER TABLE turistas ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE turistas ADD COLUMN IF NOT EXISTS language TEXT;

-- Agenda real do guia: datas específicas bloqueadas (armazenado como string
-- JSON, mesmo padrão de languages/specialty/interests), além do liga/desliga
-- geral que já existia em guides.status.
ALTER TABLE guides ADD COLUMN IF NOT EXISTS "unavailableDates" TEXT;

CREATE TABLE IF NOT EXISTS turista_favoritos (
  "turistaId" TEXT NOT NULL,
  "pousadaId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("turistaId", "pousadaId")
);

CREATE TABLE IF NOT EXISTS pousada_recompensas (
  id TEXT PRIMARY KEY,
  "pousadaId" TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  "coinCost" INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS turista_resgates (
  id TEXT PRIMARY KEY,
  "turistaId" TEXT NOT NULL,
  "recompensaId" TEXT NOT NULL,
  "pousadaId" TEXT NOT NULL,
  "coinCost" INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'usado', 'cancelado')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "usedAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS turista_resgates_turista_idx ON turista_resgates ("turistaId");
CREATE INDEX IF NOT EXISTS pousada_recompensas_pousada_idx ON pousada_recompensas ("pousadaId");

-- Sem policies públicas — só o backend (service_role) lê/grava, mesmo padrão
-- do resto do projeto (ver lockdown-rls.sql).
ALTER TABLE turista_favoritos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pousada_recompensas ENABLE ROW LEVEL SECURITY;
ALTER TABLE turista_resgates ENABLE ROW LEVEL SECURITY;
