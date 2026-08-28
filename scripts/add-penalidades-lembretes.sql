-- ECOSAFARI BRASIL: PENALIDADE DE CANCELAMENTO + LEMBRETES AUTOMÁTICOS
-- Rode isso no SQL Editor do Supabase.
--
-- prestador_penalidades: registro (ledger) de toda penalidade aplicada a
-- uma pousada/guia por cancelar uma reserva já confirmada com menos de 45
-- dias de antecedência — "estrelasPerdidas" é um selo de confiabilidade
-- visível só no painel de Gestão, NUNCA a nota pública de avaliação.
-- "valorPenalidade" é um valor devido (o acerto em si continua manual,
-- descontado do próximo repasse ou cobrado por fora — não existe repasse
-- automático pra parceiro no sistema hoje).
CREATE TABLE IF NOT EXISTS prestador_penalidades (
  id TEXT PRIMARY KEY,
  "prestadorType" TEXT NOT NULL,
  "prestadorId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL,
  "diasAntecedencia" INTEGER NOT NULL,
  "valorPenalidade" NUMERIC NOT NULL DEFAULT 0,
  "estrelasPerdidas" NUMERIC NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE prestador_penalidades ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_penalidades_prestador ON prestador_penalidades ("prestadorType", "prestadorId");

-- lembretes_enviados: idempotência do cron diário de lembrete (45/20/5
-- dias antes do check-in) — evita mandar o mesmo lembrete duas vezes se o
-- cron rodar de novo por qualquer motivo.
CREATE TABLE IF NOT EXISTS lembretes_enviados (
  id TEXT PRIMARY KEY,
  "bookingId" TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  threshold INTEGER NOT NULL,
  "sentAt" TIMESTAMPTZ DEFAULT now(),
  UNIQUE ("bookingId", threshold)
);
ALTER TABLE lembretes_enviados ENABLE ROW LEVEL SECURITY;
