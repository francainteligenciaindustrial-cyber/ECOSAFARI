-- ECOSAFARI BRASIL: SERVIÇO DE CRIAÇÃO DE LOGO (antes do site)
-- Rode no SQL Editor do Supabase DEPOIS de scripts/add-pedidos-site.sql.
-- Pode rodar mais de uma vez.
--
-- O pedido passa a dizer o que foi contratado: só o site, só a logo, ou logo
-- + site. Com logo, o designer anexa versões na Gestão, o cliente aprova uma
-- no portal (as outras viram "rejeitada") e só então o site entra em produção.

ALTER TABLE pedidos_site ADD COLUMN IF NOT EXISTS servico TEXT NOT NULL DEFAULT 'site';
ALTER TABLE pedidos_site ADD COLUMN IF NOT EXISTS "logoStatus" TEXT;
DO $$ BEGIN
  ALTER TABLE pedidos_site ADD CONSTRAINT pedidos_site_servico_check CHECK (servico IN ('site', 'logo', 'logo_site'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE pedidos_site ADD CONSTRAINT pedidos_site_logo_status_check
    CHECK ("logoStatus" IS NULL OR "logoStatus" IN ('novo', 'em_criacao', 'aguardando_aprovacao', 'ajustes', 'aprovada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS logo_versoes (
  id TEXT PRIMARY KEY,
  "pedidoId" TEXT NOT NULL REFERENCES pedidos_site(id) ON DELETE CASCADE,
  "imageUrl" TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'rejeitada')),
  "clienteComentario" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "decidedAt" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_logo_versoes_pedido ON logo_versoes ("pedidoId", "createdAt");
ALTER TABLE logo_versoes ENABLE ROW LEVEL SECURITY;
-- Sem policies públicas: só o backend (service_role) lê/grava.
