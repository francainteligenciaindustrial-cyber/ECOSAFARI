-- ECOSAFARI BRASIL: CATÁLOGO DE PRODUTOS E CONSUMO DO HÓSPEDE
-- Rode isso no SQL Editor do Supabase.
--
-- produtos: itens vendáveis cadastrados por cada pousada (frigobar,
-- vestuário, brindes) — cada um ganha um QR code fixo (gerado a partir do
-- id, sem precisar de coluna própria) que a recepção escaneia.
--
-- consumos: o que um hóspede específico consumiu durante a estadia — uma
-- linha por lançamento, igual a comanda de um hotel. Vira cobrança real
-- (Stripe ou marcado manualmente) quando o status passa de "pendente" pra
-- "pago".

CREATE TABLE IF NOT EXISTS produtos (
  id TEXT PRIMARY KEY,
  "pousadaId" TEXT NOT NULL REFERENCES pousadas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'outro',
  price NUMERIC NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_produtos_pousada ON produtos ("pousadaId");

CREATE TABLE IF NOT EXISTS consumos (
  id TEXT PRIMARY KEY,
  "bookingId" TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  "pousadaId" TEXT NOT NULL REFERENCES pousadas(id) ON DELETE CASCADE,
  "produtoId" TEXT NOT NULL,
  "produtoName" TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  "unitPrice" NUMERIC NOT NULL,
  "totalPrice" NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  "createdAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE consumos ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_consumos_booking ON consumos ("bookingId");
CREATE INDEX IF NOT EXISTS idx_consumos_pousada ON consumos ("pousadaId");

-- Sem policies públicas — só o backend (service_role) acessa, igual todas
-- as outras tabelas do projeto.
DROP POLICY IF EXISTS "Permitir leitura pública de produtos" ON produtos;
DROP POLICY IF EXISTS "Permitir leitura pública de consumos" ON consumos;
