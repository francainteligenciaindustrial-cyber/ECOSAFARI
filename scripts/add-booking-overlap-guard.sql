-- ECOSAFARI BRASIL: TRAVA DE OVERBOOKING NO PRÓPRIO BANCO
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- O servidor checa a disponibilidade e depois grava — dois passos. Duas
-- reservas simultâneas podiam passar as duas pela checagem antes de qualquer
-- uma gravar e ocupar o mesmo quarto. Esta trava roda DENTRO do INSERT/UPDATE.
--
-- Por que trigger e não "EXCLUDE USING gist": um tipo de quarto pode ter
-- várias unidades (pousada.rooms[].quantity — ex.: 3 suítes iguais). Uma
-- regra EXCLUDE proíbe QUALQUER sobreposição, então barraria a 2ª suíte
-- legítima. O trigger pega um lock transacional por pousada+tipo de quarto
-- (serializa só reservas do mesmo quarto, as demais seguem em paralelo) e
-- conta as sobreposições contra a quantidade de unidades.
--
-- Estadias que só se encostam (check-out de uma = check-in da outra) não
-- conflitam — mesma regra de checkPousadaAvailability no server.ts.
-- O erro sai com o código 23P01 (exclusion_violation), que o servidor
-- traduz em "essas datas acabaram de ser reservadas" (HTTP 409).

CREATE OR REPLACE FUNCTION bookings_guard_room_overlap() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  unidades INTEGER;
  ocupadas INTEGER;
BEGIN
  IF NEW.status = 'cancelado' OR NEW."roomType" IS NULL OR NEW."roomType" = '' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('booking:' || NEW."pousadaId" || '|' || NEW."roomType"));

  SELECT (r->>'quantity')::INTEGER INTO unidades
  FROM pousadas p, jsonb_array_elements(COALESCE(NULLIF(p.rooms::TEXT, ''), '[]')::JSONB) r
  WHERE p.id = NEW."pousadaId" AND r->>'type' = NEW."roomType"
  LIMIT 1;

  -- Tipo de quarto desconhecido ou sem quantidade: a validação de cadastro
  -- fica com o servidor.
  IF unidades IS NULL OR unidades < 1 THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO ocupadas
  FROM bookings b
  WHERE b."pousadaId" = NEW."pousadaId"
    AND b."roomType" = NEW."roomType"
    AND b.status <> 'cancelado'
    AND b.id <> NEW.id
    AND b."checkIn"::DATE < NEW."checkOut"::DATE
    AND b."checkOut"::DATE > NEW."checkIn"::DATE;

  IF ocupadas >= unidades THEN
    RAISE EXCEPTION 'Sem unidades livres do quarto "%" entre % e %', NEW."roomType", NEW."checkIn", NEW."checkOut"
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_guard_room_overlap ON bookings;
CREATE TRIGGER trg_bookings_guard_room_overlap
  BEFORE INSERT OR UPDATE OF "checkIn", "checkOut", "roomType", status, "pousadaId"
  ON bookings
  FOR EACH ROW EXECUTE FUNCTION bookings_guard_room_overlap();

CREATE INDEX IF NOT EXISTS idx_bookings_overlap ON bookings ("pousadaId", "roomType", "checkIn", "checkOut");
