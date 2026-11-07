-- Oportunidades para prestadores (guias, piloteiros, cozinheiros...).
-- Reserva paga com passeio que "precisa de prestador" → os prestadores da
-- região recebem um e-mail com Aceitar/Recusar; o primeiro que aceita fica.

-- Área de atuação do guia (cidade-base + raio em km).
alter table public.guides add column if not exists "baseCidade" text;
alter table public.guides add column if not exists "baseLatitude" double precision;
alter table public.guides add column if not exists "baseLongitude" double precision;
alter table public.guides add column if not exists "raioKm" integer default 150;

create table if not exists public.oportunidades (
  id text primary key,
  "bookingId" text not null,
  "pousadaId" text not null,
  "pousadaName" text,
  servico text not null,
  status text not null default 'aberta', -- aberta | preenchida | cancelada | expirada
  "checkIn" date not null,
  "checkOut" date not null,
  pessoas integer default 1,
  experiencia text,
  idioma text,
  "aceitaTipo" text,  -- guia | colaborador
  "aceitaId" text,
  "aceitaNome" text,
  "aceitaEm" timestamptz,
  "alertaGestaoEm" timestamptz,
  "lembreteEm" timestamptz,
  "createdAt" timestamptz not null default now()
);
create index if not exists oportunidades_booking_idx on public.oportunidades ("bookingId");
create index if not exists oportunidades_status_idx on public.oportunidades (status, "checkIn");

create table if not exists public.oportunidade_convites (
  id text primary key,
  "oportunidadeId" text not null references public.oportunidades(id) on delete cascade,
  "prestadorTipo" text not null, -- guia | colaborador
  "prestadorId" text not null,
  nome text,
  email text,
  telefone text,
  "distanciaKm" integer,
  token text not null unique,
  resposta text,                 -- aceitou | recusou
  "respondidoEm" timestamptz,
  "enviadoEm" timestamptz,
  "createdAt" timestamptz not null default now(),
  unique ("oportunidadeId", "prestadorTipo", "prestadorId")
);
create index if not exists convites_prestador_idx on public.oportunidade_convites ("prestadorTipo", "prestadorId");

-- Só o servidor (chave de serviço) lê e escreve: sem políticas públicas.
alter table public.oportunidades enable row level security;
alter table public.oportunidade_convites enable row level security;
