-- Reunião de 20/10/2026 — área do turista:
--  * local onde a foto do post foi tirada (GPS do EXIF / do aparelho);
--  * enquadramento da foto de capa escolhido pelo turista.
-- Seguro de rodar mais de uma vez. Até rodar, o site funciona normalmente
-- (writeSkippingMissingColumns ignora as colunas que faltam).

alter table public.turista_posts add column if not exists "location" text;
alter table public.turista_posts add column if not exists "latitude" double precision;
alter table public.turista_posts add column if not exists "longitude" double precision;

alter table public.turistas add column if not exists "coverPosition" text;

notify pgrst, 'reload schema';
