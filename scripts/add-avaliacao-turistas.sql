-- Avaliação dos turistas pelos prestadores de serviço (07/11/2026).
-- Pousadas (gestores), guias e colaboradores aprovados avaliam o hóspede
-- que atenderam, uma vez por reserva. SOMENTE prestadores veem essas notas
-- (o turista não vê e elas não aparecem no site público). Acesso só pelo
-- servidor (service role) — RLS ligada e sem políticas públicas.
-- Seguro de rodar mais de uma vez.

create table if not exists public.avaliacoes_turistas (
  id text primary key,
  "bookingId" text not null,
  "turistaId" text,
  "customerEmail" text not null,
  "autorUserId" text not null,
  "autorTipo" text not null check ("autorTipo" in ('pousada', 'guia', 'colaborador')),
  "autorNome" text,
  "pousadaId" text,
  "notaComunicacao" smallint not null check ("notaComunicacao" between 1 and 5),
  "notaRegras" smallint not null check ("notaRegras" between 1 and 5),
  "notaCuidado" smallint not null check ("notaCuidado" between 1 and 5),
  nota numeric(3,2) not null,
  comentario text,
  "createdAt" timestamptz not null default now(),
  unique ("bookingId", "autorUserId")
);

create index if not exists avaliacoes_turistas_email_idx on public.avaliacoes_turistas (lower("customerEmail"));
create index if not exists avaliacoes_turistas_turista_idx on public.avaliacoes_turistas ("turistaId");

alter table public.avaliacoes_turistas enable row level security;

notify pgrst, 'reload schema';
