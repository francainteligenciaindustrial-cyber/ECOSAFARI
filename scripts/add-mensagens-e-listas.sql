-- Mensagens turista ↔ guia e Lista de desejos (07/11/2026).
-- Seguro de rodar mais de uma vez. Acesso só pelo servidor (service role):
-- RLS ligada e sem políticas públicas.

-- ---------------------------------------------------------------------
-- 1. Mensagens com o guia (dentro da plataforma)
--    O telefone do guia só é liberado depois de uma reserva paga com ele;
--    até lá, números, emails e links nas mensagens são ocultados.
-- ---------------------------------------------------------------------
create table if not exists public.conversas (
  id text primary key,
  "turistaId" text not null,
  "guideId" text not null,
  "createdAt" timestamptz not null default now(),
  "lastMessageAt" timestamptz not null default now(),
  "lastMessagePreview" text,
  "turistaUnread" int not null default 0,
  "guiaUnread" int not null default 0,
  unique ("turistaId", "guideId")
);
create index if not exists conversas_guide_idx on public.conversas ("guideId", "lastMessageAt" desc);
create index if not exists conversas_turista_idx on public.conversas ("turistaId", "lastMessageAt" desc);

create table if not exists public.mensagens (
  id text primary key,
  "conversaId" text not null references public.conversas(id) on delete cascade,
  autor text not null check (autor in ('turista', 'guia')),
  texto text not null,
  "textoOriginal" text,          -- guardado só quando algo foi ocultado (para a Gestão, em caso de problema)
  ocultado boolean not null default false,
  "createdAt" timestamptz not null default now()
);
create index if not exists mensagens_conversa_idx on public.mensagens ("conversaId", "createdAt");

alter table public.conversas enable row level security;
alter table public.mensagens enable row level security;

-- ---------------------------------------------------------------------
-- 2. Lista de desejos (pousadas, guias, atrações e pacotes)
-- ---------------------------------------------------------------------
create table if not exists public.listas_desejos (
  id text primary key,
  "turistaId" text not null,
  nome text not null,
  "checkIn" date,
  "checkOut" date,
  "shareToken" text unique,
  alertas boolean not null default true,
  "alertaEpocaEnviadoEm" text,  -- "YYYY-MM": já avisou a época de avistamento neste mês
  "createdAt" timestamptz not null default now()
);
create index if not exists listas_desejos_turista_idx on public.listas_desejos ("turistaId");

create table if not exists public.lista_itens (
  id text primary key,
  "listaId" text not null references public.listas_desejos(id) on delete cascade,
  tipo text not null check (tipo in ('pousada', 'guia', 'atracao', 'pacote')),
  "refId" text not null,
  "alertaVagaEnviadoEm" timestamptz,
  "createdAt" timestamptz not null default now(),
  unique ("listaId", tipo, "refId")
);
create index if not exists lista_itens_lista_idx on public.lista_itens ("listaId");

alter table public.listas_desejos enable row level security;
alter table public.lista_itens enable row level security;

-- Os favoritos antigos (só pousadas) viram a lista "Favoritos" de cada turista.
insert into public.listas_desejos (id, "turistaId", nome)
select 'ld_fav_' || f."turistaId", f."turistaId", 'Favoritos'
from (select distinct "turistaId" from public.turista_favoritos) f
on conflict (id) do nothing;

insert into public.lista_itens (id, "listaId", tipo, "refId")
select 'li_fav_' || f."turistaId" || '_' || f."pousadaId", 'ld_fav_' || f."turistaId", 'pousada', f."pousadaId"
from public.turista_favoritos f
on conflict do nothing;

notify pgrst, 'reload schema';
