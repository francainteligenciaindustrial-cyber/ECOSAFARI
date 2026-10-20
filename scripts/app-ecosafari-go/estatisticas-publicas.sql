-- =====================================================================
-- APP ECOSAFARI GO → SITE: estatísticas públicas de avistamentos
-- =====================================================================
-- RODE NO SUPABASE DO APP (não no do site): SQL Editor → New query → Run.
-- Pode rodar mais de uma vez. Não altera nenhuma tabela existente.
--
-- Cria duas funções somente leitura que o site consulta com a chave
-- pública (anon) do app:
--   ecosafari_public_lodges()   → id, nome e slug das pousadas do app, para
--                                 o admin do site vincular cada pousada pelo
--                                 ID (não pelo nome — nomes podem se repetir)
--   ecosafari_sighting_stats()  → contagem de avistamentos APROVADOS por
--                                 espécie, pousada, mês e região aproximada
--
-- Privacidade: nada de usuário, foto, texto ou horário exato sai daqui. A
-- coordenada é arredondada para 2 casas (~1 km) e só entram avistamentos
-- aprovados na moderação.
-- Requer a migração ecosafari-go-supabase-migration-latlng.sql (colunas
-- location_lat/location_lng em sightings).
-- =====================================================================

create or replace function public.ecosafari_public_lodges()
returns table (id uuid, name text, slug text)
language sql stable security definer
set search_path = public
as $$
  select l.id, l.name, l.slug from lodges l order by l.name;
$$;

create or replace function public.ecosafari_sighting_stats(p_since timestamptz default now() - interval '3 years')
returns table (
  species_key     text,
  species_name    text,
  scientific_name text,
  lodge_id        uuid,
  year            int,
  month           int,
  sightings       bigint,
  lat             numeric,
  lng             numeric
)
language sql stable security definer
set search_path = public
as $$
  with base as (
    select
      coalesce(s.species_id::text, lower(trim(s.species_text))) as species_key,
      coalesce(sp.common_name, initcap(trim(s.species_text)))   as species_name,
      sp.scientific_name,
      s.lodge_id,
      -- data da foto quando existe (é quando o bicho foi visto), no fuso do Pantanal
      (coalesce(s.photo_taken_at, s.created_at) at time zone 'America/Cuiaba') as quando,
      round(s.location_lat::numeric, 2) as lat,
      round(s.location_lng::numeric, 2) as lng
    from sightings s
    left join species sp on sp.id = s.species_id
    where s.status = 'approved'
      and coalesce(s.photo_taken_at, s.created_at) >= p_since
      and coalesce(trim(s.species_text), '') <> ''
  )
  select species_key, species_name, scientific_name, lodge_id,
         extract(year from quando)::int, extract(month from quando)::int,
         count(*), lat, lng
  from base
  group by species_key, species_name, scientific_name, lodge_id,
           extract(year from quando), extract(month from quando), lat, lng;
$$;

revoke all on function public.ecosafari_public_lodges() from public;
revoke all on function public.ecosafari_sighting_stats(timestamptz) from public;
grant execute on function public.ecosafari_public_lodges() to anon, authenticated;
grant execute on function public.ecosafari_sighting_stats(timestamptz) to anon, authenticated;
