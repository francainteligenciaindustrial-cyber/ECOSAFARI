-- ECOSAFARI BRASIL: TRAVA DE RLS
-- Rode isso no SQL Editor do Supabase para remover o acesso público direto
-- a todas as tabelas. O backend passa a usar a service_role key (que ignora
-- RLS), então essas políticas públicas não são mais necessárias — e mantê-las
-- é o que permitia qualquer pessoa com a chave anon ler/gravar tudo direto no
-- banco, sem passar pelo Express. Depois disso, só o backend (com a
-- service_role key) consegue ler/gravar essas tabelas.
--
-- IMPORTANTE: isso só protege de verdade se SUPABASE_SERVICE_ROLE_KEY estiver
-- configurada no ambiente do backend (Vercel etc). Sem ela, o servidor cai
-- para a chave anon e para de conseguir ler/gravar essas mesmas tabelas.

-- Garante que RLS está de fato ATIVADO em cada tabela — sem isso, apagar as
-- policies abaixo não tem efeito nenhum (tabela sem RLS habilitado fica
-- pública independente de haver ou não policy). Idempotente: seguro rodar
-- mesmo se já estiver habilitado.
ALTER TABLE pousadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE sightings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE species ENABLE ROW LEVEL SECURITY;
ALTER TABLE turistas ENABLE ROW LEVEL SECURITY;
ALTER TABLE roteiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE guias ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura pública de pousadas" ON pousadas;
DROP POLICY IF EXISTS "Permitir inserção pública de pousadas" ON pousadas;
DROP POLICY IF EXISTS "Permitir atualização pública de pousadas" ON pousadas;
DROP POLICY IF EXISTS "Permitir exclusão pública de pousadas" ON pousadas;

DROP POLICY IF EXISTS "Permitir leitura pública de guias" ON guides;
DROP POLICY IF EXISTS "Permitir inserção pública de guias" ON guides;
DROP POLICY IF EXISTS "Permitir atualização pública de guias" ON guides;
DROP POLICY IF EXISTS "Permitir exclusão pública de guias" ON guides;

DROP POLICY IF EXISTS "Permitir leitura pública de reservas" ON bookings;
DROP POLICY IF EXISTS "Permitir inserção pública de reservas" ON bookings;
DROP POLICY IF EXISTS "Permitir atualização pública de reservas" ON bookings;
DROP POLICY IF EXISTS "Permitir exclusão pública de reservas" ON bookings;

DROP POLICY IF EXISTS "Permitir leitura pública de avaliações" ON reviews;
DROP POLICY IF EXISTS "Permitir inserção pública de avaliações" ON reviews;
DROP POLICY IF EXISTS "Permitir atualização pública de avaliações" ON reviews;
DROP POLICY IF EXISTS "Permitir exclusão pública de avaliações" ON reviews;

DROP POLICY IF EXISTS "Permitir leitura pública de avistamentos" ON sightings;
DROP POLICY IF EXISTS "Permitir inserção pública de avistamentos" ON sightings;
DROP POLICY IF EXISTS "Permitir atualização pública de avistamentos" ON sightings;
DROP POLICY IF EXISTS "Permitir exclusão pública de avistamentos" ON sightings;

DROP POLICY IF EXISTS "Permitir leitura pública de notificações" ON notifications;
DROP POLICY IF EXISTS "Permitir inserção pública de notificações" ON notifications;
DROP POLICY IF EXISTS "Permitir atualização pública de notificações" ON notifications;
DROP POLICY IF EXISTS "Permitir exclusão pública de notificações" ON notifications;

DROP POLICY IF EXISTS "Permitir leitura pública de espécies" ON species;
DROP POLICY IF EXISTS "Permitir inserção pública de espécies" ON species;
DROP POLICY IF EXISTS "Permitir atualização pública de espécies" ON species;
DROP POLICY IF EXISTS "Permitir exclusão pública de espécies" ON species;

DROP POLICY IF EXISTS "Permitir leitura pública de turistas" ON turistas;
DROP POLICY IF EXISTS "Permitir inserção pública de turistas" ON turistas;
DROP POLICY IF EXISTS "Permitir atualização pública de turistas" ON turistas;
DROP POLICY IF EXISTS "Permitir exclusão pública de turistas" ON turistas;

DROP POLICY IF EXISTS "Permitir leitura pública de roteiros" ON roteiros;
DROP POLICY IF EXISTS "Permitir inserção pública de roteiros" ON roteiros;
DROP POLICY IF EXISTS "Permitir atualização pública de roteiros" ON roteiros;
DROP POLICY IF EXISTS "Permitir exclusão pública de roteiros" ON roteiros;

DROP POLICY IF EXISTS "Permitir leitura pública de reservas de roteiro" ON reservas;
DROP POLICY IF EXISTS "Permitir inserção pública de reservas de roteiro" ON reservas;
DROP POLICY IF EXISTS "Permitir atualização pública de reservas de roteiro" ON reservas;
DROP POLICY IF EXISTS "Permitir exclusão pública de reservas de roteiro" ON reservas;

DROP POLICY IF EXISTS "Permitir leitura pública de pagamentos" ON pagamentos;
DROP POLICY IF EXISTS "Permitir inserção pública de pagamentos" ON pagamentos;
DROP POLICY IF EXISTS "Permitir atualização pública de pagamentos" ON pagamentos;
DROP POLICY IF EXISTS "Permitir exclusão pública de pagamentos" ON pagamentos;

DROP POLICY IF EXISTS "Permitir leitura pública de guias turísticos" ON guias;
DROP POLICY IF EXISTS "Permitir inserção pública de guias turísticos" ON guias;
DROP POLICY IF EXISTS "Permitir atualização pública de guias turísticos" ON guias;
DROP POLICY IF EXISTS "Permitir exclusão pública de guias turísticos" ON guias;

DROP POLICY IF EXISTS "Permitir inserção pública de candidaturas" ON candidaturas;
DROP POLICY IF EXISTS "Permitir leitura pública de candidaturas" ON candidaturas;
DROP POLICY IF EXISTS "Permitir atualização pública de candidaturas" ON candidaturas;
DROP POLICY IF EXISTS "Permitir exclusão pública de candidaturas" ON candidaturas;

DROP POLICY IF EXISTS "Permitir leitura pública de referral_sources" ON referral_sources;
DROP POLICY IF EXISTS "Permitir inserção pública de referral_sources" ON referral_sources;
DROP POLICY IF EXISTS "Permitir atualização pública de referral_sources" ON referral_sources;
DROP POLICY IF EXISTS "Permitir exclusão pública de referral_sources" ON referral_sources;

-- Todas as tabelas ficam com RLS ATIVADA e sem nenhuma policy. Sem policy,
-- o role "anon" (chave pública) fica sem acesso nenhum a essas tabelas — só
-- quem usa a service_role key (o backend) continua lendo/gravando normalmente.
