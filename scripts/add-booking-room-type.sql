-- ECOSAFARI BRASIL: RESERVA POR TIPO DE QUARTO
-- Rode isso no SQL Editor do Supabase.
--
-- Até então a checagem de disponibilidade só comparava hóspedes contra a
-- capacidade AGREGADA da pousada — pousada.rooms (tipos de quarto) existia
-- no cadastro mas nunca era consultado. Isso permitia duas reservas que
-- juntas cabem na capacidade total, mas que pedem o MESMO quarto físico ao
-- mesmo tempo. Reservas agora podem informar qual tipo de quarto (deve bater
-- com um dos "type" em pousada.rooms) e a checagem passa a validar por
-- unidade de quarto, não só o total de hóspedes.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS "roomType" TEXT;
CREATE INDEX IF NOT EXISTS idx_bookings_pousada_roomtype ON bookings ("pousadaId", "roomType");
