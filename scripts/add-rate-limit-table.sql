-- ECOSAFARI BRASIL: RATE LIMIT DISTRIBUÍDO
-- Rode isso no SQL Editor do Supabase. Dá ao rate limiting um contador
-- compartilhado entre todas as instâncias da Vercel (hoje cada instância
-- serverless conta sozinha, em memória — um limite de "10 por 15 min"
-- na prática vira "10 por 15 min POR instância simultânea").
--
-- Usa uma função Postgres (não só INSERT/UPDATE direto) para o incremento
-- ser atômico: duas requisições batendo no mesmo milissegundo não podem
-- "pisar" uma na contagem da outra.

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- Sem policies públicas — só o backend (service_role) acessa.

CREATE OR REPLACE FUNCTION increment_rate_limit(p_key TEXT, p_window_ms BIGINT)
RETURNS TABLE(total_hits INTEGER, reset_time TIMESTAMPTZ) AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_count INTEGER;
  v_reset TIMESTAMPTZ;
BEGIN
  INSERT INTO rate_limits (key, count, reset_at)
  VALUES (p_key, 1, v_now + (p_window_ms || ' milliseconds')::interval)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE WHEN rate_limits.reset_at <= v_now THEN 1 ELSE rate_limits.count + 1 END,
    reset_at = CASE WHEN rate_limits.reset_at <= v_now THEN v_now + (p_window_ms || ' milliseconds')::interval ELSE rate_limits.reset_at END
  RETURNING rate_limits.count, rate_limits.reset_at INTO v_count, v_reset;

  RETURN QUERY SELECT v_count, v_reset;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_rate_limit(p_key TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE rate_limits SET count = GREATEST(count - 1, 0) WHERE key = p_key;
END;
$$ LANGUAGE plpgsql;

-- Housekeeping: old expired rows just sit there otherwise (harmless, but
-- unbounded growth). Safe to run manually or on a schedule (Supabase cron).
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS VOID AS $$
BEGIN
  DELETE FROM rate_limits WHERE reset_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql;
