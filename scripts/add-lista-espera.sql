-- Lista de espera: o turista queria datas já reservadas e não aceitou as
-- datas livres sugeridas. Guardamos as datas desejadas (demanda para a
-- pousada e a equipe) e ele é avisado por e-mail se ficarem disponíveis.
create table if not exists public.lista_espera (
  id text primary key,
  "pousadaId" text not null,
  "pousadaName" text,
  "turistaId" text,
  email text not null,
  nome text,
  "checkIn" date not null,
  "checkOut" date not null,
  adults integer default 1,
  children integer default 0,
  "roomType" text,
  "pacoteId" text,
  "sugestaoRecusadaCheckIn" date,
  "sugestaoRecusadaCheckOut" date,
  status text not null default 'ativa', -- ativa | avisada | expirada
  "avisadoEm" timestamptz,
  "createdAt" timestamptz not null default now()
);
create index if not exists lista_espera_pousada_idx on public.lista_espera ("pousadaId", status, "checkIn");

-- Só o servidor (chave de serviço) lê e escreve.
alter table public.lista_espera enable row level security;
