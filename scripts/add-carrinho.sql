-- Carrinho: várias reservas pagas juntas num checkout do Stripe.
-- pedidoId liga as reservas do mesmo pedido; holdUntil é o prazo para pagar
-- (vencido, a vaga é liberada); stripePaymentIntentId permite reembolsar
-- um item só; refundedAt/refundedAmount registram o reembolso.
alter table public.bookings add column if not exists "pedidoId" text;
alter table public.bookings add column if not exists "holdUntil" timestamptz;
alter table public.bookings add column if not exists "stripePaymentIntentId" text;
alter table public.bookings add column if not exists "stripeSessionId" text;
alter table public.bookings add column if not exists "refundedAt" timestamptz;
alter table public.bookings add column if not exists "refundedAmount" numeric;
create index if not exists bookings_pedido_idx on public.bookings ("pedidoId");
create index if not exists bookings_hold_idx on public.bookings ("holdUntil") where status = 'pendente_pagamento';
