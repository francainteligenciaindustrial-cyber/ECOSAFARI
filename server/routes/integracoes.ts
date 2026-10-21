// Integrações: Google Calendar, chatbot (Gemini), app de Coins, saúde e diagnóstico.
import type { Express } from "express";
import { parseFromHeader } from "../../src/lib/emailSender.js";
import { google } from "googleapis";
import { safeEqual } from "../../src/lib/safeEqual.js";
import {
  AGENCY_WHATSAPP,
  ai,
  APP_COINS_SYNC_SECRET,
  chatLimiter,
  consumeOAuthState,
  createOAuthState,
  deleteTokens,
  EMAIL_FROM,
  GEMINI_MODEL,
  getGuidesContext,
  getOAuthClient,
  getPousadasContext,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  KNOWN_FAKE_IDS,
  lastEmailFailure,
  loadStoredTokens,
  log,
  logAdminAction,
  requireAdmin,
  resend,
  saveTokens,
  supabase,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "../core.js";

export function registerIntegracoesRoutes(app: Express) {

// Cria um Google Calendar dedicado pra uma pousada, DENTRO da mesma conta
// já conectada (não é uma segunda conexão OAuth por pousada — ver POST
// /api/auth/google acima). A partir daí, reservas dessa pousada passam a
// sincronizar nesse calendário específico em vez do "primary" da conta
// (ver createCalendarEvent). Também dá pra apontar pra um calendário que já
// existe direto pelo PUT /api/pousadas/:id (campo googleCalendarId),
// caso o admin prefira criar manualmente no próprio Google Calendar.
app.post("/api/pousadas/:id/google-calendar", requireAdmin, async (req, res) => {
  const tokens = await loadStoredTokens();
  if (!tokens) {
    return res.status(400).json({ error: "Conecte o Google Calendar primeiro em Gestão → Agenda Integrada." });
  }
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({ error: "Google OAuth Client ID ou Client Secret não estão configurados." });
  }

  const { data: pousadaRow, error: pErr } = await supabase.from("pousadas").select("id,name").eq("id", req.params.id).maybeSingle();
  if (pErr || !pousadaRow) {
    return res.status(404).json({ error: "Pousada não encontrada." });
  }

  try {
    const oauth2Client = getOAuthClient(req);
    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const created = await calendar.calendars.insert({
      requestBody: { summary: `EcoSafari — ${pousadaRow.name}`, timeZone: "America/Cuiaba" },
    });
    const googleCalendarId = created.data.id;
    if (!googleCalendarId) {
      return res.status(500).json({ error: "O Google não retornou um ID de calendário." });
    }

    const { error: updateErr } = await supabase.from("pousadas").update({ googleCalendarId }).eq("id", pousadaRow.id);
    if (updateErr) {
      return res.status(500).json({ error: "O calendário foi criado no Google, mas houve erro ao salvar no cadastro da pousada." });
    }

    await logAdminAction(res.locals.adminUser, "update", "pousada", pousadaRow.id, `Calendário Google dedicado criado (${googleCalendarId})`);
    res.json({ googleCalendarId });
  } catch (err) {
    log.error("Erro ao criar Google Calendar dedicado pra pousada:", err);
    res.status(500).json({ error: "Erro ao criar o calendário no Google." });
  }
});

// ----------------------------------------------------
// GOOGLE CALENDAR OAUTH ENDPOINTS
// ----------------------------------------------------

// Status of Google connection
// Admin-only — this reveals which Google account (email) the site's
// calendar is connected to, which is only meaningful to the admin panel
// and not something worth exposing to an unauthenticated caller.
app.get("/api/auth/google/status", requireAdmin, async (req, res) => {
  const tokens = await loadStoredTokens();
  if (!tokens) {
    return res.json({ connected: false, email: null });
  }

  try {
    const oauth2Client = getOAuthClient(req);
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    return res.json({ connected: true, email: userInfo.data.email });
  } catch (err) {
    log.error("Erro ao obter info do usuário Google:", err);
    return res.json({ connected: true, email: "Conectado" });
  }
});

// Start OAuth authentication — admin-only (returns the URL as JSON rather
// than redirecting directly, since the browser navigation that actually
// hits Google has to be triggered client-side by the caller after an
// authenticated fetch; a plain <a href> here couldn't carry the admin's
// Bearer token). The one-time state token is what actually closes the
// hole: without it, anyone who knows our public client_id/redirect_uri
// could complete their own consent and have the callback below store
// their tokens as this site's calendar integration.
app.get("/api/auth/google", requireAdmin, async (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(400).json({ error: "Google OAuth Client ID ou Client Secret não estão configurados." });
  }

  const oauth2Client = getOAuthClient(req);
  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email"
  ];

  const state = await createOAuthState();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
    state,
  });

  res.json({ authUrl });
});

// OAuth Redirect Callback Handler — necessarily unauthenticated (Google
// redirects the browser here directly), so the state check above is the
// only thing standing between this and an account-hijack via a crafted
// consent URL. See createOAuthState/consumeOAuthState above.
app.get("/api/auth/google/callback", async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string | undefined;
  if (!code) {
    return res.status(400).send("Código de autorização ausente.");
  }
  if (!(await consumeOAuthState(state))) {
    return res.status(400).send("Sessão de autenticação inválida ou expirada. Inicie a conexão novamente pelo painel administrativo.");
  }

  try {
    const oauth2Client = getOAuthClient(req);
    const { tokens } = await oauth2Client.getToken(code);
    await saveTokens(tokens);

    res.redirect("/?google_cal_success=true");
  } catch (err) {
    log.error("Erro ao trocar código por tokens:", err);
    res.status(500).send(`Erro na autenticação: ${err instanceof Error ? err.message : String(err)}`);
  }
});

// Disconnect Google account — admin-only, and POST rather than GET since
// this has a real side effect (a plain link/prefetch hitting a GET here
// would silently break the calendar sync for anyone who stumbled on the URL).
app.post("/api/auth/google/disconnect", requireAdmin, async (req, res) => {
  await deleteTokens();
  res.json({ success: true });
});

// Diagnóstico do e-mail: remetente em uso (só o endereço) e o último erro do
// Resend, se houver — nada de destinatário nem chave.
app.get("/api/resend/status", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    configured: !!resend,
    from: parseFromHeader(EMAIL_FROM).address,
    lastFailure: lastEmailFailure,
  });
});

// ----------------------------------------------------
// SINCRONIZAÇÃO DE COINS COM O APP — chamado pelo backend do aplicativo
// separado (nunca pelo navegador), autenticado por segredo compartilhado, não
// por login de usuário. O app é a única fonte de verdade de como as Coins são
// ganhas (foto de avistamento aprovada por lá); aqui só espelhamos o saldo
// pra poder gastar em recompensas das pousadas parceiras.
// ----------------------------------------------------

app.post("/api/integrations/app-coins-sync", async (req, res) => {
  if (!APP_COINS_SYNC_SECRET) {
    return res.status(503).json({ error: "APP_COINS_SYNC_SECRET não configurada — sincronização de Coins indisponível." });
  }
  if (!safeEqual(String(req.headers["x-sync-secret"] || ""), APP_COINS_SYNC_SECRET)) {
    return res.status(401).json({ error: "Segredo de sincronização inválido." });
  }

  // Aceita tanto uma chamada direta simples ({email, coins}) quanto o formato
  // nativo de Database Webhook do Supabase ({record: {email, coins, ...}}) —
  // assim o app pode disparar isso via um Database Webhook, sem precisar de
  // nenhum servidor próprio no meio.
  const source = req.body.record && typeof req.body.record === "object" ? req.body.record : req.body;
  const email = String(source.email || "").trim().toLowerCase();
  const coins = Number(source.coins);
  if (!email || !Number.isFinite(coins) || coins < 0) {
    return res.status(400).json({ error: "Informe email e um saldo de coins válido (número >= 0)." });
  }

  // Saldo ABSOLUTO reportado pelo app (não um delta) — evita divergência se
  // o app reenviar a mesma chamada depois de uma falha de rede.
  const { data: turista, error: findErr } = await supabase.from("turistas").select("id").eq("email", email).maybeSingle();
  if (findErr) return res.status(500).json({ error: "Erro ao buscar turista." });
  if (!turista) {
    // Sem conta no site ainda com esse email — nada a sincronizar por
    // enquanto (não é erro: o turista pode criar a conta depois).
    return res.status(200).json({ synced: false, reason: "Nenhuma conta de turista com este email no site." });
  }

  const { error: updateErr } = await supabase.from("turistas").update({ coins }).eq("id", turista.id);
  if (updateErr) return res.status(500).json({ error: "Erro ao atualizar saldo de Coins." });
  res.json({ synced: true, coins });
});

// SUPABASE SYSTEM STATUS & AUTO-CONFIGURATION ENDPOINTS
// Exposes only the public Supabase URL and anon key (safe by design, protected by RLS)
// so the frontend can initialize its own Supabase Auth client.
app.get("/api/config", (req, res) => {
  res.json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY });
});

// Health-check público e leve — sem autenticação (monitor de uptime não
// consegue autenticar) e sem vazar nada sensível (ao contrário de
// /api/supabase/status, que é admin-only e detalha tabela por tabela).
// Faz uma query real e barata pra confirmar que a conexão com o Supabase
// está de pé, não só que o processo Node respondeu. Sem isso não tem como
// nenhuma ferramenta de monitoramento (UptimeRobot, Better Stack etc.)
// vigiar o site de verdade nem disparar alerta automático quando cair.
app.get("/api/health", async (req, res) => {
  const startedAt = Date.now();
  try {
    const { error } = await supabase.from("pousadas").select("id").limit(1);
    const databaseOk = !error;
    res.status(databaseOk ? 200 : 503).json({
      status: databaseOk ? "ok" : "degraded",
      database: databaseOk ? "ok" : "error",
      responseTimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ status: "degraded", database: "error", timestamp: new Date().toISOString() });
  }
});

app.get("/api/supabase/status", requireAdmin, async (req, res) => {
  const status: Record<string, boolean> = {};
  const tables = ["pousadas", "guides", "bookings", "reviews", "sightings", "notifications", "species", "turistas", "roteiros", "reservas", "pagamentos", "guias", "candidaturas", "referral_sources"];
  
  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select("id").limit(1);
      status[table] = !error;
    } catch {
      status[table] = false;
    }
  }
  
  res.json({
    connected: true,
    url: SUPABASE_URL,
    tables: status,
    allOk: Object.values(status).every(v => v)
  });
});

app.get("/api/integrity/fake-data-check", requireAdmin, async (req, res) => {
  const found: Record<string, string[]> = {};
  for (const [table, ids] of Object.entries(KNOWN_FAKE_IDS)) {
    const { data } = await supabase.from(table).select("id").in("id", ids);
    if (data && data.length > 0) found[table] = data.map((r: any) => r.id);
  }
  res.json({ clean: Object.keys(found).length === 0, found });
});

app.post("/api/integrity/purge-fake-data", requireAdmin, async (req, res) => {
  const removed: Record<string, number> = {};
  for (const [table, ids] of Object.entries(KNOWN_FAKE_IDS)) {
    const { error, count } = await supabase.from(table).delete({ count: "exact" }).in("id", ids);
    if (!error && count) removed[table] = count;
  }
  await logAdminAction(res.locals.adminUser, "purge_fake_data", "integrity", null, JSON.stringify(removed));
  res.json({ removed });
});

// Admin-only: this dumps the full DB schema/DDL (table structure, RLS setup)
// — nothing in the frontend actually calls it (it was a leftover setup
// convenience URL), so it was pure information disclosure to anyone who
// guessed the path.
app.get("/api/supabase/sql", requireAdmin, (req, res) => {
  const sql = `-- ECOSAFARI BRASIL: COPIE E COLE ESTE SCRIPT NO EDITOR SQL DO SEU PAINEL SUPABASE PARA CRIAR AS TABELAS E POLÍTICAS DE SEGURANÇA (RLS)

-- 1. TABELA DE POUSADAS
CREATE TABLE IF NOT EXISTS pousadas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  "longDescription" TEXT,
  location TEXT,
  rating FLOAT DEFAULT 0, -- 0 = "sem avaliações ainda" (nunca aparece de verdade, já que a média de 1+ avaliação real é sempre >= 1)
  "pricePerNight" NUMERIC DEFAULT 0,
  images TEXT, -- armazenado como string JSON
  features TEXT, -- armazenado como string JSON
  activities TEXT, -- armazenado como string JSON
  experiences TEXT, -- armazenado como string JSON
  capacity INTEGER DEFAULT 1,
  "videoUrl" TEXT,
  verified BOOLEAN DEFAULT true,
  "viewCount" INTEGER DEFAULT 0,
  "officialSiteUrl" TEXT,
  "teamPhotoUrl" TEXT,
  "teamSectionTitle" TEXT,
  "teamSectionText" TEXT,
  "officialSiteImages" TEXT, -- armazenado como string JSON, igual images
  rooms TEXT -- array de {type,capacity,quantity}, armazenado como string JSON
);

-- Caso a tabela já exista de uma execução anterior deste script, garante as novas colunas
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT true;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "viewCount" INTEGER DEFAULT 0;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "officialSiteUrl" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "teamPhotoUrl" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "teamSectionTitle" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "teamSectionText" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "officialSiteImages" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS rooms TEXT;
ALTER TABLE pousadas ALTER COLUMN rating SET DEFAULT 0;

-- Ativar RLS em pousadas (sem policies públicas — só o backend com service_role acessa)
ALTER TABLE pousadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura pública de pousadas" ON pousadas;
DROP POLICY IF EXISTS "Permitir inserção pública de pousadas" ON pousadas;
DROP POLICY IF EXISTS "Permitir atualização pública de pousadas" ON pousadas;
DROP POLICY IF EXISTS "Permitir exclusão pública de pousadas" ON pousadas;



-- 2. TABELA DE GUIAS
CREATE TABLE IF NOT EXISTS guides (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  languages TEXT, -- armazenado como string JSON
  specialty TEXT, -- armazenado como string JSON
  status TEXT DEFAULT 'disponivel',
  email TEXT,
  phone TEXT,
  bio TEXT,
  age INTEGER,
  birthplace TEXT,
  interests TEXT, -- armazenado como string JSON
  rating FLOAT DEFAULT 0,
  "photoUrl" TEXT,
  images TEXT -- galeria de fotos, armazenado como string JSON
);

-- Caso a tabela já exista de uma execução anterior deste script
ALTER TABLE guides ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS birthplace TEXT;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS interests TEXT;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS rating FLOAT DEFAULT 0;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS images TEXT;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS "unavailableDates" TEXT;
ALTER TABLE guides ALTER COLUMN rating SET DEFAULT 0;

-- Ativar RLS em guias (sem policies públicas — só o backend com service_role acessa)
ALTER TABLE guides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura pública de guias" ON guides;
DROP POLICY IF EXISTS "Permitir inserção pública de guias" ON guides;
DROP POLICY IF EXISTS "Permitir atualização pública de guias" ON guides;
DROP POLICY IF EXISTS "Permitir exclusão pública de guias" ON guides;



-- 2b. TABELA DE ATRAÇÕES (parceiro que não é hospedagem: Parada Legal ou Restaurante)
CREATE TABLE IF NOT EXISTS atracoes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('parada_legal', 'restaurante')),
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  images TEXT, -- armazenado como string JSON
  menu TEXT, -- cardápio (string JSON) — só para type = 'restaurante'
  availability TEXT, -- dias/horário de funcionamento, texto livre
  rating FLOAT DEFAULT 0,
  verified BOOLEAN DEFAULT false,
  "dateCreated" TEXT
);

ALTER TABLE atracoes ADD COLUMN IF NOT EXISTS availability TEXT;
ALTER TABLE atracoes ALTER COLUMN rating SET DEFAULT 0;

-- Ativar RLS em atrações (sem policies públicas — só o backend com service_role acessa)
ALTER TABLE atracoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura pública de atracoes" ON atracoes;
DROP POLICY IF EXISTS "Permitir escrita pública de atracoes" ON atracoes;



-- 3. TABELA DE RESERVAS (BOOKINGS)
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  "pousadaId" TEXT,
  "pousadaName" TEXT,
  "customerName" TEXT,
  "customerEmail" TEXT,
  "customerPhone" TEXT,
  nationality TEXT,
  adults INTEGER DEFAULT 1,
  children INTEGER DEFAULT 0,
  "childAges" TEXT,
  "dietaryRestrictions" TEXT,
  "specialNeeds" TEXT,
  "checkIn" TEXT,
  "checkOut" TEXT,
  "experienceType" TEXT,
  "totalPrice" NUMERIC DEFAULT 0,
  status TEXT,
  "guideId" TEXT,
  "guideName" TEXT,
  "dateCreated" TEXT,
  "googleCalendarEventId" TEXT
);

-- Ativar RLS em reservas (sem policies públicas — só o backend com service_role acessa)
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura pública de reservas" ON bookings;
DROP POLICY IF EXISTS "Permitir inserção pública de reservas" ON bookings;
DROP POLICY IF EXISTS "Permitir atualização pública de reservas" ON bookings;
DROP POLICY IF EXISTS "Permitir exclusão pública de reservas" ON bookings;



-- 4. TABELA DE AVALIAÇÕES (REVIEWS) — de pousada, atração OU guia (exatamente um dos três IDs preenchido)
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  "pousadaId" TEXT,
  "atracaoId" TEXT,
  "guideId" TEXT,
  "userName" TEXT,
  rating FLOAT,
  comment TEXT,
  date TEXT,
  "photoUrl" TEXT,
  "turistaId" TEXT
);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "atracaoId" TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "guideId" TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "turistaId" TEXT;

-- Ativar RLS em avaliações (sem policies públicas — só o backend com service_role acessa)
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura pública de avaliações" ON reviews;
DROP POLICY IF EXISTS "Permitir inserção pública de avaliações" ON reviews;
DROP POLICY IF EXISTS "Permitir atualização pública de avaliações" ON reviews;
DROP POLICY IF EXISTS "Permitir exclusão pública de avaliações" ON reviews;



-- 5. TABELA DE AVISTAMENTOS (SIGHTINGS)
CREATE TABLE IF NOT EXISTS sightings (
  id TEXT PRIMARY KEY,
  "pousadaId" TEXT,
  "pousadaName" TEXT,
  "userName" TEXT,
  "animalName" TEXT,
  "imageUrl" TEXT,
  location TEXT,
  timestamp TEXT,
  likes INTEGER DEFAULT 0
);

-- Ativar RLS em avistamentos (sem policies públicas — só o backend com service_role acessa)
ALTER TABLE sightings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura pública de avistamentos" ON sightings;
DROP POLICY IF EXISTS "Permitir inserção pública de avistamentos" ON sightings;
DROP POLICY IF EXISTS "Permitir atualização pública de avistamentos" ON sightings;
DROP POLICY IF EXISTS "Permitir exclusão pública de avistamentos" ON sightings;



-- 6. TABELA DE NOTIFICAÇÕES
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  target TEXT,
  "targetId" TEXT,
  message TEXT,
  type TEXT,
  timestamp TEXT,
  read BOOLEAN DEFAULT false,
  "bookingId" TEXT
);

-- Ativar RLS em notificações (sem policies públicas — só o backend com service_role acessa)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura pública de notificações" ON notifications;
DROP POLICY IF EXISTS "Permitir inserção pública de notificações" ON notifications;
DROP POLICY IF EXISTS "Permitir atualização pública de notificações" ON notifications;
DROP POLICY IF EXISTS "Permitir exclusão pública de notificações" ON notifications;



-- 7. TABELA DE ESPÉCIES SILVESTRES (SPECIES)
CREATE TABLE IF NOT EXISTS species (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "scientificName" TEXT,
  category TEXT,
  description TEXT,
  details TEXT,
  sightings TEXT,
  image TEXT,
  "bestPousadaId" TEXT,
  "bestPousadaName" TEXT
);

-- Ativar RLS em espécies (sem policies públicas — só o backend com service_role acessa)
ALTER TABLE species ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura pública de espécies" ON species;
DROP POLICY IF EXISTS "Permitir inserção pública de espécies" ON species;
DROP POLICY IF EXISTS "Permitir atualização pública de espécies" ON species;
DROP POLICY IF EXISTS "Permitir exclusão pública de espécies" ON species;



-- ======================================================
-- CAMADA DE TURISMO (Turistas, Roteiros, Reservas, Pagamentos, Guias)
-- Modelo adicional conforme especificação do banco de dados, em paralelo
-- ao catálogo de Pousadas/Bookings já existente.
--
-- Sem policies públicas: só o backend (usando a service_role key) lê/grava
-- essas tabelas — inclusive "turistas" (dados pessoais) e "pagamentos"
-- (dados financeiros). Isso é reforçado também no Express, que exige login
-- de admin (requireAdmin) para todas as rotas dessa camada.
-- ======================================================

-- 8. TABELA DE TURISTAS
-- id: para uma linha criada pelo admin (TURISTAS CRUD) é um id qualquer
-- ("t_..."); para um cadastro self-service (/api/turista/signup) é o próprio
-- id do usuário no Supabase Auth, o que permite localizar "seu perfil" e
-- exigir um perfil de turista para avaliar (ver requireTourist no server.ts).
CREATE TABLE IF NOT EXISTS turistas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  whatsapp TEXT,
  country TEXT,
  age INTEGER,
  preferences TEXT
);

ALTER TABLE turistas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura pública de turistas" ON turistas;
DROP POLICY IF EXISTS "Permitir inserção pública de turistas" ON turistas;
DROP POLICY IF EXISTS "Permitir atualização pública de turistas" ON turistas;
DROP POLICY IF EXISTS "Permitir exclusão pública de turistas" ON turistas;



-- 9. TABELA DE ROTEIROS
CREATE TABLE IF NOT EXISTS roteiros (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  duration TEXT,
  price NUMERIC DEFAULT 0,
  difficulty TEXT,
  capacity INTEGER DEFAULT 1,
  description TEXT
);

ALTER TABLE roteiros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura pública de roteiros" ON roteiros;
DROP POLICY IF EXISTS "Permitir inserção pública de roteiros" ON roteiros;
DROP POLICY IF EXISTS "Permitir atualização pública de roteiros" ON roteiros;
DROP POLICY IF EXISTS "Permitir exclusão pública de roteiros" ON roteiros;



-- 10. TABELA DE RESERVAS (DE ROTEIRO)
CREATE TABLE IF NOT EXISTS reservas (
  id TEXT PRIMARY KEY,
  "turistaId" TEXT,
  "roteiroId" TEXT,
  date TEXT,
  status TEXT DEFAULT 'pendente',
  "totalPrice" NUMERIC DEFAULT 0
);

ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura pública de reservas de roteiro" ON reservas;
DROP POLICY IF EXISTS "Permitir inserção pública de reservas de roteiro" ON reservas;
DROP POLICY IF EXISTS "Permitir atualização pública de reservas de roteiro" ON reservas;
DROP POLICY IF EXISTS "Permitir exclusão pública de reservas de roteiro" ON reservas;



-- 11. TABELA DE PAGAMENTOS
CREATE TABLE IF NOT EXISTS pagamentos (
  id TEXT PRIMARY KEY,
  "reservaId" TEXT,
  amount NUMERIC DEFAULT 0,
  date TEXT,
  method TEXT,
  status TEXT DEFAULT 'pendente'
);

ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura pública de pagamentos" ON pagamentos;
DROP POLICY IF EXISTS "Permitir inserção pública de pagamentos" ON pagamentos;
DROP POLICY IF EXISTS "Permitir atualização pública de pagamentos" ON pagamentos;
DROP POLICY IF EXISTS "Permitir exclusão pública de pagamentos" ON pagamentos;



-- 12. TABELA DE GUIAS (camada de turismo, distinta da tabela "guides" já existente)
CREATE TABLE IF NOT EXISTS guias (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  specialty TEXT,
  phone TEXT,
  availability BOOLEAN DEFAULT true,
  rating FLOAT DEFAULT 5.0
);

ALTER TABLE guias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura pública de guias turísticos" ON guias;
DROP POLICY IF EXISTS "Permitir inserção pública de guias turísticos" ON guias;
DROP POLICY IF EXISTS "Permitir atualização pública de guias turísticos" ON guias;
DROP POLICY IF EXISTS "Permitir exclusão pública de guias turísticos" ON guias;



-- 13. TABELA DE CANDIDATURAS (cadastro público de parceiros: guias, pousadas e atrações)
-- Recebe as submissões do formulário público em /seja-parceiro, mediadas pelo
-- backend (POST /api/candidaturas é a única rota pública; leitura/edição
-- exigem login de admin). Sem policies públicas — só o backend acessa.
-- "partnerId" é preenchido só por POST /api/candidaturas/:id/approve, que
-- cria o registro real do parceiro (pousadas/guides/atracoes) + o login dele
-- a partir do que foi submetido aqui.
CREATE TABLE IF NOT EXISTS candidaturas (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pendente',
  "dateCreated" TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  message TEXT,
  languages TEXT,
  availability TEXT,
  age INTEGER,
  "experienceYears" INTEGER,
  specialty TEXT,
  "pousadaName" TEXT,
  location TEXT,
  capacity INTEGER,
  "atracaoName" TEXT,
  "atracaoType" TEXT,
  "partnerId" TEXT
);

ALTER TABLE candidaturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir inserção pública de candidaturas" ON candidaturas;
DROP POLICY IF EXISTS "Permitir leitura pública de candidaturas" ON candidaturas;
DROP POLICY IF EXISTS "Permitir atualização pública de candidaturas" ON candidaturas;
DROP POLICY IF EXISTS "Permitir exclusão pública de candidaturas" ON candidaturas;


-- 14. TABELA DE ORIGEM DOS VISITANTES (pesquisa "como você chegou até nós?")
-- Preenchida pelo formulário de primeiro acesso no site. Mediada pelo
-- backend (POST público, GET só admin). Sem policies públicas.
CREATE TABLE IF NOT EXISTS referral_sources (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  "otherText" TEXT,
  timestamp TEXT
);

ALTER TABLE referral_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura pública de referral_sources" ON referral_sources;
DROP POLICY IF EXISTS "Permitir inserção pública de referral_sources" ON referral_sources;
`;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(sql);
});

app.post("/api/chat", chatLimiter, async (req, res) => {
  const { messages: rawMessages } = req.body;

  if (!rawMessages || !Array.isArray(rawMessages)) {
    return res.status(400).json({ error: "Formato de mensagens inválido." });
  }

  // Caps cost/abuse exposure per request regardless of the rate limiter
  // above — a client sending an enormous history or giant message bodies
  // shouldn't be able to multiply the cost of a single chat call.
  const messages = rawMessages
    .slice(-20)
    .map((m: any) => ({ role: m?.role, content: typeof m?.content === "string" ? m.content.slice(0, 2000) : "" }));

  // Simple public-info support assistant: answers general questions about the
  // agency using only public catalog data, and always steers anything about
  // an actual booking/payment/personal request to the real agency WhatsApp.
  const [pousadasContext, guidesContext] = await Promise.all([getPousadasContext(), getGuidesContext()]);
  const systemInstruction = `Você é a "Sofia", assistente de suporte do site da agência de turismo ecológico "EcoSafari Brasil".
Seu papel é responder dúvidas PÚBLICAS sobre o site, as pousadas parceiras e os guias disponíveis: localizações, preços de diária, experiências e atividades disponíveis, estrutura das pousadas, dúvidas gerais de viagem (documentação, vacinas, o que levar, melhor época para avistamentos), e qual guia combina melhor com o que o visitante procura.

Catálogo público de pousadas parceiras:
${pousadasContext}

Catálogo público de guias disponíveis (idiomas e especialidades/temas de interesse de cada um):
${guidesContext}

Regras importantes:
1. Você NÃO coleta dados pessoais do cliente e NÃO fecha reservas, pagamentos ou datas — isso é feito só pela equipe humana.
2. Quando o visitante mencionar um interesse específico (observação de aves, pesca, fotografia, história, algum idioma que precisa) ou perguntar por um guia, recomende pelo nome o guia do catálogo acima cujo idioma/especialidade/tema combina melhor — e só esse, não liste todos. Se nenhum combinar bem, diga isso com sinceridade em vez de forçar uma recomendação.
3. Sempre que o cliente quiser reservar, pagar, negociar preço, confirmar um guia específico, tratar de algo específico da viagem dele, ou qualquer coisa que exija um atendimento humano, direcione educadamente para o WhatsApp oficial da agência: ${AGENCY_WHATSAPP} (ex: "Para seguir com sua reserva, é só chamar a gente no WhatsApp oficial: ${AGENCY_WHATSAPP} 😊").
4. Seja breve, calorosa e direta — respostas curtas, adequadas para leitura rápida, sem blocos gigantes de texto.`;

  // Check if AI is active
  if (ai) {
    try {
      // Map messages array to Gemini content parts
      const contents = messages.map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      const replyText = response.text || `Olá! Desculpe, tive uma pequena oscilação aqui na floresta. Para um atendimento garantido, fale com a gente no WhatsApp: ${AGENCY_WHATSAPP}.`;
      return res.json({ reply: replyText });

    } catch (err) {
      log.error("Gemini invocation failed, using fallback:", err);
    }
  }

  // Fallback (no Gemini key configured, or the call failed): a simple canned
  // reply that always points to the real WhatsApp for anything beyond public info.
  const reply = `Olá! 🌿 Sou a Sofia, assistente de suporte da EcoSafari Brasil. Posso ajudar com dúvidas gerais sobre nossas pousadas parceiras e experiências.\n\nPara reservas, pagamentos ou qualquer atendimento personalizado, fale direto com nossa equipe no WhatsApp oficial: *${AGENCY_WHATSAPP}* 😊`;

  res.json({ reply });
});
}
