-- ECOSAFARI BRASIL: MIGRAÇÃO ÚNICA — MELHORIAS DE OUTUBRO/2026
-- Rode este arquivo inteiro no SQL Editor do Supabase (Project > SQL Editor
-- > New query > colar > Run). Pode rodar mais de uma vez sem problema: tudo
-- usa IF NOT EXISTS.

-- 1) Colunas que faltavam em produção (causa do erro "Could not find the
--    'hasParking' column of 'pousadas'" ao salvar no portal do gestor).
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "hasParking" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "hasWifi" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "facebookUrl" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "tiktokUrl" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "youtubeUrl" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS menu TEXT;

-- 2) Reserva online feita pelo próprio turista: vínculo com o perfil e os
--    detalhes extras que ele informa (chegada, ocasião, transfer...).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "turistaId" TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "guestDetails" TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS origem TEXT;
CREATE INDEX IF NOT EXISTS idx_bookings_turista ON bookings ("turistaId");

-- 3) Caixa de atendimento: vendas avulsas pagas na hora (dinheiro, Pix,
--    cartão). Vendas lançadas "na conta do hóspede" continuam indo para a
--    tabela consumos.
CREATE TABLE IF NOT EXISTS vendas (
  id TEXT PRIMARY KEY,
  "pousadaId" TEXT NOT NULL REFERENCES pousadas(id) ON DELETE CASCADE,
  items TEXT NOT NULL,
  total NUMERIC NOT NULL,
  "paymentMethod" TEXT NOT NULL CHECK ("paymentMethod" IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outro')),
  "customerName" TEXT,
  notes TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vendas_pousada_data ON vendas ("pousadaId", "createdAt" DESC);
ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;

-- 4) Colaboradores (camareira, cozinheira, piloteiro, cantor, fotógrafo,
--    diarista...): cadastro próprio com senha, aprovação pelo gestor da
--    pousada escolhida.
CREATE TABLE IF NOT EXISTS colaboradores (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "pousadaId" TEXT NOT NULL REFERENCES pousadas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  age INTEGER,
  services TEXT NOT NULL,
  languages TEXT,
  specialties TEXT,
  bio TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'reprovado')),
  "decisionNote" TEXT,
  "decidedBy" TEXT,
  "decidedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_colaboradores_pousada ON colaboradores ("pousadaId", status);
ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY;

-- Sem policies públicas nas tabelas novas — só o backend (service_role)
-- lê/grava, mesmo padrão do resto do projeto (ver lockdown-rls.sql).
