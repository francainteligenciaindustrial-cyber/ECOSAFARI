-- E-mails (07/11/2026): aceite das novidades (LGPD) e controle do e-mail de
-- boas-vindas dos turistas. Seguro de rodar mais de uma vez.
--  * marketingOptIn: só recebe "Comunicados" quem marcou a caixa no cadastro
--    ou ligou no perfil. O link "Descadastrar" do e-mail volta para false.
--  * welcomeSentAt: o e-mail de boas-vindas sai uma única vez, na primeira
--    visita depois de confirmar o e-mail.

alter table public.turistas add column if not exists "marketingOptIn" boolean not null default false;
alter table public.turistas add column if not exists "marketingOptInAt" timestamptz;
alter table public.turistas add column if not exists "welcomeSentAt" timestamptz;

-- Quem já era turista antes desta migração não recebe boas-vindas atrasadas.
update public.turistas set "welcomeSentAt" = now() where "welcomeSentAt" is null;

create index if not exists turistas_marketing_optin_idx on public.turistas ("marketingOptIn") where "marketingOptIn";

notify pgrst, 'reload schema';
