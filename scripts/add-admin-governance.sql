-- ECOSAFARI BRASIL: GOVERNANÇA DE ADMINISTRADORES + LOG DE AUDITORIA
-- Rode isso no SQL Editor do Supabase.
--
-- Conceder acesso de admin deixa de ser uma ação unilateral: qualquer admin
-- pode PROPOR um novo email (ou propor remover o acesso de outro admin), mas
-- isso só se efetiva depois que os 3 admins-chefe (fundadores do projeto,
-- marcados com app_metadata.isChief = true na Supabase Auth — rode
-- scripts/set-chief-admins.ts para isso) votarem. Conceder exige unanimidade
-- (3 votos "sim"); revogar exige maioria (2 votos "sim"). Um "não" de
-- qualquer chefe já rejeita uma proposta de concessão na hora.
--
-- admin_audit_log registra toda ação administrativa que altera dados (criar/
-- editar/excluir pousada, guia, atração, reserva, aprovar candidatura,
-- conceder/revogar acesso de admin ou parceiro...) para que qualquer admin
-- veja o que os outros fizeram — ver GET /api/admin/audit-log em server.ts.

CREATE TABLE IF NOT EXISTS admin_invite_proposals (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('grant', 'revoke')),
  target_user_id TEXT, -- só para action='revoke': id do admin cujo acesso seria removido
  proposed_by_id TEXT NOT NULL,
  proposed_by_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  result_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admin_invite_votes (
  proposal_id TEXT NOT NULL REFERENCES admin_invite_proposals(id) ON DELETE CASCADE,
  chief_id TEXT NOT NULL,
  chief_email TEXT NOT NULL,
  approve BOOLEAN NOT NULL,
  voted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, chief_id)
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL, -- 'create' | 'update' | 'delete' | 'propose_grant_admin' | 'vote_approve' | 'grant_admin' | ...
  resource_type TEXT NOT NULL, -- 'pousada' | 'guide' | 'atracao' | 'booking' | 'admin' | ...
  resource_id TEXT,
  resource_label TEXT, -- nome legível capturado no momento da ação (sobrevive à exclusão do registro)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON admin_audit_log (created_at DESC);

-- Sem policies públicas em nenhuma das três — só o backend (com a
-- service_role key) lê/grava, mesmo padrão do resto do projeto (ver
-- lockdown-rls.sql).
ALTER TABLE admin_invite_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_invite_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
