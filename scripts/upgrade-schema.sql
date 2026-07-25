-- ECOSAFARI BRASIL: UPGRADE DE SCHEMA (índices, foreign keys, jsonb)
-- Rode isso no SQL Editor do Supabase DEPOIS de já ter rodado
-- lockdown-rls.sql e de já não ter mais dados fake nas tabelas (senão a
-- criação das foreign keys abaixo vai falhar com "linha órfã").
--
-- Todo comando aqui é seguro de rodar mais de uma vez (idempotente).

-- ============================================================
-- 1. ÍNDICES nas colunas usadas como chave estrangeira / filtro comum.
-- Sem isso, toda consulta "reservas dessa pousada" faz uma varredura
-- completa da tabela em vez de usar uma busca indexada — não dói com poucas
-- linhas, mas cresce junto com o negócio.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bookings_pousada ON bookings ("pousadaId");
CREATE INDEX IF NOT EXISTS idx_bookings_guide ON bookings ("guideId");
CREATE INDEX IF NOT EXISTS idx_reviews_pousada ON reviews ("pousadaId");
CREATE INDEX IF NOT EXISTS idx_sightings_pousada ON sightings ("pousadaId");
CREATE INDEX IF NOT EXISTS idx_notifications_booking ON notifications ("bookingId");
CREATE INDEX IF NOT EXISTS idx_species_best_pousada ON species ("bestPousadaId");
CREATE INDEX IF NOT EXISTS idx_reservas_turista ON reservas ("turistaId");
CREATE INDEX IF NOT EXISTS idx_reservas_roteiro ON reservas ("roteiroId");
CREATE INDEX IF NOT EXISTS idx_pagamentos_reserva ON pagamentos ("reservaId");

-- ============================================================
-- 2. FOREIGN KEYS — trava de integridade referencial. ON DELETE SET NULL
-- (não CASCADE) de propósito: apagar uma pousada não deve apagar o
-- histórico de reservas/avaliações dela silenciosamente, só desvincular.
-- Isso teria barrado direto o bug das pousadas fake voltando com reservas
-- "penduradas" nelas.
-- ============================================================
DO $$ BEGIN
  ALTER TABLE bookings ADD CONSTRAINT fk_bookings_pousada
    FOREIGN KEY ("pousadaId") REFERENCES pousadas(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE bookings ADD CONSTRAINT fk_bookings_guide
    FOREIGN KEY ("guideId") REFERENCES guides(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE reviews ADD CONSTRAINT fk_reviews_pousada
    FOREIGN KEY ("pousadaId") REFERENCES pousadas(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE sightings ADD CONSTRAINT fk_sightings_pousada
    FOREIGN KEY ("pousadaId") REFERENCES pousadas(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE notifications ADD CONSTRAINT fk_notifications_booking
    FOREIGN KEY ("bookingId") REFERENCES bookings(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE species ADD CONSTRAINT fk_species_best_pousada
    FOREIGN KEY ("bestPousadaId") REFERENCES pousadas(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE reservas ADD CONSTRAINT fk_reservas_turista
    FOREIGN KEY ("turistaId") REFERENCES turistas(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE reservas ADD CONSTRAINT fk_reservas_roteiro
    FOREIGN KEY ("roteiroId") REFERENCES roteiros(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE pagamentos ADD CONSTRAINT fk_pagamentos_reserva
    FOREIGN KEY ("reservaId") REFERENCES reservas(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 3. TEXT -> jsonb nas colunas que guardavam JSON como string solta.
-- Ganha validação automática (não dá mais pra gravar um JSON quebrado),
-- indexação/consulta nativa do Postgres, e o backend (já ajustado) para de
-- precisar fazer JSON.stringify/parse manual nessas colunas.
-- ============================================================
ALTER TABLE pousadas ALTER COLUMN images TYPE jsonb USING images::jsonb;
ALTER TABLE pousadas ALTER COLUMN features TYPE jsonb USING features::jsonb;
ALTER TABLE pousadas ALTER COLUMN activities TYPE jsonb USING activities::jsonb;
ALTER TABLE pousadas ALTER COLUMN experiences TYPE jsonb USING experiences::jsonb;
ALTER TABLE guides ALTER COLUMN languages TYPE jsonb USING languages::jsonb;
ALTER TABLE guides ALTER COLUMN specialty TYPE jsonb USING specialty::jsonb;
