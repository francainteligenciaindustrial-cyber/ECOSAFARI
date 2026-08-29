-- ECOSAFARI BRASIL: LIXEIRA (backup de exclusão)
-- Rode isso no SQL Editor do Supabase.
--
-- Guarda uma cópia completa de tudo que o admin excluir (pousada, guia,
-- atração, turista, espécie) antes de apagar de verdade da tabela original —
-- ver moverParaLixeira em server.ts. O admin restaura pela aba "Lixeira" em
-- até 30 dias; passado isso, o job de cron diário
-- (GET /api/cron/lembretes-cancelamento, que já existe) apaga
-- definitivamente sozinho.

CREATE TABLE IF NOT EXISTS lixeira (
  id TEXT PRIMARY KEY,
  "entityType" TEXT NOT NULL CHECK ("entityType" IN ('pousada', 'guide', 'atracao', 'turista', 'species')),
  "entityId" TEXT NOT NULL,
  "entityLabel" TEXT,
  data JSONB NOT NULL,
  "deletedBy" TEXT,
  "deletedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expiresAt" TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS lixeira_entity_idx ON lixeira ("entityType", "entityId");
CREATE INDEX IF NOT EXISTS lixeira_expires_idx ON lixeira ("expiresAt");

-- Sem policies públicas — só o backend (service_role) lê/grava, mesmo padrão
-- do resto do projeto (ver lockdown-rls.sql). Contém dados pessoais (turista
-- excluído, contato de guia) então precisa da mesma trava que as tabelas
-- originais já têm.
ALTER TABLE lixeira ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access" ON lixeira;
DROP POLICY IF EXISTS "Allow public insert access" ON lixeira;
DROP POLICY IF EXISTS "Allow public update access" ON lixeira;
DROP POLICY IF EXISTS "Allow public delete access" ON lixeira;
