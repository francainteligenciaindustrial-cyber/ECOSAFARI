-- ECOSAFARI BRASIL: ÍNDICES PARA BUSCA/PAGINAÇÃO NO CATÁLOGO DE POUSADAS
-- Rode isso no SQL Editor do Supabase.
--
-- GET /api/pousadas agora aceita ?page= e faz busca (name/location via
-- ILIKE), filtro de preço e ordenação diretamente no Postgres em vez de
-- carregar o catálogo inteiro pro navegador e filtrar em JS — sem esses
-- índices a rota continua funcionando (Postgres faz um seq scan), só fica
-- mais lenta conforme o catálogo cresce.
--
-- pg_trgm habilita índice GIN em ILIKE com wildcard nos dois lados
-- ("%termo%"), que um índice B-tree comum não acelera.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_pousadas_name_trgm ON pousadas USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pousadas_location_trgm ON pousadas USING GIN (location gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pousadas_price ON pousadas ("pricePerNight");
CREATE INDEX IF NOT EXISTS idx_pousadas_rating ON pousadas (rating);
