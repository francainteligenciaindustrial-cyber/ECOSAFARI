-- ECOSAFARI BRASIL: VENDA DE SITE OFICIAL PARA POUSADAS
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- O site oficial da pousada (/site/<slug> ou domínio próprio) deixa de ser
-- montado pelo parceiro sozinho e vira um serviço: o gestor pede pelo portal,
-- o pedido aparece em Gestão → Pedidos de site, a equipe cria o site e marca
-- "entregue" — só então o parceiro ganha o editor para pequenos ajustes.

-- Site criado pela equipe e no ar (só o admin muda).
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "sitePublicado" BOOLEAN NOT NULL DEFAULT false;
-- Pousadas que já têm domínio próprio apontado para o site oficial (ex.:
-- Pesqueiro Vagalume) já estão publicadas.
UPDATE pousadas SET "sitePublicado" = true
WHERE "customDomain" IS NOT NULL AND "customDomain" <> '' AND "sitePublicado" = false;

CREATE TABLE IF NOT EXISTS pedidos_site (
  id TEXT PRIMARY KEY,
  "pousadaId" TEXT NOT NULL REFERENCES pousadas(id) ON DELETE CASCADE,
  "userId" TEXT,
  "contatoNome" TEXT,
  "contatoEmail" TEXT,
  "contatoTelefone" TEXT,
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_contato', 'em_producao', 'entregue', 'cancelado')),
  notes TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pedidos_site_status ON pedidos_site (status, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_site_pousada ON pedidos_site ("pousadaId", "createdAt" DESC);
ALTER TABLE pedidos_site ENABLE ROW LEVEL SECURITY;
-- Sem policies públicas: só o backend (service_role) lê/grava.
