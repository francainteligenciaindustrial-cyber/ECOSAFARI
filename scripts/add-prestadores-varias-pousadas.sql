-- Cadastro de prestadores de serviço (reunião de 05/11/2026): o candidato
-- marca, em balões, os pontos turísticos/atrações de interesse — guardados
-- junto de cada candidatura. (As várias pousadas já funcionam sem migração:
-- é uma linha por pousada em "colaboradores".)
-- Seguro de rodar mais de uma vez.

alter table public.colaboradores add column if not exists "atracoesInteresse" jsonb default '[]'::jsonb;

notify pgrst, 'reload schema';
