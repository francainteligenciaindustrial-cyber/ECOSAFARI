-- Ciclo de publicação das pousadas: em_preparacao → em_revisao → publicada
-- (⇄ pausada). Só aparecem no site as "publicada" com contrato assinado.
-- As pousadas que já existem entram como publicadas (aparecem assim que
-- tiverem o contrato assinado — ver add-contrato-repasses.sql).
alter table public.pousadas add column if not exists publicacao text not null default 'em_preparacao';
alter table public.pousadas add column if not exists "publicacaoNota" text;
alter table public.pousadas add column if not exists "publicacaoPausadaPor" text;
alter table public.pousadas add column if not exists "publicacaoEnviadaEm" timestamptz;
alter table public.pousadas add column if not exists "publicacaoAtualizadaEm" timestamptz;
alter table public.pousadas add column if not exists "publicadaEm" timestamptz;

-- Só na primeira vez (quando ninguém foi publicado ainda): todas as atuais
-- viram publicadas. Rodar de novo não republica quem foi pausado/devolvido.
update public.pousadas
   set publicacao = 'publicada', "publicadaEm" = coalesce("publicadaEm", now())
 where publicacao = 'em_preparacao'
   and not exists (select 1 from public.pousadas where "publicadaEm" is not null);

create index if not exists pousadas_publicacao_idx on public.pousadas (publicacao);
