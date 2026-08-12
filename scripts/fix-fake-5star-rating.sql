-- ECOSAFARI BRASIL: CORRIGE O BUG DE AVALIAÇÃO "5 ESTRELAS" AUTOMÁTICA
-- Rode isso no SQL Editor do Supabase. Idempotente: seguro rodar mais de uma vez.
--
-- Toda pousada/guia/atração nascia com rating = 5.0 (era o DEFAULT da
-- coluna), então aparecia "5.0 de avaliação" no site mesmo sem nenhuma
-- avaliação real ainda ter sido feita. O código já foi corrigido pra usar 0
-- como "sem avaliações ainda" — este script:
--  1. Muda o DEFAULT da coluna pra 0, pra registros novos não nascerem mais
--     com nota fake.
--  2. Zera o rating dos registros JÁ existentes que estão parados em 5.0
--     SEM nenhuma avaliação de verdade na tabela reviews — nunca mexe num
--     5.0 que veio de avaliações reais (mesmo que a média real também dê
--     exatamente 5.0).

ALTER TABLE pousadas ALTER COLUMN rating SET DEFAULT 0;
ALTER TABLE guides ALTER COLUMN rating SET DEFAULT 0;
ALTER TABLE atracoes ALTER COLUMN rating SET DEFAULT 0;

UPDATE pousadas SET rating = 0
  WHERE rating = 5.0 AND id NOT IN (SELECT DISTINCT "pousadaId" FROM reviews WHERE "pousadaId" IS NOT NULL);

UPDATE guides SET rating = 0
  WHERE rating = 5.0 AND id NOT IN (SELECT DISTINCT "guideId" FROM reviews WHERE "guideId" IS NOT NULL);

UPDATE atracoes SET rating = 0
  WHERE rating = 5.0 AND id NOT IN (SELECT DISTINCT "atracaoId" FROM reviews WHERE "atracaoId" IS NOT NULL);
