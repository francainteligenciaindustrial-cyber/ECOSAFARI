-- Contrato de parceria (aceite eletrônico), cancelamento do hóspede com
-- taxa e repasse em custódia para as pousadas.
-- Depois desta migração, só pousadas com contrato assinado recebem
-- reservas online (EXIGIR_CONTRATO=false na Vercel desliga essa trava).

create table if not exists public.contratos_parceria (
  id text primary key,
  "pousadaId" text not null,
  versao text not null,
  status text not null default 'ativo', -- ativo | substituido
  "comissaoPct" numeric not null,
  "comissaoLancamentoPct" numeric,
  "razaoSocial" text not null,
  documento text not null,
  endereco text,
  "responsavelNome" text not null,
  "responsavelCpf" text not null,
  "responsavelCargo" text,
  "responsavelEmail" text,
  "pixTipo" text not null,
  "pixChave" text not null,
  texto text not null,
  "textoHash" text not null,
  "userId" text,
  ip text,
  "userAgent" text,
  "aceitoEm" timestamptz not null default now()
);
create index if not exists contratos_pousada_idx on public.contratos_parceria ("pousadaId", status);

alter table public.pousadas add column if not exists "contratoId" text;
alter table public.pousadas add column if not exists "contratoAceitoEm" timestamptz;
alter table public.pousadas add column if not exists "comissaoLancamentoAte" date;
alter table public.pousadas add column if not exists "repasseBloqueado" boolean default false;

alter table public.bookings add column if not exists "repasseStatus" text;
alter table public.bookings add column if not exists "repasseValor" numeric;
alter table public.bookings add column if not exists "repasseLiberadoEm" timestamptz;
alter table public.bookings add column if not exists "repassePagoEm" timestamptz;
alter table public.bookings add column if not exists "repasseLoteId" text;
alter table public.bookings add column if not exists "cancelamentoTaxa" numeric;
alter table public.bookings add column if not exists "reembolsoValor" numeric;
alter table public.bookings add column if not exists "canceladoPor" text;
alter table public.bookings add column if not exists "canceladoEm" timestamptz;
-- Do carrinho (caso add-carrinho.sql ainda não tenha rodado):
alter table public.bookings add column if not exists "stripePaymentIntentId" text;
alter table public.bookings add column if not exists "refundedAt" timestamptz;
alter table public.bookings add column if not exists "refundedAmount" numeric;
create index if not exists bookings_repasse_idx on public.bookings ("repasseStatus");

create table if not exists public.repasse_lotes (
  id text primary key,
  "pousadaId" text not null,
  valor numeric not null,
  "bookingIds" jsonb not null default '[]'::jsonb,
  status text not null default 'pendente', -- pendente | pago
  "pixTipo" text,
  "pixChave" text,
  titular text,
  documento text,
  provedor text,
  "comprovanteUrl" text,
  observacao text,
  "pagoPor" text,
  "pagoEm" timestamptz,
  "criadoEm" timestamptz not null default now()
);
create index if not exists repasse_lotes_pousada_idx on public.repasse_lotes ("pousadaId", status);

-- Só o servidor (chave de serviço) lê e escreve.
alter table public.contratos_parceria enable row level security;
alter table public.repasse_lotes enable row level security;
