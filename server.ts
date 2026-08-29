import express from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { google } from "googleapis";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { Resend } from "resend";
import PDFDocument from "pdfkit";
import { Pousada, Guide, Booking, Sighting, Review, Notification, Species, Turista, Roteiro, Reserva, Pagamento, GuiaTuristico, Candidatura, ReferralSource, Atracao, PartnerType, Recompensa, Resgate, Produto, Consumo } from "./src/types.js";
import QRCode from "qrcode";
import { slugify } from "./src/lib/slug.js";
import { AsyncLocalStorage } from "async_hooks";

dotenv.config();

const app = express();

// Log estruturado (JSON) com um requestId correlacionando toda linha
// gerada durante a mesma requisição — antes cada log.error/warn/log era uma
// linha solta, sem como saber quais pertenciam à mesma chamada numa
// função serverless da Vercel, o que torna investigar um incidente real em
// produção bem mais difícil do que precisa ser.
//
// AsyncLocalStorage propaga o requestId por baixo dos panos através de
// await/promises — por isso log.error(msg, ...) não precisa receber `req`
// como parâmetro em cada uma das dezenas de chamadas espalhadas pelo
// arquivo, só funciona automaticamente pra qualquer código executado a
// partir do middleware abaixo.
const requestContext = new AsyncLocalStorage<{ requestId: string }>();

function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

function structuredLog(level: "info" | "warn" | "error", message: unknown, ...details: unknown[]) {
  const entry = {
    level,
    message: message instanceof Error ? message.message : message,
    requestId: currentRequestId(),
    timestamp: new Date().toISOString(),
    ...(details.length ? { details: details.map(d => (d instanceof Error ? { error: d.message, stack: d.stack } : d)) } : {}),
  };
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(JSON.stringify(entry));
}

const log = {
  info: (message: unknown, ...details: unknown[]) => structuredLog("info", message, ...details),
  warn: (message: unknown, ...details: unknown[]) => structuredLog("warn", message, ...details),
  error: (message: unknown, ...details: unknown[]) => structuredLog("error", message, ...details),
};

// Gera o requestId e propaga pelo resto da cadeia de middlewares/handlers
// desta requisição — registrado logo no início, antes de qualquer outra
// coisa, pra cobrir o máximo de código possível. Também devolvido no
// header de resposta: dá pra pedir pro cliente "me manda o X-Request-Id que
// apareceu" na hora de investigar um bug relatado por alguém.
app.use((req, res, next) => {
  const requestId = randomUUID();
  res.setHeader("X-Request-Id", requestId);
  requestContext.run({ requestId }, next);
});

// Stripe requires the raw, untouched request body to verify the webhook
// signature, so this route (and its express.raw() body parser) must be
// registered before the blanket express.json() below would otherwise
// consume and re-serialize the body first.
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);

app.use(express.json());

// Security headers on every response — applies to the Express app itself
// (local dev, Render/Railway via startLocalServer, and any Vercel path that
// actually reaches this function: /api/*, /sitemap.xml, /pousadas/:id,
// /site/:slug). Static assets and the SPA shell on Vercel are served straight
// from the CDN per vercel.json's rewrites and never touch this middleware —
// those get the equivalent headers from the "headers" block in vercel.json.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  // Allowlist reflects the third-party scripts this app actually loads:
  // Google reCAPTCHA v3, Meta Pixel, Google Analytics 4, Supabase (API +
  // Storage), Sentry. If you add a new external script/embed later, this
  // will block it until its domain is added here — check the browser
  // console for the CSP violation, it names the exact directive/domain to add.
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' https://www.google.com https://www.gstatic.com https://connect.facebook.net https://www.googletagmanager.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://*.supabase.co https://www.google.com https://www.facebook.com https://*.sentry.io https://www.googletagmanager.com https://*.google-analytics.com",
      "frame-src https://www.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ")
  );
  next();
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const isProd = process.env.NODE_ENV === "production";
const distPath = path.join(process.cwd(), 'dist');

// "vite" is dev-only and imported dynamically below (inside startLocalServer,
// never called on Vercel) so its whole dependency tree stays out of the
// serverless function bundle — a static top-level import here was pulling it
// in regardless and is the likely cause of past FUNCTION_INVOCATION_FAILED
// crashes on Vercel. Type-only reference below has no runtime cost.
let viteDevServer: import("vite").ViteDevServer | null = null;

// Initialize Supabase client safely — no hardcoded fallback on purpose: a
// literal project URL/key baked into source code stays in git history forever
// (even after rotation) and previously meant a missing .env silently pointed
// at a real Supabase project instead of failing loudly. Configure these in
// .env locally and in the deploy platform's environment variables.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórias. Defina-as no .env (local) ou nas variáveis de ambiente do deploy (Vercel/Render)."
  );
}
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// The backend is a trusted intermediary: every legitimate read/write (public or
// admin) is mediated and authorized by this Express app, never by the browser
// talking to Supabase directly. So the backend itself uses the service_role key
// (bypasses RLS) when available, while RLS on the tables stays locked down
// against anyone who extracts the public anon key and hits Supabase directly.
const supabase = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

if (SUPABASE_SERVICE_ROLE_KEY) {
  log.info("Supabase: usando service_role key (RLS bypassada para o backend confiável).");
} else {
  log.warn("Supabase: SUPABASE_SERVICE_ROLE_KEY não configurada — usando anon key. Tabelas com RLS restrita ficarão inacessíveis ao backend até essa chave ser definida.");
}

// Separate client for admin-account management (Supabase Auth Admin API),
// e.g. creating the first admin user. Only usable when service_role is present.
const supabaseAdminAuth = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

// Rate limiting — bounds brute-force and spam abuse per IP. Vercel sits in
// front as a proxy, so `trust proxy` is required for express-rate-limit to
// key off the real client IP (X-Forwarded-For) instead of Vercel's own.
app.set("trust proxy", 1);

// Shared store backed by a Postgres table (via the increment_rate_limit RPC
// — see scripts/add-rate-limit-table.sql), so the limit is enforced across
// every concurrent Vercel serverless instance instead of each one counting
// independently in its own memory (which made the advertised limits much
// looser in practice than the numbers suggested). Falls back to counting
// in-memory only if that RPC isn't reachable — e.g. the migration hasn't
// been run yet — so rate limiting degrades instead of hard-failing requests.
class SupabaseRateLimitStore {
  windowMs = 0;
  private memoryFallback = new Map<string, { count: number; resetAt: number }>();

  init(options: { windowMs: number }) {
    this.windowMs = options.windowMs;
  }

  private incrementInMemory(key: string) {
    const now = Date.now();
    const existing = this.memoryFallback.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + this.windowMs;
      this.memoryFallback.set(key, { count: 1, resetAt });
      return { totalHits: 1, resetTime: new Date(resetAt) };
    }
    existing.count += 1;
    return { totalHits: existing.count, resetTime: new Date(existing.resetAt) };
  }

  async increment(key: string) {
    const { data, error } = await supabase.rpc("increment_rate_limit", { p_key: key, p_window_ms: this.windowMs });
    if (error || !data?.[0]) {
      return this.incrementInMemory(key);
    }
    return { totalHits: data[0].total_hits, resetTime: new Date(data[0].reset_time) };
  }

  async decrement(key: string) {
    await supabase.rpc("decrement_rate_limit", { p_key: key }).then(() => {}, () => {});
  }

  async resetKey(key: string) {
    await supabase.from("rate_limits").delete().eq("key", key).then(() => {}, () => {});
    this.memoryFallback.delete(key);
  }
}

// Shared across every admin- and partner-authenticated route in the app
// (requireAdmin, requireAnyUploader, requirePartnerAccess,
// /api/my-partner-profile) — not just a login attempt. There's no separate
// password-exchange endpoint in this Express app to protect (that happens
// client-side directly against Supabase Auth), so this limiter's real job
// is bounding abuse of an already-valid token, not brute-forcing one. 30
// requests per 5 minutes was tight enough that normal interactive use of
// the admin dashboard (each tab switch alone fires several authenticated
// fetches) could exhaust it and start throwing "não foi possível carregar"
// errors on ordinary panels — raised well above that.
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: new SupabaseRateLimitStore() as any,
  message: { error: "Muitas tentativas. Tente novamente em alguns minutos." },
});

const publicFormLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new SupabaseRateLimitStore() as any,
  message: { error: "Muitos envios em pouco tempo. Tente novamente mais tarde." },
});

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  store: new SupabaseRateLimitStore() as any,
  message: { error: "Muitas tentativas de pagamento. Tente novamente mais tarde." },
});

const chatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: new SupabaseRateLimitStore() as any,
  message: { error: "Muitas mensagens em pouco tempo. Aguarde um instante." },
});

// Generous compared to the others — a shared/NAT IP genuinely browsing the
// catalog can rack up view pings quickly, this just needs to stop a script
// hammering one pousada's counter, not throttle normal traffic.
const viewLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: new SupabaseRateLimitStore() as any,
  message: { error: "Muitas requisições em pouco tempo." },
});

// A conta é admin se tiver app_metadata.isAdmin === true — o jeito atual,
// que convive com qualquer outro papel que a mesma conta já tenha (turista,
// parceiro), porque conceder admin nunca substitui o app_metadata inteiro,
// só acrescenta essa chave (ver finalizeGrantAdmin). role === "admin" fica
// como fallback só para contas antigas criadas antes dessa mudança (scripts/
// create-admin.ts e o extinto POST /api/admin/users usavam esse formato).
function isAdminUser(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return user?.app_metadata?.isAdmin === true || user?.app_metadata?.role === "admin";
}

// Mesma lógica, pro papel de turista: isTourist convive com isAdmin/role de
// parceiro que a conta já tenha — é o que permite um admin ou parceiro virar
// turista com a MESMA conta (ver POST /api/turista/upgrade) em vez de ter
// que criar uma segunda conta desconectada. role === "tourist" continua
// valendo pras contas de turista "puras" (criadas direto por
// POST /api/turista/signup, sem nenhum outro papel).
function isTouristUser(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return user?.app_metadata?.isTourist === true || user?.app_metadata?.role === "tourist";
}

// Lê o claim "aal" (Authenticator Assurance Level) de dentro de um JWT já
// validado pelo Supabase — decodifica só o payload (base64url), sem
// reverificar assinatura, porque quem chama isso só faz depois de
// supabase.auth.getUser(token) já ter confirmado que o token é autêntico.
// aal1 = só senha; aal2 = senha + segundo fator (TOTP) verificado nesta
// sessão. Precisa disso pra impedir que uma senha vazada sozinha (sem o
// código do autenticador) ainda funcione contra a API pra contas com 2FA
// ativado — ver AdminMfaSettings.tsx/AdminLoginPanel.tsx pro lado do cliente.
function getTokenAal(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json).aal || null;
  } catch {
    return null;
  }
}

// true quando a conta tem um fator de MFA verificado mas a sessão atual
// (token) ainda está em aal1 — ou seja, entrou com a senha mas não
// completou o segundo fator. Contas sem MFA cadastrado nunca caem aqui
// (mantém compatibilidade com todo admin que ainda não ativou 2FA).
function hasUnsatisfiedMfaRequirement(user: { factors?: { status?: string }[] | null }, token: string): boolean {
  const hasMfaEnrolled = (user.factors || []).some(f => f.status === "verified");
  if (!hasMfaEnrolled) return false;
  return getTokenAal(token) !== "aal2";
}

// Verifies the caller is an authenticated admin (Supabase Auth JWT with
// app_metadata.isAdmin === true) before allowing access to admin-only routes.
// The Gestão tab hides itself client-side for non-admins, but that's cosmetic —
// this is what actually stops someone from calling the API directly.
const requireAdmin: express.RequestHandler[] = [
  authLimiter,
  async (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Autenticação necessária." });
    }

    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user || !isAdminUser(data.user)) {
        return res.status(403).json({ error: "Acesso restrito a administradores." });
      }
      if (hasUnsatisfiedMfaRequirement(data.user, token)) {
        return res.status(401).json({ error: "Complete a verificação em duas etapas para continuar.", mfaRequired: true });
      }
      // Stashed for routes that need to know which admin is calling — e.g.
      // preventing an admin from revoking their own access below, or
      // atribuindo autoria no log de auditoria (logAdminAction).
      res.locals.adminUser = data.user;
      next();
    } catch (err) {
      res.status(401).json({ error: "Token inválido." });
    }
  },
];

// Any authenticated admin, partner OR tourist — used for routes like image
// upload that don't belong to a specific resource yet, so there's nothing to
// scope ownership against. The real authorization boundary is still enforced
// downstream: an uploaded image is just a URL sitting in storage until it's
// attached to a record via a PUT that goes through requirePartnerAccess
// (partner-owned records) or PUT /api/turista/me (own tourist profile photo),
// both of which *do* check ownership. Tourist accounts are self-service
// (zero vetting, unlike invite-only admin/partner) — authLimiter is the
// abuse guard for that wider pool of callers.
const requireAnyUploader: express.RequestHandler[] = [
  authLimiter,
  async (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "Autenticação necessária." });
    }
    try {
      const { data, error } = await supabase.auth.getUser(token);
      const role = data.user?.app_metadata?.role;
      if (error || !data.user || (!isAdminUser(data.user) && role !== "partner" && !isTouristUser(data.user))) {
        return res.status(403).json({ error: "Acesso restrito a administradores, parceiros ou turistas com perfil." });
      }
      next();
    } catch (err) {
      res.status(401).json({ error: "Token inválido." });
    }
  },
];

// Allows either an admin OR the partner who owns this specific record (a
// pousada/atração/guia self-editing their own profile) to proceed — anyone
// else, including a partner authenticated for a *different* record, is
// rejected. This is the actual access-control boundary for partner
// self-service: app_metadata (role/partnerType/partnerId) is set only by
// the service_role-backed admin invite flow below, never by the client, so
// a caller can't grant themselves ownership of an arbitrary record just by
// crafting a request. res.locals.isAdmin lets the route handler allow a few
// extra admin-only fields (e.g. "verified") without a second whitelist.
function requirePartnerAccess(partnerType: PartnerType): express.RequestHandler[] {
  return [
    authLimiter,
    async (req, res, next) => {
      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!token) {
        return res.status(401).json({ error: "Autenticação necessária." });
      }
      try {
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user) {
          return res.status(401).json({ error: "Token inválido." });
        }
        // Stashed for logAdminAction — quem editou, seja admin ou o próprio
        // parceiro autoeditando o registro.
        res.locals.actorUser = data.user;
        const role = data.user.app_metadata?.role;
        if (isAdminUser(data.user)) {
          res.locals.isAdmin = true;
          return next();
        }
        if (
          role === "partner" &&
          data.user.app_metadata?.partnerType === partnerType &&
          data.user.app_metadata?.partnerId === req.params.id
        ) {
          res.locals.isAdmin = false;
          return next();
        }
        return res.status(403).json({ error: "Acesso restrito ao administrador ou ao próprio parceiro." });
      } catch (err) {
        res.status(401).json({ error: "Token inválido." });
      }
    },
  ];
}

// Verifies the caller is an authenticated tourist (Supabase Auth JWT with
// isTouristUser() true) — the actual server-side enforcement of "só é
// possível avaliar tendo um perfil de turista". Unlike admin/partner, a
// tourist account is self-service (see POST /api/turista/signup below), but
// the role still can't be set by the client itself — only supabaseAdminAuth
// (service_role) sets app_metadata at account creation/upgrade.
const requireTourist: express.RequestHandler[] = [
  authLimiter,
  async (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "Crie um perfil de turista (ou faça login) para avaliar." });
    }
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user || !isTouristUser(data.user)) {
        return res.status(403).json({ error: "É preciso ter um perfil de turista para avaliar." });
      }
      res.locals.touristUser = data.user;
      next();
    } catch (err) {
      res.status(401).json({ error: "Token inválido." });
    }
  },
];

// Qualquer usuário autenticado, seja lá qual for o papel — usado só pra
// virar turista com a conta atual (POST /api/turista/upgrade), onde o que
// importa é apenas "existe uma sessão válida", não um papel específico.
const requireAnyAuth: express.RequestHandler[] = [
  authLimiter,
  async (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "Autenticação necessária." });
    }
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) {
        return res.status(401).json({ error: "Token inválido." });
      }
      res.locals.authUser = data.user;
      next();
    } catch (err) {
      res.status(401).json({ error: "Token inválido." });
    }
  },
];

// Só os 3 admins-chefe fundadores (app_metadata.isChief === true, marcado
// direto no banco via scripts/set-chief-admins.ts com a service_role key —
// nunca por uma rota que o cliente possa chamar) podem votar em propostas de
// admin. É isso que transforma conceder/revogar acesso administrativo numa
// decisão dos 3, em vez de algo que um único admin decide sozinho — ver
// ADMIN GOVERNANCE mais abaixo.
const requireChief: express.RequestHandler[] = [
  authLimiter,
  async (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "Autenticação necessária." });
    }
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user || data.user.app_metadata?.isChief !== true) {
        return res.status(403).json({ error: "Ação restrita aos administradores-chefe." });
      }
      res.locals.chiefUser = data.user;
      next();
    } catch (err) {
      res.status(401).json({ error: "Token inválido." });
    }
  },
];

// Registra uma ação administrativa (criar/editar/excluir um registro,
// aprovar candidatura, votar numa proposta de admin...) para que qualquer
// admin veja o que os outros fizeram no painel de Gestão. Nunca bloqueia a
// operação principal — se o log falhar (ex: tabela ainda não criada via
// scripts/add-admin-governance.sql), só um warning no console, igual ao
// padrão "fail open" já usado em addNotification/moderateText.
async function logAdminAction(
  actor: { id: string; email?: string | null } | null | undefined,
  action: string,
  resourceType: string,
  resourceId: string | null,
  resourceLabel: string | null
) {
  if (!actor) return;
  try {
    const { error } = await supabase.from("admin_audit_log").insert({
      id: `log_${randomUUID()}`,
      actor_id: actor.id,
      actor_email: actor.email || "desconhecido",
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      resource_label: resourceLabel,
    });
    if (error) log.warn("Erro ao registrar log de auditoria:", error.message);
  } catch (err: any) {
    log.warn("Erro ao registrar log de auditoria:", err.message);
  }
}

// ----------------------------------------------------
// LIXEIRA (backup de exclusão) — ver scripts/add-lixeira.sql
//
// Excluir uma pousada/guia/atração/turista/espécie pelo painel de admin
// passou a ser recuperável: antes de apagar de verdade, guardamos uma cópia
// completa da linha (e, no caso de pousada, dos produtos/consumos dela, que
// têm ON DELETE CASCADE — ver scripts/add-produtos-consumo.sql — e por isso
// desapareceriam junto sem esse cuidado) na tabela lixeira. O admin
// restaura em até 30 dias pela aba "Lixeira"; passado isso, some de vez
// (purgeLixeiraExpirada, chamado dentro do cron diário já existente).
//
// bookings/reviews/sightings continuam com ON DELETE SET NULL (decisão já
// tomada em upgrade-schema.sql: apagar uma pousada não deve apagar o
// histórico de reservas, só desvincular) — não precisam entrar aqui, eles
// sobrevivem à exclusão por conta própria.
const LIXEIRA_TABLE: Record<string, string> = {
  pousada: "pousadas",
  guide: "guides",
  atracao: "atracoes",
  turista: "turistas",
  species: "species",
};

async function moverParaLixeira(
  entityType: keyof typeof LIXEIRA_TABLE,
  id: string,
  actorEmail: string
): Promise<any | null> {
  const table = LIXEIRA_TABLE[entityType];
  const { data: row } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (!row) return null;

  const data: Record<string, any> = { row };
  if (entityType === "pousada") {
    const [{ data: produtos }, { data: consumos }] = await Promise.all([
      supabase.from("produtos").select("*").eq("pousadaId", id),
      supabase.from("consumos").select("*").eq("pousadaId", id),
    ]);
    data.produtos = produtos || [];
    data.consumos = consumos || [];
  }

  const label = row.name || id;
  const { error } = await supabase.from("lixeira").insert({
    id: `lx_${randomUUID()}`,
    entityType,
    entityId: id,
    entityLabel: label,
    data,
    deletedBy: actorEmail,
  });
  if (error) throw new Error(error.message);
  return row;
}

async function purgeLixeiraExpirada() {
  const { error } = await supabase.from("lixeira").delete().lt("expiresAt", new Date().toISOString());
  if (error) log.warn("Erro ao purgar lixeira expirada:", error.message);
}

// Optional Sentry error reporting — lazy-imported only when SENTRY_DSN is
// set, so an unconfigured deployment doesn't pay for the dependency at
// startup. Same graceful-degradation pattern as Stripe/Resend/Gemini above.
const SENTRY_DSN = process.env.SENTRY_DSN;
let sentryReady: Promise<typeof import("@sentry/node")> | null = null;
if (SENTRY_DSN) {
  sentryReady = import("@sentry/node").then((Sentry) => {
    Sentry.init({ dsn: SENTRY_DSN, tracesSampleRate: 0.1 });
    return Sentry;
  });
}
async function reportServerError(err: unknown) {
  if (!sentryReady) return;
  const Sentry = await sentryReady.catch(() => null);
  Sentry?.captureException(err);
}

// reCAPTCHA v3 (invisible — no checkbox challenge). Verifies a token the
// frontend gets from Google before accepting a public-form submission, to
// keep bots from scripting POSTs straight at the API. Fails open (allows the
// submission) when RECAPTCHA_SECRET_KEY isn't configured yet, or when Google's
// endpoint itself is unreachable — a captcha outage shouldn't block real users.
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;

// Compartilhado com o backend do aplicativo separado que distribui Coins por
// avistamento — é o que autentica POST /api/integrations/app-coins-sync
// (server-to-server, nunca chamado pelo navegador). Sem essa variável
// configurada nos dois lados, o endpoint recusa qualquer chamada.
const APP_COINS_SYNC_SECRET = process.env.APP_COINS_SYNC_SECRET;
async function verifyRecaptcha(token: unknown): Promise<boolean> {
  if (!RECAPTCHA_SECRET_KEY) return true;
  if (typeof token !== "string" || !token) return false;
  try {
    const params = new URLSearchParams({ secret: RECAPTCHA_SECRET_KEY, response: token });
    const resp = await fetch("https://www.google.com/recaptcha/api/siteverify", { method: "POST", body: params });
    const data: any = await resp.json();
    return data.success === true && (typeof data.score !== "number" || data.score >= 0.5);
  } catch (err) {
    log.warn("Falha ao verificar reCAPTCHA (permitindo o envio):", err);
    return true;
  }
}

// Initialize Gemini SDK safely
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (GEMINI_API_KEY && GEMINI_API_KEY !== "MY_GEMINI_API_KEY") {
  try {
    ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    log.info("Gemini API initialized successfully.");
  } catch (err) {
    log.error("Failed to initialize Gemini client:", err);
  }
}

// Vercel define VERCEL_ENV sozinho ("production"|"preview"|"development") em
// todo deploy — sem nenhuma configuração nossa. Serviços com efeito colateral
// real pro mundo (cobrar cartão de verdade, mandar email de verdade) só ficam
// ativos em produção ou fora da Vercel (self-host/local, onde a própria
// pessoa controla o .env de propósito). Sem essa trava, testar um preview
// deploy com as mesmas chaves configuradas em produção pode virar uma
// cobrança real no Stripe ou um email real pro cliente. ALLOW_LIVE_INTEGRATIONS_IN_PREVIEW=true
// é a válvula de escape pra quem quer testar de propósito com chaves de teste.
const VERCEL_ENV = process.env.VERCEL_ENV;
const isSafeEnvironmentForLiveIntegrations =
  !VERCEL_ENV || VERCEL_ENV === "production" || process.env.ALLOW_LIVE_INTEGRATIONS_IN_PREVIEW === "true";

// Initialize Stripe safely — checkout falls back to the payment simulation
// button in the chatbot until a real key is provided.
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
let stripe: Stripe | null = null;
if (STRIPE_SECRET_KEY && STRIPE_SECRET_KEY !== "MY_STRIPE_SECRET_KEY") {
  if (isSafeEnvironmentForLiveIntegrations) {
    try {
      stripe = new Stripe(STRIPE_SECRET_KEY);
      log.info("Stripe initialized successfully.");
    } catch (err) {
      log.error("Failed to initialize Stripe client:", err);
    }
  } else {
    log.warn(`Stripe desativado neste deploy (VERCEL_ENV=${VERCEL_ENV}) — checkout cai na simulação de pagamento. Defina ALLOW_LIVE_INTEGRATIONS_IN_PREVIEW=true pra testar de propósito com uma chave de teste.`);
  }
}
if (stripe && !STRIPE_WEBHOOK_SECRET) {
  log.warn("STRIPE_WEBHOOK_SECRET não configurada — o webhook /api/stripe/webhook ficará inativo e a confirmação de pagamento dependerá só do retorno do navegador.");
}

// Initialize Resend safely — booking confirmation emails are skipped
// (WhatsApp-only) until a real key is provided.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
let resend: Resend | null = null;
if (RESEND_API_KEY && RESEND_API_KEY !== "MY_RESEND_API_KEY") {
  if (isSafeEnvironmentForLiveIntegrations) {
    try {
      resend = new Resend(RESEND_API_KEY);
      log.info("Resend initialized successfully.");
    } catch (err) {
      log.error("Failed to initialize Resend client:", err);
    }
  } else {
    log.warn(`Resend desativado neste deploy (VERCEL_ENV=${VERCEL_ENV}) — nenhum email real será enviado. Defina ALLOW_LIVE_INTEGRATIONS_IN_PREVIEW=true pra testar de propósito.`);
  }
}

// Helper to push a notification
function addNotification(target: 'admin' | 'guide' | 'pousada', message: string, type: 'booking_new' | 'payment_received' | 'status_update' | 'sighting_new', bookingId?: string) {
  const newNotif: Notification = {
    id: `n_${randomUUID()}`,
    target,
    message,
    type,
    timestamp: new Date().toISOString(),
    read: false,
    bookingId
  };
  // Fire-and-forget — notifications are best-effort, callers don't await this
  supabase.from("notifications").insert(newNotif).then(({ error }) => {
    if (error) log.warn("Erro ao salvar notificação no Supabase:", error.message);
  });
}

// Translation resolver to prevent objects with {en, es, pt} from crashing React
function resolveTranslation(val: any, lang: "pt" | "en" | "es" = "pt"): string {
  if (!val) return "";
  if (typeof val === "string") {
    // Check if it's a JSON string representing a translation object
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === "object") {
        return parsed[lang] || parsed["pt"] || parsed["en"] || parsed["es"] || Object.values(parsed)[0] || val;
      }
    } catch {
      return val;
    }
    return val;
  }
  if (typeof val === "object") {
    return val[lang] || val["pt"] || val["en"] || val["es"] || Object.values(val)[0] || "";
  }
  return String(val);
}

function parseJSONSafe(val: any) {
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
}

// PostgREST's .or() filter string uses a mini-language where comma separates
// conditions and parentheses group them — passing a visitor-typed search term
// straight in would let those characters distort the filter's structure
// instead of being treated as literal text. Not a SQL-injection risk
// (PostgREST parameterizes the actual values), just filter-grammar breakage.
function sanitizeIlikeTerm(term: string): string {
  return term.replace(/[,()]/g, " ").trim();
}

// Bloqueia as senhas mais óbvias que "8 caracteres" sozinho deixa passar —
// não é uma lista exaustiva (isso é trabalho pra um serviço como
// haveibeenpwned), só barra o caso mais comum de conta comprometida por
// força bruta trivial num cadastro de autoatendimento (turista, sem
// nenhuma vetting humana no meio).
const COMMON_WEAK_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "password", "password1", "password123",
  "qwertyui", "qwerty123", "senha123", "senha1234", "abcd1234", "12345678a",
  "letmein1", "iloveyou", "admin123", "welcome1", "changeme", "00000000",
  "11111111", "88888888",
]);

function isWeakPassword(password: string): boolean {
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) return true;
  // Exige pelo menos uma letra e um número — barra "aaaaaaaa"/"12345678"
  // (já coberto acima, mas também variações fora da lista fixa).
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return true;
  return false;
}

// Coerces a value that's supposed to represent a list of strings (guides'
// languages/specialty, stored as a TEXT column holding either a JSON array
// string or, if a row was ever written a different way, a raw Postgres
// array literal like "{Português,Inglês}") into an actual array — so the
// frontend's .map()/.join() never crashes no matter which shape the value
// is in. Never throws: worst case for an unparseable non-empty string is a
// single-item array instead of a real list.
function toStringArray(val: any): string[] {
  if (Array.isArray(val)) return val;
  if (val == null || val === "") return [];
  if (typeof val === "string") {
    const trimmed = val.trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // not JSON — fall through to the Postgres array literal check below
    }
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed
        .slice(1, -1)
        .split(",")
        .map(s => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    }
    return [trimmed];
  }
  return [];
}

// guides.languages used to be a flat string[] ("Português", "Inglês") before
// each language got a proficiency level — this reads either shape so
// existing rows don't break: a plain string becomes { language, level:
// "intermediario" } (a reasonable assumed default), while already-migrated
// { language, level } objects pass through untouched.
function toLanguageArray(val: any): { language: string; level: "basico" | "intermediario" | "avancado" }[] {
  const raw = toStringArrayOrObjects(val);
  return raw.map((item: any) => {
    if (item && typeof item === "object" && typeof item.language === "string") {
      const level = item.level === "basico" || item.level === "avancado" ? item.level : "intermediario";
      return { language: item.language, level };
    }
    return { language: String(item), level: "intermediario" as const };
  }).filter(l => l.language.trim());
}

// Same JSON/Postgres-array-literal tolerance as toStringArray, but doesn't
// force elements to strings — toLanguageArray above needs the raw parsed
// objects to tell an old plain-string entry apart from a migrated one.
function toStringArrayOrObjects(val: any): any[] {
  if (Array.isArray(val)) return val;
  if (val == null || val === "") return [];
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val.trim());
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // not JSON — treat the whole string as a single legacy language entry
    }
    return [val.trim()];
  }
  return [];
}

// Splits a free-text "Português, Inglês, Espanhol" field (as typed into the
// public /seja-parceiro form) into a trimmed array — used only when
// approving a candidatura into a real guides.languages/specialty value,
// since the candidatura itself stores these as plain comma-separated text.
function splitCommaList(val: string | undefined): string[] {
  if (!val) return [];
  return val.split(",").map(s => s.trim()).filter(Boolean);
}

// Whitelists which fields a client-supplied body may set on an insert/update.
// Without this, `.update(req.body)` / `.insert({ ...req.body })` pass every
// key the caller sent straight to Supabase, so a form field never meant to be
// editable (or one the client shouldn't control at all) still gets written if
// it's present in the payload — the routes below only ever set columns that
// are actually meant to be admin/user editable for that entity.
function pickFields<T extends object>(body: any, allowedKeys: readonly (keyof T)[]): Partial<T> {
  const result: Partial<T> = {};
  if (!body || typeof body !== "object") return result;
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      result[key] = body[key];
    }
  }
  return result;
}

// Per-entity field allowlists used with pickFields() above. "rating" and
// "viewCount" are deliberately excluded from POUSADA_* — they're computed by
// the system (average of reviews / view counter), never set directly by a
// client payload.
const POUSADA_CREATE_FIELDS = ["name", "description", "longDescription", "location", "pricePerNight", "images", "features", "activities", "experiences", "capacity", "videoUrl", "officialSiteUrl", "teamPhotoUrl", "teamSectionTitle", "teamSectionText", "officialSiteImages", "rooms"] as const;
// googleCalendarId fica de fora de POUSADA_CREATE_FIELDS de propósito — é
// um detalhe de organização interna da agência (qual calendário Google essa
// pousada usa), não algo que o parceiro deveria poder mexer autoeditando o
// próprio cadastro. Normalmente preenchido via POST
// /api/pousadas/:id/google-calendar (cria um calendário novo), mas também
// editável aqui à mão se o admin preferir apontar pra um que já existe.
const POUSADA_UPDATE_FIELDS = [...POUSADA_CREATE_FIELDS, "verified", "googleCalendarId"] as const;
const GUIDE_FIELDS = ["name", "email", "phone", "languages", "specialty", "status", "bio", "age", "birthplace", "interests", "photoUrl", "images", "unavailableDates"] as const;
const SPECIES_FIELDS = ["name", "scientificName", "category", "description", "details", "sightings", "image", "bestPousadaId", "bestPousadaName"] as const;
const TURISTA_FIELDS = ["name", "email", "whatsapp", "country", "language", "age", "preferences"] as const;
const ROTEIRO_FIELDS = ["name", "duration", "price", "difficulty", "capacity", "description"] as const;
const RESERVA_FIELDS = ["turistaId", "roteiroId", "date", "status", "totalPrice"] as const;
const PAGAMENTO_FIELDS = ["reservaId", "amount", "date", "method", "status"] as const;
const GUIA_TURISTICO_FIELDS = ["name", "specialty", "phone", "availability", "rating"] as const;

// Normalizes a raw pousadas row from Supabase into the shape the frontend
// expects — parses the jsonb-ish fields, resolves multi-language text, and
// fills in safe types. No fake-lodge fallback text here on purpose: earlier
// versions defaulted a missing name/description to "Araras Eco Lodge" (the
// old demo data's name), which is exactly the kind of fake content that
// kept leaking into the real site. A pousada with a blank field now just
// shows blank, not a placeholder impersonating a real business.
function mapPousadaRow(p: any): Pousada {
  const rawExperiences = parseJSONSafe(p.experiences) || [];
  const experiences = Array.isArray(rawExperiences)
    ? rawExperiences.map((exp: any) => ({
        title: resolveTranslation(exp.title),
        description: resolveTranslation(exp.description),
        price: typeof exp.price === "number" ? exp.price : parseFloat(exp.price || "0")
      }))
    : [];

  return {
    id: p.id,
    name: resolveTranslation(p.name),
    description: resolveTranslation(p.description),
    longDescription: resolveTranslation(p.longDescription),
    location: resolveTranslation(p.location),
    // 0 (not 5) when there's no rating yet — a genuine average of real
    // reviews can never be 0 (ratings are 1-5), so it's a safe "sem
    // avaliações ainda" sentinel the frontend checks for instead of
    // displaying a fake perfect score before anyone has actually reviewed.
    rating: typeof p.rating === "number" ? p.rating : (p.rating ? parseFloat(p.rating) : 0),
    pricePerNight: typeof p.pricePerNight === "number" ? p.pricePerNight : (p.pricePerNight ? parseFloat(p.pricePerNight) : 0),
    images: parseJSONSafe(p.images) || [],
    features: parseJSONSafe(p.features) || [],
    activities: parseJSONSafe(p.activities) || [],
    experiences,
    capacity: typeof p.capacity === "number" ? p.capacity : (p.capacity ? parseInt(p.capacity) : 1),
    videoUrl: p.videoUrl || "",
    verified: typeof p.verified === "boolean" ? p.verified : true,
    viewCount: typeof p.viewCount === "number" ? p.viewCount : (p.viewCount ? parseInt(p.viewCount) : 0),
    officialSiteUrl: p.officialSiteUrl || "",
    teamPhotoUrl: p.teamPhotoUrl || "",
    teamSectionTitle: p.teamSectionTitle || "",
    teamSectionText: p.teamSectionText || "",
    officialSiteImages: parseJSONSafe(p.officialSiteImages) || [],
    rooms: parseJSONSafe(p.rooms) || [],
    googleCalendarId: p.googleCalendarId || undefined,
  };
}

// ----------------------------------------------------
// REST API ROUTES
// ----------------------------------------------------

// POUSADAS CRUD
//
// Sem ?page=: devolve o array completo, como sempre — usado pelo fluxo
// central de dados do App.tsx (deep-link /pousadas/:id, "onde avistar esta
// espécie", MobileSimulator), que precisa da lista inteira pra funcionar.
// Com ?page=: devolve uma página filtrada/ordenada NO SERVIDOR
// ({items, total, page, pageSize}) — usada pela grade de busca do catálogo
// (PousadaCatalog.tsx), que antes carregava o catálogo inteiro pro navegador
// e filtrava em JS ali, algo que deixa de escalar conforme o catálogo cresce
// (é exatamente o oposto de como Booking/Airbnb fazem busca).
//
// Busca/filtro cobrem name, location e faixa de preço — ficaram de fora
// comodidades/atividades (features/activities), porque essas colunas
// passaram por uma migração pra jsonb (scripts/upgrade-schema.sql) cujo
// estado real em produção não dá pra confirmar só lendo o código; um filtro
// .ilike() nelas quebraria a rota inteira com 500 se o tipo não for texto.
// Mesmo raciocínio pra não excluir pousada sem nenhuma imagem do "perfil
// completo" aqui — os outros campos (descrição/localização/preço/
// capacidade) já cobrem o caso real que isCompletePousadaProfile existe pra
// evitar (cadastro vazio recém-criado).
app.get("/api/pousadas", async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=300");

  if (!req.query.page) {
    const { data, error } = await supabase.from("pousadas").select("*");
    if (error) return res.status(500).json({ error: "Erro ao buscar pousadas" });
    return res.json((data || []).map(mapPousadaRow));
  }

  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const pageSize = Math.min(48, Math.max(1, parseInt(String(req.query.pageSize), 10) || 12));
  const location = typeof req.query.location === "string" ? req.query.location : "all";
  const search = typeof req.query.search === "string" ? sanitizeIlikeTerm(req.query.search) : "";
  const priceMin = req.query.priceMin ? Number(req.query.priceMin) : undefined;
  const priceMax = req.query.priceMax ? Number(req.query.priceMax) : undefined;
  const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy : "relevance";

  let query = supabase
    .from("pousadas")
    .select("*", { count: "exact" })
    .not("description", "is", null).neq("description", "")
    .not("location", "is", null).neq("location", "")
    .gt("pricePerNight", 0)
    .gt("capacity", 0);

  if (location !== "all") {
    query = query.ilike("location", `%${sanitizeIlikeTerm(location)}%`);
  }
  if (search) {
    query = query.or(`name.ilike.%${search}%,location.ilike.%${search}%`);
  }
  if (typeof priceMin === "number" && !Number.isNaN(priceMin)) query = query.gte("pricePerNight", priceMin);
  if (typeof priceMax === "number" && !Number.isNaN(priceMax)) query = query.lte("pricePerNight", priceMax);

  if (sortBy === "price-asc") query = query.order("pricePerNight", { ascending: true });
  else if (sortBy === "price-desc") query = query.order("pricePerNight", { ascending: false });
  else if (sortBy === "rating-desc") query = query.order("rating", { ascending: false });
  // Tiebreaker sempre presente — sem uma ordem determinística, .range() em
  // páginas sucessivas pode repetir ou pular linhas se o Postgres escolher
  // uma ordem física diferente entre uma requisição e outra.
  query = query.order("id", { ascending: true });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) return res.status(500).json({ error: "Erro ao buscar pousadas" });

  res.json({
    items: (data || []).map(mapPousadaRow),
    total: count || 0,
    page,
    pageSize,
  });
});

app.get("/api/pousadas/:id", async (req, res) => {
  const { data, error } = await supabase.from("pousadas").select("*").eq("id", req.params.id).maybeSingle();
  if (error || !data) return res.status(404).json({ error: "Pousada não encontrada" });
  res.json(mapPousadaRow(data));
});

app.post("/api/pousadas/:id/view", viewLimiter, async (req, res) => {
  const { id } = req.params;
  const { data: current, error: fetchErr } = await supabase.from("pousadas").select("viewCount").eq("id", id).maybeSingle();
  if (fetchErr || !current) return res.status(404).json({ error: "Pousada não encontrada" });

  const viewCount = (current.viewCount || 0) + 1;
  const { error } = await supabase.from("pousadas").update({ viewCount }).eq("id", id);
  if (error) {
    log.warn("Erro ao atualizar contador de visualizações no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao atualizar visualizações" });
  }
  res.json({ viewCount });
});

// Image uploads go to the "site-media" Supabase Storage bucket (public,
// created via scripts/create-storage-bucket.mjs) instead of the git repo —
// before this, replacing a photo meant a developer editing files and
// pushing a deploy, which doesn't scale past one person maintaining the
// site. memoryStorage() keeps the file in RAM only long enough to forward
// it to Supabase; nothing touches disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpeg|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Formato de imagem não suportado (use PNG, JPEG, WebP ou GIF)"));
  },
});

// multer's fileFilter above only checks the Content-Type header the browser
// sent — that's just a client-supplied string, not a guarantee about the
// actual bytes. Sniffing the file's magic-number signature confirms it's
// really one of the four supported image formats before it's stored and
// served back to the public with a supposedly-matching Content-Type; the
// extension and Content-Type used below come from this detection, never
// from the client-controlled filename/mimetype.
function detectImageType(buffer: Buffer): { ext: string; contentType: string } | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ext: "png", contentType: "image/png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: "jpg", contentType: "image/jpeg" };
  }
  if (buffer.length >= 6 && buffer.toString("ascii", 0, 3) === "GIF" && ["87a", "89a"].includes(buffer.toString("ascii", 3, 6))) {
    return { ext: "gif", contentType: "image/gif" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { ext: "webp", contentType: "image/webp" };
  }
  return null;
}

// Content moderation via Gemini (already integrated for the chat assistant,
// so this reuses it instead of adding a paid vision/moderation API). Both
// helpers "fail open" — if Gemini isn't configured or the moderation call
// itself errors, the upload/review is allowed through rather than blocked,
// since a third-party API hiccup shouldn't take down core site
// functionality. This is a best-effort safety net, not a hard guarantee.
async function moderateImage(buffer: Buffer, mimeType: string): Promise<{ ok: boolean; reason?: string }> {
  if (!ai) return { ok: true };
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data: buffer.toString("base64") } },
          { text: "Esta imagem será publicada em um site público de turismo (perfis de pousadas, guias e atrações). Ela contém nudez, conteúdo sexual explícito, ou violência gráfica? Responda com uma única palavra: SIM ou NAO." },
        ],
      }],
      config: { temperature: 0 },
    });
    const answer = (response.text || "").trim().toUpperCase();
    if (answer.startsWith("SIM")) {
      return { ok: false, reason: "Esta imagem parece conter conteúdo impróprio (nudez ou conteúdo explícito) e não pode ser publicada no site." };
    }
    return { ok: true };
  } catch (err) {
    log.warn("Erro na moderação de imagem via Gemini:", err);
    return { ok: true };
  }
}

async function moderateText(text: string): Promise<{ ok: boolean; reason?: string }> {
  if (!ai || !text.trim()) return { ok: true };
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{
          text: `Analise o texto abaixo, enviado por um visitante como comentário público em uma avaliação num site de turismo. Ele contém xingamentos, discurso de ódio, assédio, conteúdo sexual explícito, spam ou qualquer outra coisa imprópria para exibição pública? Responda com uma única palavra: SIM ou NAO.\n\nTexto: "${text.replace(/"/g, "'").slice(0, 2000)}"`,
        }],
      }],
      config: { temperature: 0 },
    });
    const answer = (response.text || "").trim().toUpperCase();
    if (answer.startsWith("SIM")) {
      return { ok: false, reason: "Seu comentário parece conter conteúdo impróprio e não pôde ser publicado. Revise o texto e tente novamente." };
    }
    return { ok: true };
  } catch (err) {
    log.warn("Erro na moderação de texto via Gemini:", err);
    return { ok: true };
  }
}

app.post("/api/upload-image", requireAnyUploader, (req, res) => {
  upload.single("file")(req, res, async (err: any) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });

    const detected = detectImageType(req.file.buffer);
    if (!detected) {
      return res.status(400).json({ error: "O conteúdo do arquivo não corresponde a uma imagem PNG, JPEG, WebP ou GIF válida." });
    }

    const moderation = await moderateImage(req.file.buffer, detected.contentType);
    if (!moderation.ok) {
      return res.status(400).json({ error: moderation.reason });
    }

    const objectPath = `uploads/${randomUUID()}.${detected.ext}`;

    const { error } = await supabase.storage
      .from("site-media")
      .upload(objectPath, req.file.buffer, { contentType: detected.contentType, upsert: false });

    if (error) {
      log.error("Erro ao subir imagem para o Supabase Storage:", error.message);
      return res.status(500).json({ error: "Falha ao enviar imagem" });
    }

    const { data } = supabase.storage.from("site-media").getPublicUrl(objectPath);
    res.status(201).json({ url: data.publicUrl });
  });
});

// images/features/activities/experiences are jsonb columns — pass the
// native arrays straight through, supabase-js serializes them correctly as
// nested JSON. Stringifying them here would double-encode into a jsonb
// string scalar instead of a jsonb array.
app.post("/api/pousadas", requireAdmin, async (req, res) => {
  const newPousada: Pousada = {
    ...pickFields<Pousada>(req.body, POUSADA_CREATE_FIELDS),
    id: `p_${randomUUID()}`,
    verified: false,
    viewCount: 0,
  } as Pousada;
  const { error } = await supabase.from("pousadas").insert(newPousada);
  if (error) {
    log.error("Erro ao salvar pousada no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar pousada" });
  }
  await logAdminAction(res.locals.adminUser, "create", "pousada", newPousada.id, newPousada.name);
  res.status(201).json(newPousada);
});

// Admin OR the pousada's own linked partner account can edit it — "verified"
// stays admin-only (POUSADA_CREATE_FIELDS excludes it; only the admin branch
// upgrades to POUSADA_UPDATE_FIELDS), since that's a trust badge the partner
// shouldn't be able to self-certify.
app.put("/api/pousadas/:id", requirePartnerAccess("pousada"), async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Pousada>(req.body, res.locals.isAdmin ? POUSADA_UPDATE_FIELDS : POUSADA_CREATE_FIELDS);
  const { data, error } = await supabase.from("pousadas").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Pousada não encontrada" });
  await logAdminAction(res.locals.actorUser, "update", "pousada", id, data.name);
  res.json(mapPousadaRow(data));
});

app.delete("/api/pousadas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  let existing: any;
  try {
    existing = await moverParaLixeira("pousada", id, res.locals.adminUser?.email || "admin");
  } catch (err: any) {
    log.error("Erro ao mover pousada para a lixeira:", err.message);
    return res.status(500).json({ error: "Erro ao excluir pousada" });
  }
  if (!existing) return res.status(404).json({ error: "Pousada não encontrada" });
  const { error } = await supabase.from("pousadas").delete().eq("id", id);
  if (error) {
    log.error("Erro ao excluir pousada no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao excluir pousada" });
  }
  await logAdminAction(res.locals.adminUser, "delete", "pousada", id, existing?.name || id);
  res.json({ success: true, message: "Pousada movida para a lixeira. Pode ser restaurada em até 30 dias." });
});

// GUIDES CRUD
// Admin-only: guide records include personal email/phone, and nothing on
// the public site actually displays this list (it's only consumed by the
// admin dashboard) — it was public by mistake before, meaning anyone could
// read every guide's contact info straight from the network tab.
// languages/specialty are stored as TEXT columns holding a JSON-serialized
// array (see /api/supabase/sql below), not native jsonb — supabase-js
// returns TEXT columns as plain strings regardless of content, so without
// parsing them back here the frontend receives a raw string where it
// expects an array and crashes calling .map()/.join() on it.
function mapGuideRow(g: any): Guide {
  return {
    ...g,
    languages: toLanguageArray(g.languages),
    specialty: toStringArray(g.specialty),
    interests: toStringArray(g.interests),
    images: toStringArray(g.images),
    unavailableDates: toStringArray(g.unavailableDates),
    rating: typeof g.rating === "number" ? g.rating : (g.rating ? parseFloat(g.rating) : 0),
  };
}

// Strips email/phone (PII) — used for anything a visitor can reach, since
// guides now have a real public profile page as part of the "one ecosystem
// of service providers" the site is meant to be. The full record (with
// contact info) stays admin-only via the route below.
function toPublicGuide(g: Guide): Omit<Guide, "email" | "phone"> {
  const { email, phone, ...publicFields } = g;
  return publicFields;
}

app.get("/api/guides", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("guides").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar guias" });
  res.json((data || []).map(mapGuideRow));
});

// Public guide directory + individual profile — PII-free. Registered before
// the admin-only routes above only for readability; Express doesn't need
// the ordering since none of these paths overlap (GET /api/guides vs.
// GET /api/guides/public[/:id]).
app.get("/api/guides/public", async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
  const { data, error } = await supabase.from("guides").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar guias" });
  res.json((data || []).map(mapGuideRow).map(toPublicGuide));
});

app.get("/api/guides/public/:id", async (req, res) => {
  const { data, error } = await supabase.from("guides").select("*").eq("id", req.params.id).maybeSingle();
  if (error || !data) return res.status(404).json({ error: "Guia não encontrado" });
  res.json(toPublicGuide(mapGuideRow(data)));
});

// languages/specialty are jsonb columns — passed straight through, no
// JSON.stringify (see the pousadas insert route further down for why).
app.post("/api/guides", requireAdmin, async (req, res) => {
  const newGuide: Guide = {
    ...pickFields<Guide>(req.body, GUIDE_FIELDS),
    id: `g_${randomUUID()}`,
  } as Guide;
  const { error } = await supabase.from("guides").insert(newGuide);
  if (error) {
    log.error("Erro ao salvar guia no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar guia" });
  }
  await logAdminAction(res.locals.adminUser, "create", "guide", newGuide.id, newGuide.name);
  res.status(201).json(newGuide);
});

app.put("/api/guides/:id", requirePartnerAccess("guia"), async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Guide>(req.body, GUIDE_FIELDS);
  const { data, error } = await supabase.from("guides").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Guia não encontrado" });
  await logAdminAction(res.locals.actorUser, "update", "guide", id, data.name);
  res.json(mapGuideRow(data));
});

app.delete("/api/guides/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  let existing: any;
  try {
    existing = await moverParaLixeira("guide", id, res.locals.adminUser?.email || "admin");
  } catch (err: any) {
    log.error("Erro ao mover guia para a lixeira:", err.message);
    return res.status(500).json({ error: "Erro ao excluir guia" });
  }
  if (!existing) return res.status(404).json({ error: "Guia não encontrado" });
  const { error } = await supabase.from("guides").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir guia" });
  await logAdminAction(res.locals.adminUser, "delete", "guide", id, existing?.name || id);
  res.json({ success: true, message: "Guia movido para a lixeira. Pode ser restaurado em até 30 dias." });
});

// ATRAÇÕES CRUD — parceiro que não é uma hospedagem: "Parada Legal" (passeio,
// artesanato, lembrança) ou "Restaurante". Separado de pousadas porque nem
// todo parceiro tem quartos pra reservar (ver Pousada vs. Atração no /seja-parceiro).
function mapAtracaoRow(a: any): Atracao {
  return {
    id: a.id,
    type: a.type,
    name: resolveTranslation(a.name),
    description: resolveTranslation(a.description),
    location: resolveTranslation(a.location),
    images: parseJSONSafe(a.images) || [],
    menu: parseJSONSafe(a.menu) || undefined,
    availability: a.availability || undefined,
    rating: typeof a.rating === "number" ? a.rating : (a.rating ? parseFloat(a.rating) : 0),
    verified: typeof a.verified === "boolean" ? a.verified : false,
    dateCreated: a.dateCreated || ""
  };
}

const ATRACAO_FIELDS = ["type", "name", "description", "location", "images", "menu", "availability"] as const;

app.get("/api/atracoes", async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
  const { data, error } = await supabase.from("atracoes").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar atrações" });
  res.json((data || []).map(mapAtracaoRow));
});

app.get("/api/atracoes/:id", async (req, res) => {
  const { data, error } = await supabase.from("atracoes").select("*").eq("id", req.params.id).maybeSingle();
  if (error || !data) return res.status(404).json({ error: "Atração não encontrada" });
  res.json(mapAtracaoRow(data));
});

app.post("/api/atracoes", requireAdmin, async (req, res) => {
  const newAtracao: Atracao = {
    ...pickFields<Atracao>(req.body, ATRACAO_FIELDS),
    id: `at_${randomUUID()}`,
    rating: 0,
    verified: false,
    dateCreated: new Date().toISOString(),
  } as Atracao;
  const { error } = await supabase.from("atracoes").insert(newAtracao);
  if (error) {
    log.error("Erro ao salvar atração no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar atração" });
  }
  await logAdminAction(res.locals.adminUser, "create", "atracao", newAtracao.id, newAtracao.name);
  res.status(201).json(newAtracao);
});

// Admin OR the atração's own linked partner account — "verified" is
// admin-only, same reasoning as pousadas above.
app.put("/api/atracoes/:id", requirePartnerAccess("atracao"), async (req, res) => {
  const { id } = req.params;
  const fields = res.locals.isAdmin ? [...ATRACAO_FIELDS, "verified"] as const : ATRACAO_FIELDS;
  const updates = pickFields<Atracao>(req.body, fields);
  const { data, error } = await supabase.from("atracoes").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Atração não encontrada" });
  await logAdminAction(res.locals.actorUser, "update", "atracao", id, data.name);
  res.json(mapAtracaoRow(data));
});

app.delete("/api/atracoes/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  let existing: any;
  try {
    existing = await moverParaLixeira("atracao", id, res.locals.adminUser?.email || "admin");
  } catch (err: any) {
    log.error("Erro ao mover atração para a lixeira:", err.message);
    return res.status(500).json({ error: "Erro ao excluir atração" });
  }
  if (!existing) return res.status(404).json({ error: "Atração não encontrada" });
  const { error } = await supabase.from("atracoes").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir atração" });
  await logAdminAction(res.locals.adminUser, "delete", "atracao", id, existing?.name || id);
  res.json({ success: true, message: "Atração movida para a lixeira. Pode ser restaurada em até 30 dias." });
});

// BOOKINGS CRUD & FLOWS
app.get("/api/bookings", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("bookings").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar reservas" });
  res.json(data);
});

// Disponibilidade consolidada de pousadas + guias + atrações num período —
// antes disso, saber "o que está livre" exigia cruzar reservas, guias e
// atrações manualmente em telas separadas. Reaproveita a mesma lógica de
// checagem por tipo de quarto usada em POST /api/bookings, só que em modo
// leitura/agregado em vez de "posso criar esta reserva?". Desenhada pra
// também alimentar a IA quando ela passar a montar roteiro personalizado —
// mesma resposta, só que consumida por código em vez de olhos humanos.
app.get("/api/gestao/agenda", requireAdmin, async (req, res) => {
  const startDate = String(req.query.startDate || "");
  const endDate = String(req.query.endDate || startDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return res.status(400).json({ error: "Informe startDate (e opcionalmente endDate) no formato YYYY-MM-DD." });
  }

  const [pousadasRes, guidesRes, atracoesRes, bookingsRes] = await Promise.all([
    supabase.from("pousadas").select("*"),
    supabase.from("guides").select("*"),
    supabase.from("atracoes").select("*"),
    supabase.from("bookings").select("pousadaId,roomType,checkIn,checkOut,adults,children,status").neq("status", "cancelado"),
  ]);

  const pousadaRows = (pousadasRes.data || []).map(mapPousadaRow);
  const guideRows = (guidesRes.data || []).map(mapGuideRow);
  const atracaoRows = (atracoesRes.data || []).map(mapAtracaoRow);
  const overlappingBookings = (bookingsRes.data || []).filter((b: any) => b.checkIn <= endDate && b.checkOut >= startDate);

  const pousadas = pousadaRows.map(p => {
    const theseBookings = overlappingBookings.filter((b: any) => b.pousadaId === p.id);
    if (p.rooms && p.rooms.length > 0) {
      const rooms = p.rooms.map(r => {
        const bookedUnits = theseBookings.filter((b: any) => b.roomType === r.type).length;
        return { type: r.type, capacity: r.capacity, quantity: r.quantity, availableUnits: Math.max(0, r.quantity - bookedUnits) };
      });
      return { id: p.id, name: p.name, location: p.location, rooms, hasAvailability: rooms.some(r => r.availableUnits > 0) };
    }
    const guestsBooked = theseBookings.reduce((sum: number, b: any) => sum + (b.adults || 0) + (b.children || 0), 0);
    return { id: p.id, name: p.name, location: p.location, capacity: p.capacity, guestsBooked, hasAvailability: guestsBooked < p.capacity };
  });

  const guides = guideRows.map(g => {
    const blockedDatesInRange = (g.unavailableDates || []).filter(d => d >= startDate && d <= endDate);
    return {
      id: g.id, name: g.name, specialty: g.specialty, languages: g.languages, status: g.status,
      blockedDatesInRange,
      hasAvailability: g.status === "disponivel" && blockedDatesInRange.length === 0,
    };
  });

  const atracoes = atracaoRows.map(a => ({
    id: a.id, name: a.name, type: a.type, location: a.location, availability: a.availability || "",
  }));

  res.json({ startDate, endDate, pousadas, guides, atracoes });
});

// Public, PII-free summary for the mobile app check-in demo: only pousada
// name, dates and status — never customer name/email/phone.
app.get("/api/bookings/public-confirmed", async (req, res) => {
  const { data, error } = await supabase
    .from("bookings")
    .select("id,pousadaName,checkIn,checkOut,status")
    .eq("status", "confirmado_total");
  if (error) return res.status(500).json({ error: "Erro ao buscar reservas" });
  res.json(data);
});

// Simulate creating booking (e.g. from WhatsApp Bot or Landing Page Wizard)
// NOTA (concorrência): esta rota ainda faz "checar disponibilidade" e
// "gravar" como dois passos separados — duas chamadas simultâneas pra
// mesma pousada/quarto/data poderiam, em teoria, passar as duas na checagem
// antes de qualquer uma gravar. Deixei de propósito sem um lock de
// transação no Postgres agora: hoje esta rota é requireAdmin (só a equipe,
// sem UI de auto-atendimento chamando em paralelo) e eu não tenho acesso ao
// banco de produção real pra validar uma função SQL com
// pg_advisory_xact_lock antes de publicar — prefiro isso a arriscar quebrar
// toda criação de reserva com uma função não testada. Se esse endpoint um
// dia virar self-service (ver conversa sobre escala), esse é o primeiro
// lugar a reforçar antes de abrir pro público.
app.post("/api/bookings", requireAdmin, async (req, res) => {
  const { pousadaId, checkIn, checkOut, adults, children, roomType } = req.body;
  const { data: pousadaRow, error: pErr } = await supabase.from("pousadas").select("*").eq("id", pousadaId).maybeSingle();
  if (pErr || !pousadaRow) {
    return res.status(404).json({ error: "Pousada não encontrada" });
  }
  const targetPousada = mapPousadaRow(pousadaRow);
  const newGuests = (adults || 1) + (children || 0);

  // Double Check Availability (Mock Calendar check) — count current
  // bookings in that date range for this pousada
  const { data: candidateBookings } = await supabase
    .from("bookings")
    .select("*")
    .eq("pousadaId", pousadaId)
    .neq("status", "cancelado");
  const overlappingBookings = (candidateBookings || []).filter(b =>
    // Overlap condition: (StartA <= EndB) and (EndA >= StartB)
    b.checkIn <= checkOut && b.checkOut >= checkIn
  );

  if (roomType) {
    // Disponibilidade POR UNIDADE de um tipo de quarto específico — sem
    // isso, duas reservas que juntas cabem na capacidade agregada da
    // pousada podiam pedir o MESMO quarto físico ao mesmo tempo (rooms[]
    // existia no cadastro mas nunca era consultado aqui).
    const room = (targetPousada.rooms || []).find(r => r.type === roomType);
    if (!room) {
      return res.status(400).json({ error: `Tipo de quarto "${roomType}" não encontrado nesta pousada.` });
    }
    if (newGuests > room.capacity) {
      return res.status(400).json({ error: `O quarto "${roomType}" acomoda no máximo ${room.capacity} hóspedes.`, available: false });
    }
    const overlappingSameRoom = overlappingBookings.filter(b => b.roomType === roomType).length;
    if (overlappingSameRoom >= room.quantity) {
      const altCheckIn = new Date(new Date(checkIn).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const altCheckOut = new Date(new Date(checkOut).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      return res.status(400).json({
        error: `Sem unidades disponíveis do quarto "${roomType}" para estas datas (${room.quantity} no total).`,
        available: false,
        suggestions: [{ checkIn: altCheckIn, checkOut: altCheckOut, note: "Uma semana mais tarde" }],
      });
    }
  } else {
    // Sem tipo de quarto informado — cai no comportamento anterior
    // (capacidade agregada da pousada), mantido pra pousadas sem "rooms"
    // cadastrado ou fluxos que ainda não passam essa informação.
    const totalGuestsAlready = overlappingBookings.reduce((acc, curr) => acc + curr.adults + curr.children, 0);
    if (totalGuestsAlready + newGuests > targetPousada.capacity) {
      const altCheckIn = new Date(new Date(checkIn).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const altCheckOut = new Date(new Date(checkOut).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      return res.status(400).json({
        error: "Indisponível para estas datas por atingir capacidade máxima.",
        available: false,
        suggestions: [
          { checkIn: altCheckIn, checkOut: altCheckOut, note: "Uma semana mais tarde" }
        ]
      });
    }
  }

  // Create booking
  const days = Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)));
  let experiencePrice = 0;
  if (req.body.experienceType) {
    const exp = targetPousada.experiences.find(e => e.title === req.body.experienceType);
    if (exp) {
      experiencePrice = exp.price * (adults || 1);
    }
  }
  const totalPrice = (targetPousada.pricePerNight * days) + experiencePrice;

  const newBooking: Booking = {
    id: `b_${randomUUID()}`,
    pousadaId,
    pousadaName: targetPousada.name,
    customerName: req.body.customerName || "Cliente WhatsApp",
    customerEmail: req.body.customerEmail || "cliente@reserva.com",
    customerPhone: req.body.customerPhone || "+55 11 99999-9999",
    nationality: req.body.nationality || "Brasileira",
    adults: adults || 1,
    children: children || 0,
    childAges: req.body.childAges || "",
    dietaryRestrictions: req.body.dietaryRestrictions || "Nenhuma",
    specialNeeds: req.body.specialNeeds || "Nenhuma",
    checkIn,
    checkOut,
    experienceType: req.body.experienceType || "Padrão",
    totalPrice,
    status: req.body.status || "pendente_pagamento",
    dateCreated: new Date().toISOString(),
    roomType: roomType || undefined,
  };

  const { error } = await supabase.from("bookings").insert(newBooking);
  if (error) {
    log.error("Erro ao salvar reserva no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao criar reserva" });
  }

  addNotification("admin", `Nova reserva criada: ${newBooking.customerName} na ${newBooking.pousadaName}.`, "booking_new", newBooking.id);
  await logAdminAction(res.locals.adminUser, "create", "booking", newBooking.id, `${newBooking.customerName} — ${newBooking.pousadaName}`);

  res.status(201).json({ available: true, booking: newBooking });
});

// ----------------------------------------------------
// GOOGLE CALENDAR OAUTH & API INTEGRATION HELPERS
// ----------------------------------------------------

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Google Calendar OAuth tokens live in the "app_secrets" Supabase table (see
// scripts/add-app-secrets-table.sql) instead of a local JSON file. A local
// file doesn't survive Vercel's serverless filesystem (ephemeral and
// read-only in production, so this integration silently never worked there),
// and plaintext OAuth credentials belong in the same access-controlled store
// as everything else, not on disk. Same shared/serverless-safe reasoning as
// the rate_limits table above — one row per key, read/written by every
// instance through the service_role-backed `supabase` client.
const GOOGLE_TOKENS_KEY = "google_calendar_tokens";

async function loadStoredTokens(): Promise<any | null> {
  const { data, error } = await supabase.from("app_secrets").select("value").eq("key", GOOGLE_TOKENS_KEY).maybeSingle();
  if (error || !data) return null;
  return data.value;
}

async function saveTokens(tokens: any): Promise<void> {
  const { error } = await supabase
    .from("app_secrets")
    .upsert({ key: GOOGLE_TOKENS_KEY, value: tokens, updated_at: new Date().toISOString() });
  if (error) log.error("Erro ao salvar tokens do Google Calendar no Supabase:", error.message);
  else log.info("Tokens do Google Calendar salvos com sucesso.");
}

async function deleteTokens(): Promise<void> {
  const { error } = await supabase.from("app_secrets").delete().eq("key", GOOGLE_TOKENS_KEY);
  if (error) log.error("Erro ao excluir tokens do Google Calendar no Supabase:", error.message);
  else log.info("Tokens do Google Calendar excluídos.");
}

// OAuth "state" anti-CSRF pattern: /api/auth/google/callback is a plain,
// unauthenticated GET (Google redirects the browser there directly, so it
// can never carry our Bearer token) — without validating state, anyone
// could craft their own Google consent URL using our public client_id and
// registered redirect_uri, approve it with an attacker-controlled Google
// account, and have OUR server store THEIR tokens as the site's calendar
// integration. Storing the pending value in app_secrets (not memory) since
// this runs on serverless — a value minted by one invocation must still be
// readable by whichever invocation later handles the callback.
const GOOGLE_OAUTH_STATE_KEY = "google_oauth_pending_state";
const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

async function createOAuthState(): Promise<string> {
  const state = randomUUID();
  await supabase.from("app_secrets").upsert({
    key: GOOGLE_OAUTH_STATE_KEY,
    value: { state, expiresAt: Date.now() + GOOGLE_OAUTH_STATE_TTL_MS },
    updated_at: new Date().toISOString(),
  });
  return state;
}

async function consumeOAuthState(candidate: string | undefined): Promise<boolean> {
  const { data } = await supabase.from("app_secrets").select("value").eq("key", GOOGLE_OAUTH_STATE_KEY).maybeSingle();
  // One-time use — delete regardless of outcome so a leaked/replayed
  // callback URL can't be reused.
  await supabase.from("app_secrets").delete().eq("key", GOOGLE_OAUTH_STATE_KEY);
  const pending = data?.value as { state: string; expiresAt: number } | undefined;
  if (!pending || !candidate) return false;
  if (Date.now() > pending.expiresAt) return false;
  return pending.state === candidate;
}

function getOAuthClient(req: express.Request) {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.get("host");
  const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

async function createCalendarEvent(booking: Booking, req: express.Request) {
  const tokens = await loadStoredTokens();
  if (!tokens) {
    log.info("Sem tokens salvos do Google Calendar. Pulando sincronização.");
    return null;
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    log.info("GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET não configurados.");
    return null;
  }

  // Calendário dedicado desta pousada (dentro da MESMA conta já conectada),
  // se ela tiver um configurado — senão cai no calendário "primary" da
  // conta, comportamento de sempre. Ver POST /api/pousadas/:id/google-calendar.
  const { data: pousadaRow } = await supabase.from("pousadas").select("googleCalendarId").eq("id", booking.pousadaId).maybeSingle();
  const calendarId = pousadaRow?.googleCalendarId || "primary";

  try {
    const oauth2Client = getOAuthClient(req);
    oauth2Client.setCredentials(tokens);

    oauth2Client.on("tokens", (newTokens) => {
      (async () => {
        const currentTokens = (await loadStoredTokens()) || {};
        const merged = { ...currentTokens, ...newTokens };
        await saveTokens(merged);
      })().catch(err => log.error("Erro ao persistir tokens renovados do Google Calendar:", err));
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const summary = `🐆 EcoSafari: Reserva ${booking.customerName} - ${booking.pousadaName}`;
    const description = `EcoSafari Brasil - Reserva Confirmada\n\n` +
      `📍 Pousada: ${booking.pousadaName}\n` +
      `👤 Cliente: ${booking.customerName}\n` +
      `✉️ E-mail: ${booking.customerEmail}\n` +
      `📞 Telefone: ${booking.customerPhone}\n` +
      `👥 Hóspedes: ${booking.adults} Adultos, ${booking.children} Crianças\n` +
      `🧭 Experiência: ${booking.experienceType}\n` +
      `💰 Valor Total: R$ ${booking.totalPrice.toLocaleString('pt-BR')}\n` +
      `🍽️ Restrições Alimentares: ${booking.dietaryRestrictions}\n` +
      `♿ Necessidades Especiais: ${booking.specialNeeds}\n` +
      `👨‍✈️ Guia: ${booking.guideName || 'A definir'}`;

    const response = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary,
        description,
        start: {
          date: booking.checkIn,
          timeZone: "America/Cuiaba"
        },
        end: {
          date: booking.checkOut,
          timeZone: "America/Cuiaba"
        },
        colorId: "5",
        reminders: {
          useDefault: true
        }
      }
    });

    log.info("Evento no Google Calendar criado com sucesso:", response.data.id);
    return response.data.id;
  } catch (err) {
    log.error("Erro ao criar evento no Google Calendar:", err);
    return null;
  }
}

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

// Update Status flow (Gateway Pay, Pousada confirm, Guide confirm)
// Extracted so both the REST endpoint and the Stripe payment-confirmation
// flow can trigger the same "pago" side effects (notifications, calendar sync).
async function applyBookingStatusUpdate(id: string, body: Partial<Booking>, req: express.Request): Promise<Booking | null> {
  const { status, guideId } = body;
  const { data: oldBookingRow, error: fetchErr } = await supabase.from("bookings").select("*").eq("id", id).maybeSingle();
  if (fetchErr || !oldBookingRow) {
    return null;
  }

  const oldBooking = oldBookingRow as Booking;
  // Only status/guideId are ever meant to be settable through this flow — the
  // route exists to advance a booking's confirmation state, not to let a
  // caller overwrite customer/price/date fields on an existing reservation.
  const updated: Booking = { ...oldBooking, ...pickFields<Booking>(body, ["status", "guideId"]) };

  if (status) {
    updated.status = status;

    // Simulate flow events
    if (status === "pago") {
      addNotification("admin", `Pagamento de R$ ${oldBooking.totalPrice} recebido de ${oldBooking.customerName}.`, "payment_received", id);

      // Automatically send notifications to compatible guides and pousada (simulated)
      addNotification("pousada", `Favor confirmar acomodação para ${oldBooking.customerName} no período ${oldBooking.checkIn} a ${oldBooking.checkOut}.`, "status_update", id);

      // Look for guides compatible
      const { data: compatibleGuides } = await supabase.from("guides").select("*").eq("status", "disponivel");
      (compatibleGuides || []).forEach((g: any) => {
        addNotification("guide", `Nova oportunidade de expedição para ${g.name}: ${oldBooking.experienceType} na pousada ${oldBooking.pousadaName}.`, "status_update", id);
      });
    }

    if (status === "confirmado_pousada") {
      addNotification("admin", `A pousada ${oldBooking.pousadaName} confirmou disponibilidade de leito para a reserva #${id}.`, "status_update", id);
      if (oldBooking.guideId) {
        updated.status = "confirmado_total";
        addNotification("admin", `Reserva #${id} TOTALMENTE CONFIRMADA (Pousada + Guia)!`, "status_update", id);
        // Simulate google calendar integration
        updated.googleCalendarEventId = `gc_${Math.random().toString(36).substr(2, 9)}`;
      }
    }

    if (status === "confirmado_guia" && guideId) {
      const { data: selectedGuide } = await supabase.from("guides").select("*").eq("id", guideId).maybeSingle();
      if (selectedGuide) {
        updated.guideId = guideId;
        updated.guideName = selectedGuide.name;
        addNotification("admin", `Guia ${selectedGuide.name} aceitou a expedição para a reserva #${id}.`, "status_update", id);

        if (oldBooking.status === "confirmado_pousada") {
          updated.status = "confirmado_total";
          addNotification("admin", `Reserva #${id} TOTALMENTE CONFIRMADA (Pousada + Guia)!`, "status_update", id);
          // Simulate google calendar integration
          updated.googleCalendarEventId = `gc_${Math.random().toString(36).substr(2, 9)}`;
        } else {
          updated.status = "confirmado_guia";
        }
      }
    }

    if (status === "confirmado_total") {
      updated.googleCalendarEventId = `gc_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  // Real Google Calendar creation if totally confirmed and not yet synced
  if (updated.status === "confirmado_total" && !oldBooking.googleCalendarEventId) {
    try {
      const calEventId = await createCalendarEvent(updated, req);
      if (calEventId) {
        updated.googleCalendarEventId = calEventId;
      } else {
        updated.googleCalendarEventId = `gc_${Math.random().toString(36).substr(2, 9)}`;
      }
    } catch (calErr) {
      log.error("Erro na integração do Google Calendar:", calErr);
      updated.googleCalendarEventId = `gc_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  const { data: savedBooking, error } = await supabase.from("bookings").update(updated).eq("id", id).select().single();
  if (error) log.warn("Erro ao atualizar reserva no Supabase:", error.message);

  // Email confirmation with PDF voucher (only sends if RESEND_API_KEY is configured)
  if (status === "pago" && oldBooking.status !== "pago") {
    sendBookingConfirmationEmail(updated).catch(err => log.warn("Erro ao enviar email de confirmação:", err.message));
  }

  return (savedBooking as Booking) || updated;
}

app.put("/api/bookings/:id/status", requireAdmin, async (req, res) => {
  const updated = await applyBookingStatusUpdate(req.params.id, req.body, req);
  if (!updated) {
    return res.status(404).json({ error: "Reserva não encontrada" });
  }
  await logAdminAction(res.locals.adminUser, "update_status", "booking", updated.id, `${updated.customerName} — ${updated.status}`);
  res.json(updated);
});

// ----------------------------------------------------
// AGENDA SELF-SERVICE DO PARCEIRO (pousada/guia) — confirmar/cancelar a
// própria reserva direto do próprio portal, sem depender do admin fazer
// isso por eles. Cancelar uma reserva já confirmada fora do prazo mínimo de
// 45 dias aciona a política de penalidade abaixo.
// ----------------------------------------------------

const CONFIRMED_BOOKING_STATUSES = ["confirmado_pousada", "confirmado_guia", "confirmado_total"];

// Limites da política de cancelamento — ajustáveis aqui, num lugar só.
// >= 45 dias: cancelamento livre (o prazo mínimo pedido). Entre 20 e 44:
// só perde estrela de confiabilidade (selo interno, não a nota pública).
// Entre 5 e 19: só penalidade em dinheiro. Menos de 5: as duas coisas,
// maiores.
const PENALTY_MIN_NOTICE_DAYS = 45;
const PENALTY_MONEY_TIER_DAYS = 20;
const PENALTY_SEVERE_TIER_DAYS = 5;
const PENALTY_MONEY_PERCENT_TIER = 0.2;
const PENALTY_MONEY_PERCENT_SEVERE = 0.5;
const PENALTY_STARS_TIER = 0.5;
const PENALTY_STARS_SEVERE = 1.5;

function diasAteData(dataISO: string): number {
  const hoje = new Date(new Date().toISOString().slice(0, 10));
  const alvo = new Date(dataISO);
  return Math.round((alvo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function calcularPenalidadeCancelamento(totalPrice: number, diasAntecedencia: number): { valorPenalidade: number; estrelasPerdidas: number; motivo: string } {
  if (diasAntecedencia >= PENALTY_MIN_NOTICE_DAYS) {
    return { valorPenalidade: 0, estrelasPerdidas: 0, motivo: `Cancelado com ${diasAntecedencia} dias de antecedência — dentro do prazo mínimo de ${PENALTY_MIN_NOTICE_DAYS} dias, sem penalidade.` };
  }
  if (diasAntecedencia >= PENALTY_MONEY_TIER_DAYS) {
    return { valorPenalidade: 0, estrelasPerdidas: PENALTY_STARS_TIER, motivo: `Cancelado com ${diasAntecedencia} dias de antecedência (abaixo do mínimo de ${PENALTY_MIN_NOTICE_DAYS}) — perda de estrelas de confiabilidade.` };
  }
  if (diasAntecedencia >= PENALTY_SEVERE_TIER_DAYS) {
    return { valorPenalidade: Math.round(totalPrice * PENALTY_MONEY_PERCENT_TIER * 100) / 100, estrelasPerdidas: 0, motivo: `Cancelado com ${diasAntecedencia} dias de antecedência — penalidade monetária.` };
  }
  return {
    valorPenalidade: Math.round(totalPrice * PENALTY_MONEY_PERCENT_SEVERE * 100) / 100,
    estrelasPerdidas: PENALTY_STARS_SEVERE,
    motivo: `Cancelado com apenas ${Math.max(0, diasAntecedencia)} dia(s) de antecedência — penalidade máxima (dinheiro + estrelas).`,
  };
}

async function registrarPenalidadeCancelamento(prestadorType: "pousada" | "guia", prestadorId: string, booking: Booking) {
  const diasAntecedencia = diasAteData(booking.checkIn);
  const { valorPenalidade, estrelasPerdidas, motivo } = calcularPenalidadeCancelamento(booking.totalPrice, diasAntecedencia);
  if (valorPenalidade === 0 && estrelasPerdidas === 0) return;
  const penalidade = {
    id: `pn_${randomUUID()}`,
    prestadorType,
    prestadorId,
    bookingId: booking.id,
    motivo,
    diasAntecedencia,
    valorPenalidade,
    estrelasPerdidas,
    createdAt: new Date().toISOString(),
  };
  const { error } = await supabase.from("prestador_penalidades").insert(penalidade);
  if (error) log.error("Erro ao registrar penalidade de cancelamento:", error.message);
}

app.get("/api/pousadas/:id/bookings", requirePartnerAccess("pousada"), async (req, res) => {
  const { data, error } = await supabase.from("bookings").select("*").eq("pousadaId", req.params.id).order("checkIn", { ascending: true });
  if (error) return res.status(500).json({ error: "Erro ao buscar reservas." });
  res.json(data);
});

app.put("/api/pousadas/:id/bookings/:bookingId/status", requirePartnerAccess("pousada"), async (req, res) => {
  const { data: booking } = await supabase.from("bookings").select("*").eq("id", req.params.bookingId).maybeSingle();
  if (!booking || booking.pousadaId !== req.params.id) return res.status(404).json({ error: "Reserva não encontrada nesta pousada." });

  const { status } = req.body;
  if (status !== "confirmado_pousada" && status !== "cancelado") {
    return res.status(400).json({ error: "A pousada só pode aprovar o quarto ou cancelar a própria reserva." });
  }
  if (status === "cancelado" && CONFIRMED_BOOKING_STATUSES.includes(booking.status)) {
    await registrarPenalidadeCancelamento("pousada", req.params.id, booking as Booking);
  }

  const updated = await applyBookingStatusUpdate(req.params.bookingId, { status }, req);
  if (!updated) return res.status(404).json({ error: "Reserva não encontrada." });
  await logAdminAction(res.locals.actorUser, "update_status", "booking", updated.id, `${updated.customerName} — ${updated.status} (pousada)`);
  res.json(updated);
});

app.get("/api/guides/:id/bookings", requirePartnerAccess("guia"), async (req, res) => {
  const { data, error } = await supabase.from("bookings").select("*").eq("guideId", req.params.id).order("checkIn", { ascending: true });
  if (error) return res.status(500).json({ error: "Erro ao buscar reservas." });
  res.json(data);
});

app.put("/api/guides/:id/bookings/:bookingId/status", requirePartnerAccess("guia"), async (req, res) => {
  const { data: booking } = await supabase.from("bookings").select("*").eq("id", req.params.bookingId).maybeSingle();
  if (!booking || booking.guideId !== req.params.id) return res.status(404).json({ error: "Reserva não encontrada para este guia." });

  const { status } = req.body;
  if (status !== "confirmado_guia" && status !== "cancelado") {
    return res.status(400).json({ error: "O guia só pode confirmar a própria participação ou cancelar." });
  }

  if (status === "cancelado") {
    if (CONFIRMED_BOOKING_STATUSES.includes(booking.status)) {
      await registrarPenalidadeCancelamento("guia", req.params.id, booking as Booking);
    }
    // Guia cancelar não cancela a reserva inteira (o quarto continua
    // reservado) — só desvincula o guia, pra pousada buscar outro.
    const revertStatus = booking.status === "confirmado_total" || booking.status === "confirmado_pousada" ? "confirmado_pousada" : "pago";
    const { data: updated, error } = await supabase.from("bookings").update({ status: revertStatus, guideId: null, guideName: null }).eq("id", booking.id).select().single();
    if (error) return res.status(500).json({ error: "Erro ao cancelar participação do guia." });
    await logAdminAction(res.locals.actorUser, "update_status", "booking", booking.id, `Guia cancelou participação — reserva volta pra ${revertStatus}`);
    return res.json(updated);
  }

  const updated = await applyBookingStatusUpdate(req.params.bookingId, { status, guideId: req.params.id }, req);
  if (!updated) return res.status(404).json({ error: "Reserva não encontrada." });
  await logAdminAction(res.locals.actorUser, "update_status", "booking", updated.id, `${updated.customerName} — ${updated.status} (guia)`);
  res.json(updated);
});

// Visão de confiabilidade só-admin — soma penalidades por prestador. Nunca
// mexe na nota pública de avaliação, é um selo interno separado.
app.get("/api/gestao/confiabilidade", requireAdmin, async (req, res) => {
  const { data: penalidades, error } = await supabase.from("prestador_penalidades").select("*").order("createdAt", { ascending: false });
  if (error) return res.status(500).json({ error: "Erro ao buscar penalidades." });

  const [{ data: pousadaRows }, { data: guideRows }] = await Promise.all([
    supabase.from("pousadas").select("id,name"),
    supabase.from("guides").select("id,name"),
  ]);
  const nomes: Record<string, string> = {};
  (pousadaRows || []).forEach((p: any) => { nomes[`pousada:${p.id}`] = p.name; });
  (guideRows || []).forEach((g: any) => { nomes[`guia:${g.id}`] = g.name; });

  const resumo: Record<string, { prestadorType: string; prestadorId: string; prestadorName: string; totalEstrelasPerdidas: number; totalDevido: number; qtdCancelamentos: number }> = {};
  for (const p of penalidades || []) {
    const key = `${p.prestadorType}:${p.prestadorId}`;
    if (!resumo[key]) {
      resumo[key] = { prestadorType: p.prestadorType, prestadorId: p.prestadorId, prestadorName: nomes[key] || "(removido)", totalEstrelasPerdidas: 0, totalDevido: 0, qtdCancelamentos: 0 };
    }
    resumo[key].totalEstrelasPerdidas += p.estrelasPerdidas;
    resumo[key].totalDevido += p.valorPenalidade;
    resumo[key].qtdCancelamentos += 1;
  }

  res.json({ penalidades, resumoPorPrestador: Object.values(resumo) });
});

// ----------------------------------------------------
// LEMBRETES AUTOMÁTICOS DE CANCELAMENTO — roda uma vez por dia via Vercel
// Cron (ver "crons" em vercel.json), avisando pousada/guia com reserva
// confirmada nos marcos de 45/20/5 dias antes do check-in, reforçando o que
// eles perdem se cancelarem a partir dali. Idempotente via
// lembretes_enviados (não manda o mesmo aviso duas vezes).
// ----------------------------------------------------

const REMINDER_THRESHOLDS = [45, 20, 5] as const;
const CRON_SECRET = process.env.CRON_SECRET;

// Contas de parceiro não guardam email na própria tabela (pousadas/atracoes)
// — só o guia tem email direto no cadastro. Pra pousada, o email de login
// mora só no Supabase Auth, então precisa procurar pelo app_metadata.
async function findPartnerEmail(partnerType: "pousada" | "guia", partnerId: string): Promise<string | null> {
  if (partnerType === "guia") {
    const { data } = await supabase.from("guides").select("email").eq("id", partnerId).maybeSingle();
    return data?.email || null;
  }
  if (!supabaseAdminAuth) return null;
  // Poucas dezenas de parceiros hoje — varrer algumas páginas da Auth Admin
  // API é suficiente; se a base crescer muito, isso merece um índice próprio.
  for (let page = 1; page <= 5; page++) {
    // Sem desestruturar — o retorno é uma união discriminada por "error"
    // ({data:{users:User[]}, error:null} | {data:{users:[]}, error:AuthError}),
    // que se perde ao desestruturar data/error em variáveis separadas.
    const result = await supabaseAdminAuth.auth.admin.listUsers({ page, perPage: 200 });
    // TS não consegue carregar a união discriminada (error null vs
    // AuthError) através do loop/await pra tipar result.data.users como
    // User[] de verdade — já checamos result.error acima, então o cast é seguro.
    const users = (result.error ? [] : result.data.users) as any[];
    if (users.length === 0) break;
    const match = users.find(u => u.app_metadata?.partnerType === partnerType && u.app_metadata?.partnerId === partnerId);
    if (match?.email) return match.email as string;
    if (users.length < 200) break;
  }
  return null;
}

async function enviarLembreteCancelamento(booking: Booking, dias: number) {
  if (!resend) return;
  const { valorPenalidade, estrelasPerdidas } = calcularPenalidadeCancelamento(booking.totalPrice, dias - 1);
  const consequencia = estrelasPerdidas > 0 && valorPenalidade > 0
    ? `perda de ${estrelasPerdidas} estrela(s) de confiabilidade e multa de R$ ${valorPenalidade.toLocaleString('pt-BR')}`
    : estrelasPerdidas > 0
      ? `perda de ${estrelasPerdidas} estrela(s) de confiabilidade`
      : valorPenalidade > 0
        ? `multa de R$ ${valorPenalidade.toLocaleString('pt-BR')}`
        : "nenhuma penalidade (dentro do prazo mínimo)";

  const destinatarios: { type: "pousada" | "guia"; id: string; name: string }[] = [
    { type: "pousada", id: booking.pousadaId, name: booking.pousadaName },
  ];
  if (booking.guideId && booking.guideName) destinatarios.push({ type: "guia", id: booking.guideId, name: booking.guideName });

  for (const dest of destinatarios) {
    const email = await findPartnerEmail(dest.type, dest.id);
    if (!email) continue;
    try {
      await resend.emails.send({
        from: "EcoSafari Brasil <onboarding@resend.dev>",
        to: email,
        subject: `Faltam ${dias} dias para a expedição de ${booking.customerName} — EcoSafari`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #2D4635;">Sua expedição está chegando 🐆</h2>
            <p>Olá, ${dest.name}! Faltam <strong>${dias} dias</strong> para a reserva de <strong>${booking.customerName}</strong> (${booking.checkIn} a ${booking.checkOut}).</p>
            <p>Se precisar cancelar a partir de agora, a política de cancelamento se aplica: <strong>${consequencia}</strong>.</p>
            <p style="color: #888; font-size: 12px;">Cancelamentos com 45 dias ou mais de antecedência não têm nenhuma penalidade.</p>
          </div>
        `,
      });
    } catch (err: any) {
      log.warn(`Falha ao enviar lembrete de cancelamento pra ${dest.type} ${dest.id}:`, err.message);
    }
  }
}

app.get("/api/cron/lembretes-cancelamento", async (req, res) => {
  // Vercel Cron manda esse header automaticamente quando CRON_SECRET está
  // definido — sem isso, qualquer um poderia disparar o job manualmente.
  if (CRON_SECRET && req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "Não autorizado." });
  }

  const { data: bookings, error } = await supabase.from("bookings").select("*").in("status", CONFIRMED_BOOKING_STATUSES);
  if (error) return res.status(500).json({ error: "Erro ao buscar reservas confirmadas." });

  let sent = 0;
  for (const booking of (bookings || []) as Booking[]) {
    const dias = diasAteData(booking.checkIn);
    if (!(REMINDER_THRESHOLDS as readonly number[]).includes(dias)) continue;

    const { data: already } = await supabase.from("lembretes_enviados").select("id").eq("bookingId", booking.id).eq("threshold", dias).maybeSingle();
    if (already) continue;

    await enviarLembreteCancelamento(booking, dias);
    const { error: logErr } = await supabase.from("lembretes_enviados").insert({ id: `lb_${randomUUID()}`, bookingId: booking.id, threshold: dias, sentAt: new Date().toISOString() });
    if (!logErr) sent++;
  }

  // Mesmo job diário aproveita pra esvaziar a lixeira vencida (>30 dias) —
  // ver moverParaLixeira/scripts/add-lixeira.sql. Não justifica um cron
  // separado só pra isso.
  await purgeLixeiraExpirada();

  res.json({ success: true, remindersSent: sent });
});

// ----------------------------------------------------
// PAGAMENTO REAL (STRIPE) — ativa automaticamente quando STRIPE_SECRET_KEY
// está configurado; enquanto isso, o chatbot usa o botão de simulação.
// ----------------------------------------------------

app.get("/api/stripe/status", (req, res) => {
  res.json({ configured: !!stripe });
});

app.post("/api/create-checkout-session", checkoutLimiter, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: "Stripe não configurado. Defina STRIPE_SECRET_KEY para ativar o checkout real." });
  }

  const { bookingId } = req.body;
  const { data: booking, error: bookingErr } = await supabase.from("bookings").select("*").eq("id", bookingId).maybeSingle();
  if (bookingErr || !booking) {
    return res.status(404).json({ error: "Reserva não encontrada" });
  }

  const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  const origin = `${protocol}://${req.get("host")}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "brl",
          product_data: { name: `${booking.pousadaName} — ${booking.experienceType}` },
          unit_amount: Math.round(booking.totalPrice * 100),
        },
        quantity: 1,
      }],
      customer_email: booking.customerEmail || undefined,
      metadata: { bookingId: booking.id },
      success_url: `${origin}/pagamento-confirmado?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?payment=cancelled`,
    });
    res.json({ url: session.url });
  } catch (err: any) {
    log.error("Erro ao criar sessão de checkout Stripe:", err.message);
    res.status(500).json({ error: "Erro ao criar sessão de pagamento" });
  }
});

// Signature-verified webhook: Stripe calls this directly (server-to-server),
// so it confirms payment even if the customer's browser never makes it back
// to /pagamento-confirmado. constructEvent() throws if the "stripe-signature"
// header doesn't match STRIPE_WEBHOOK_SECRET, which is what stops anyone
// from POSTing a fake "payment succeeded" event at this endpoint.
// Marca os consumos de uma sessão de checkout de consumo (não de reserva)
// como pagos — compartilhado entre o webhook e o retorno do navegador
// (GET /api/payments/confirm), mesma dualidade já usada pra confirmação de
// reserva via Stripe.
async function applyConsumoPayment(session: Stripe.Checkout.Session) {
  const consumoIds = session.metadata?.consumoIds?.split(",").filter(Boolean);
  if (!consumoIds || consumoIds.length === 0) return false;
  const { error } = await supabase.from("consumos").update({ status: "pago" }).in("id", consumoIds).eq("status", "pendente");
  if (error) {
    log.error("Erro ao marcar consumo como pago via Stripe:", error.message);
    return false;
  }
  return true;
}

async function handleStripeWebhook(req: express.Request, res: express.Response) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send("Stripe webhook não configurado");
  }

  const signature = req.headers["stripe-signature"];
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature as string, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    log.error("Assinatura do webhook Stripe inválida:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === "paid") {
      const bookingId = session.metadata?.bookingId;
      try {
        if (bookingId) {
          await applyBookingStatusUpdate(bookingId, { status: "pago" }, req);
        } else {
          await applyConsumoPayment(session);
        }
      } catch (err: any) {
        log.error("Erro ao confirmar pagamento via webhook Stripe:", err.message);
      }
    }
  }

  res.json({ received: true });
}

app.get("/api/payments/confirm", checkoutLimiter, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: "Stripe não configurado" });
  }
  const sessionId = String(req.query.session_id || "");
  if (!sessionId) {
    return res.status(400).json({ error: "session_id é obrigatório" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(402).json({ error: "Pagamento ainda não confirmado" });
    }
    const bookingId = session.metadata?.bookingId;
    if (!bookingId) {
      // Sem bookingId: é uma cobrança de consumo, não de reserva (ver
      // POST /api/pousadas/:id/bookings/:bookingId/consumos/cobrar).
      const settled = await applyConsumoPayment(session);
      if (!settled) return res.status(400).json({ error: "Sessão de pagamento não identificada." });
      return res.json({ consumo: true });
    }
    const updated = await applyBookingStatusUpdate(bookingId, { status: "pago" }, req);
    if (!updated) {
      return res.status(404).json({ error: "Reserva não encontrada" });
    }
    res.json({ booking: updated });
  } catch (err: any) {
    log.error("Erro ao confirmar pagamento Stripe:", err.message);
    res.status(500).json({ error: "Erro ao confirmar pagamento" });
  }
});

// ----------------------------------------------------
// VOUCHER EM PDF & EMAIL DE CONFIRMAÇÃO (RESEND)
// ----------------------------------------------------

function generateVoucherPdfBuffer(booking: Booking): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fillColor("#2D4635").fontSize(22).text("EcoSafari Brasil", { align: "left" });
    doc.fillColor("#666").fontSize(10).text("Voucher de Reserva Confirmada", { align: "left" });
    doc.moveDown(1.5);

    doc.strokeColor("#2D4635").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    doc.fillColor("#111").fontSize(14).text(`Reserva #${booking.id}`, { underline: false });
    doc.moveDown(0.5);

    const row = (label: string, value: string) => {
      doc.fontSize(10).fillColor("#666").text(label, { continued: true }).fillColor("#111").text(`  ${value}`);
      doc.moveDown(0.3);
    };

    row("Hóspede:", booking.customerName);
    row("Email:", booking.customerEmail);
    row("Pousada:", booking.pousadaName);
    row("Check-in:", booking.checkIn);
    row("Check-out:", booking.checkOut);
    row("Hóspedes:", `${booking.adults} adulto(s)${booking.children ? `, ${booking.children} criança(s)` : ""}`);
    row("Experiência:", booking.experienceType);
    if (booking.guideName) row("Guia designado:", booking.guideName);
    row("Status:", "Pagamento confirmado");

    doc.moveDown(1);
    doc.strokeColor("#2D4635").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    doc.fontSize(14).fillColor("#2D4635").text(`Total pago: R$ ${booking.totalPrice.toLocaleString('pt-BR')}`);
    doc.moveDown(1.5);

    doc.fontSize(9).fillColor("#888").text(
      "Apresente este voucher (impresso ou digital) no check-in. Em caso de dúvidas, fale conosco pelo WhatsApp +55 65 99986-8334.",
      { width: 495 }
    );

    doc.end();
  });
}

async function sendBookingConfirmationEmail(booking: Booking) {
  if (!resend || !booking.customerEmail) return;

  const pdfBuffer = await generateVoucherPdfBuffer(booking);

  await resend.emails.send({
    from: "EcoSafari Brasil <onboarding@resend.dev>",
    to: booking.customerEmail,
    subject: `Reserva confirmada — ${booking.pousadaName} (#${booking.id})`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #2D4635;">Pagamento confirmado! 🌿</h2>
        <p>Olá, ${booking.customerName}! Sua reserva na <strong>${booking.pousadaName}</strong> está confirmada.</p>
        <p><strong>Check-in:</strong> ${booking.checkIn}<br/>
        <strong>Check-out:</strong> ${booking.checkOut}<br/>
        <strong>Total pago:</strong> R$ ${booking.totalPrice.toLocaleString('pt-BR')}</p>
        <p>O voucher da reserva está em anexo neste email.</p>
        <p style="color: #888; font-size: 12px;">Dúvidas? Fale conosco pelo WhatsApp +55 65 99986-8334.</p>
      </div>
    `,
    attachments: [
      { filename: `voucher-${booking.id}.pdf`, content: pdfBuffer.toString("base64") }
    ],
  });
}

app.get("/api/resend/status", (req, res) => {
  res.json({ configured: !!resend });
});

// Autoriza o acesso ao voucher de duas formas: (1) admin autenticado, ou
// (2) posse comprovada da sessão de pagamento Stripe que gerou esta reserva
// (?session_id=..., o mesmo valor que a página de confirmação já tem na URL
// logo após o checkout). Sem uma dessas duas provas, o UUID da reserva
// sozinho não abre mais o PDF de ninguém — antes disso, qualquer pessoa que
// descobrisse um booking.id (histórico do navegador, link encaminhado,
// captura de tela) conseguia baixar nome, email, datas e valor pago de
// qualquer hóspede, para sempre, sem nunca ter se autenticado.
async function getAuthorizedBooking(req: express.Request, res: express.Response): Promise<Booking | null> {
  const { data: booking, error: fetchErr } = await supabase.from("bookings").select("*").eq("id", req.params.id).maybeSingle();
  if (fetchErr || !booking) {
    res.status(404).json({ error: "Reserva não encontrada" });
    return null;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    const { data } = await supabase.auth.getUser(token);
    if (data.user?.app_metadata?.role === "admin") return booking as Booking;
  }

  const sessionId = String(req.query.session_id || "");
  if (stripe && sessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status === "paid" && session.metadata?.bookingId === booking.id) {
        return booking as Booking;
      }
    } catch {
      // session_id inválido/inexistente cai no 403 abaixo
    }
  }

  res.status(403).json({ error: "Acesso ao voucher não autorizado." });
  return null;
}

app.get("/api/bookings/:id/voucher.pdf", async (req, res) => {
  const booking = await getAuthorizedBooking(req, res);
  if (!booking) return; // getAuthorizedBooking já respondeu o erro

  try {
    const buffer = await generateVoucherPdfBuffer(booking);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="voucher-${booking.id}.pdf"`);
    res.send(buffer);
  } catch (err: any) {
    log.error("Erro ao gerar voucher PDF:", err.message);
    res.status(500).json({ error: "Erro ao gerar voucher" });
  }
});

// SIGHTINGS CRUD
app.get("/api/sightings", async (req, res) => {
  const { data, error } = await supabase.from("sightings").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar avistamentos" });
  res.json(data);
});

app.post("/api/sightings", publicFormLimiter, async (req, res) => {
  const { pousadaId, userName, animalName, imageUrl, location } = req.body;
  let targetPousada: { id: string; name: string } | null = null;
  if (pousadaId) {
    const { data } = await supabase.from("pousadas").select("id,name").eq("id", pousadaId).maybeSingle();
    targetPousada = data;
  }
  if (!targetPousada) {
    const { data } = await supabase.from("pousadas").select("id,name").limit(1).maybeSingle();
    targetPousada = data;
  }

  const newSighting: Sighting = {
    id: `s_${randomUUID()}`,
    pousadaId: targetPousada ? targetPousada.id : (pousadaId || ""),
    pousadaName: targetPousada ? targetPousada.name : "",
    userName: userName || "Turista Anônimo",
    animalName,
    // Generic nature scene, not a specific species — a sighting can be of any
    // animal, so falling back to one species' photo (like the old jaguar
    // default) mislabels every other animal that gets posted without a photo.
    imageUrl: imageUrl || "/pousadas/vagalume-lago-deck.png",
    location: location || "Pantanal",
    timestamp: new Date().toISOString(),
    likes: 0,
    status: "aprovado",
  };

  const { error } = await supabase.from("sightings").insert(newSighting);
  if (error) {
    log.error("Erro ao salvar avistamento no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar avistamento" });
  }

  addNotification("admin", `Novo avistamento de ${animalName} postado por ${newSighting.userName}!`, "sighting_new");
  res.status(201).json(newSighting);
});

app.post("/api/sightings/:id/like", publicFormLimiter, async (req, res) => {
  const { id } = req.params;
  const { data: current, error: fetchErr } = await supabase.from("sightings").select("likes").eq("id", id).single();
  if (fetchErr || !current) return res.status(404).json({ error: "Avistamento não encontrado" });

  const { data, error } = await supabase.from("sightings").update({ likes: current.likes + 1 }).eq("id", id).select().single();
  if (error || !data) {
    return res.status(500).json({ error: "Erro ao curtir avistamento" });
  }
  res.json(data);
});

// REVIEWS
// Público — só os campos exibidos na vitrine de avaliações. turistaId fica de
// fora de propósito: é o id interno (Supabase Auth) de quem avaliou, sem uso
// nenhum no front-end, e não deveria vazar numa rota sem autenticação.
app.get("/api/reviews", async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=15, stale-while-revalidate=120");
  const { data, error } = await supabase
    .from("reviews")
    .select("id,pousadaId,atracaoId,guideId,userName,rating,comment,date,photoUrl");
  if (error) return res.status(500).json({ error: "Erro ao buscar avaliações" });
  res.json(data);
});

// A review targets exactly one of pousada/atração/guia — this table backs
// "avaliações" for all three partner kinds instead of a separate reviews
// table per kind. Whichever *Id is present in the body decides both which
// column gets set and which partner's average "rating" gets recalculated.
// Requires a tourist profile (requireTourist) — the display name and the
// review's ownership both come from that profile, never from the request
// body, so nobody can post under a made-up name or spoof somebody else's
// account.
app.post("/api/reviews", requireTourist, async (req, res) => {
  const { pousadaId, atracaoId, guideId } = req.body;
  const targetCount = [pousadaId, atracaoId, guideId].filter(Boolean).length;
  if (targetCount !== 1) {
    return res.status(400).json({ error: "Informe exatamente um de pousadaId, atracaoId ou guideId." });
  }
  const [column, table] = pousadaId ? ["pousadaId", "pousadas"] : atracaoId ? ["atracaoId", "atracoes"] : ["guideId", "guides"];
  const targetId = pousadaId || atracaoId || guideId;

  const touristId = (res.locals.touristUser as { id: string }).id;
  const { data: touristProfile } = await supabase.from("turistas").select("name").eq("id", touristId).maybeSingle();
  if (!touristProfile) {
    return res.status(403).json({ error: "Complete seu perfil de turista antes de avaliar." });
  }

  // One review per tourist per target — otherwise requiring a profile would
  // only add a login step in front of review-bombing, not actually stop it.
  const { data: existingReview } = await supabase.from("reviews").select("id").eq(column, targetId).eq("turistaId", touristId).maybeSingle();
  if (existingReview) {
    return res.status(400).json({ error: "Você já avaliou este item." });
  }

  const moderation = await moderateText(String(req.body.comment || ""));
  if (!moderation.ok) {
    return res.status(400).json({ error: moderation.reason });
  }

  const newReview: Review = {
    id: `r_${randomUUID()}`,
    pousadaId: pousadaId || undefined,
    atracaoId: atracaoId || undefined,
    guideId: guideId || undefined,
    userName: touristProfile.name,
    rating: req.body.rating || 5,
    comment: req.body.comment,
    date: new Date().toISOString().split("T")[0],
    photoUrl: req.body.photoUrl || undefined,
    turistaId: touristId,
  };

  const { error } = await supabase.from("reviews").insert(newReview);
  if (error) {
    log.error("Erro ao salvar avaliação no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar avaliação" });
  }

  // Recalculate the target's average rating from every review it has now
  const { data: targetReviews } = await supabase.from("reviews").select("rating").eq(column, targetId);
  if (targetReviews && targetReviews.length > 0) {
    const avg = Number((targetReviews.reduce((sum, r) => sum + r.rating, 0) / targetReviews.length).toFixed(1));
    const { error: ratingErr } = await supabase.from(table).update({ rating: avg }).eq("id", targetId);
    if (ratingErr) log.warn(`Erro ao atualizar nota (${table}) no Supabase:`, ratingErr.message);
  }

  res.status(201).json(newReview);
});

// NOTIFICATIONS
app.get("/api/notifications", requireAdmin, async (req, res) => {
  // Sem order(), o Postgres devolve na ordem física de armazenamento — que
  // por acaso tende a parecer "mais antiga primeiro", o oposto do que faz
  // sentido num feed de notificação.
  const { data, error } = await supabase.from("notifications").select("*").order("timestamp", { ascending: false });
  if (error) return res.status(500).json({ error: "Erro ao buscar notificações" });
  res.json(data);
});

app.post("/api/notifications/:id/read", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase.from("notifications").update({ read: true }).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Notificação não encontrada" });
  res.json(data);
});

// SPECIES CRUD
app.get("/api/species", async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=600");
  const { data, error } = await supabase.from("species").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar espécies" });
  res.json(data);
});

app.post("/api/species", requireAdmin, async (req, res) => {
  const newSpecie: Species = {
    ...pickFields<Species>(req.body, SPECIES_FIELDS),
    id: req.body.id || `s_${randomUUID()}`,
  } as Species;
  const { error } = await supabase.from("species").insert(newSpecie);
  if (error) {
    log.error("Erro ao salvar espécie no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar espécie" });
  }
  await logAdminAction(res.locals.adminUser, "create", "species", newSpecie.id, (newSpecie as any).name || newSpecie.id);
  res.status(201).json(newSpecie);
});

app.put("/api/species/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Species>(req.body, SPECIES_FIELDS);
  const { data, error } = await supabase.from("species").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Espécie não encontrada" });
  await logAdminAction(res.locals.adminUser, "update", "species", id, (data as any).name || id);
  res.json(data);
});

app.delete("/api/species/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  let existing: any;
  try {
    existing = await moverParaLixeira("species", id, res.locals.adminUser?.email || "admin");
  } catch (err: any) {
    log.error("Erro ao mover espécie para a lixeira:", err.message);
    return res.status(500).json({ error: "Erro ao excluir espécie" });
  }
  if (!existing) return res.status(404).json({ error: "Espécie não encontrada" });
  const { error } = await supabase.from("species").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir espécie" });
  await logAdminAction(res.locals.adminUser, "delete", "species", id, existing?.name || id);
  res.json({ success: true, message: "Espécie movida para a lixeira. Pode ser restaurada em até 30 dias." });
});

// ----------------------------------------------------
// CAMADA DE TURISMO: TURISTAS, ROTEIROS, RESERVAS, PAGAMENTOS, GUIAS
// (modelo adicional conforme especificação do banco de dados, independente
// do catálogo de Pousadas/Bookings já existente)
// ----------------------------------------------------

// TURISTAS CRUD
app.get("/api/turistas", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("turistas").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar turistas" });
  res.json(data);
});

app.post("/api/turistas", requireAdmin, async (req, res) => {
  const newTurista: Turista = { ...pickFields<Turista>(req.body, TURISTA_FIELDS), id: `t_${randomUUID()}` } as Turista;
  const { error } = await supabase.from("turistas").insert(newTurista);
  if (error) {
    log.error("Erro ao salvar turista no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar turista" });
  }
  await logAdminAction(res.locals.adminUser, "create", "turista", newTurista.id, newTurista.name);
  res.status(201).json(newTurista);
});

app.put("/api/turistas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Turista>(req.body, TURISTA_FIELDS);
  const { data, error } = await supabase.from("turistas").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Turista não encontrado" });
  await logAdminAction(res.locals.adminUser, "update", "turista", id, data.name);
  res.json(data);
});

// Só esta exclusão feita pelo admin passa pela lixeira. O hard-delete de
// verdade em DELETE /api/turista/me (autoexclusão LGPD, mais abaixo) fica
// como está — direito ao esquecimento não pode virar "recuperável em 30
// dias" escondido do próprio titular dos dados.
app.delete("/api/turistas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  let existing: any;
  try {
    existing = await moverParaLixeira("turista", id, res.locals.adminUser?.email || "admin");
  } catch (err: any) {
    log.error("Erro ao mover turista para a lixeira:", err.message);
    return res.status(500).json({ error: "Erro ao excluir turista" });
  }
  if (!existing) return res.status(404).json({ error: "Turista não encontrado" });
  const { error } = await supabase.from("turistas").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir turista" });
  await logAdminAction(res.locals.adminUser, "delete", "turista", id, existing?.name || id);
  res.json({ success: true, message: "Turista movido para a lixeira. Pode ser restaurado em até 30 dias." });
});

// LIXEIRA — listar, restaurar ou apagar de vez (ver moverParaLixeira acima)
app.get("/api/lixeira", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("lixeira").select("*").order("deletedAt", { ascending: false });
  if (error) return res.status(500).json({ error: "Erro ao buscar lixeira" });
  res.json(data);
});

app.post("/api/lixeira/:id/restaurar", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data: entry, error } = await supabase.from("lixeira").select("*").eq("id", id).maybeSingle();
  if (error || !entry) return res.status(404).json({ error: "Registro não encontrado na lixeira" });

  const table = LIXEIRA_TABLE[entry.entityType as keyof typeof LIXEIRA_TABLE];
  if (!table) return res.status(400).json({ error: "Tipo de registro desconhecido" });

  const { error: insertError } = await supabase.from(table).insert(entry.data.row);
  if (insertError) {
    return res.status(500).json({ error: `Erro ao restaurar: ${insertError.message}` });
  }

  // Pousada: reinsere também os produtos/consumos que tinham sido levados
  // junto pra lixeira (ON DELETE CASCADE — ver moverParaLixeira).
  if (entry.entityType === "pousada") {
    if (entry.data.produtos?.length) await supabase.from("produtos").insert(entry.data.produtos);
    if (entry.data.consumos?.length) await supabase.from("consumos").insert(entry.data.consumos);
  }

  await supabase.from("lixeira").delete().eq("id", id);
  await logAdminAction(res.locals.adminUser, "restore", entry.entityType, entry.entityId, entry.entityLabel);
  res.json({ success: true, message: "Registro restaurado com sucesso." });
});

// Apagar de vez, antes dos 30 dias — sem volta a partir daqui.
app.delete("/api/lixeira/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data: entry } = await supabase.from("lixeira").select("entityType, entityLabel").eq("id", id).maybeSingle();
  const { error } = await supabase.from("lixeira").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir definitivamente" });
  await logAdminAction(res.locals.adminUser, "purge", entry?.entityType || "lixeira", id, entry?.entityLabel || id);
  res.json({ success: true, message: "Registro apagado definitivamente." });
});

// Categorias fixas de interesse (passeios/aventuras, fauna/flora) que o
// turista marca no próprio perfil — espelha TOURIST_INTEREST_OPTIONS em
// src/lib/touristInterests.ts. Validado aqui filtrando qualquer valor fora
// da lista em vez de rejeitar a requisição inteira — defensivo contra o
// front enviar algo desatualizado, nunca quebra o cadastro/edição por causa
// disso.
const TOURIST_INTEREST_OPTIONS = [
  "Trilhas guiadas", "Passeio de barco", "Focagem noturna", "Pesca esportiva",
  "Observação de aves", "Cavalgada", "Fotografia de vida selvagem", "Canoagem / Stand-up paddle",
  "Onça-pintada", "Jacarés", "Aves e araras", "Capivaras", "Primatas",
  "Vida aquática", "Flora do Pantanal", "Flora do Cerrado",
];

function sanitizeTouristInterests(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is string => typeof v === "string" && TOURIST_INTEREST_OPTIONS.includes(v));
}

// TURISTA SELF-SERVICE (Supabase Auth) — unlike admin/partner (invite-only,
// provisioned by an admin), a tourist creates their own account: no vetting
// needed, this is just the "profile required to review" gate (see
// requireTourist above and POST /api/reviews below). The "turistas" row IS
// the profile the gate checks for — it's the same table TURISTAS CRUD above
// already exposes to the admin, just with the row's id set to the Supabase
// Auth user id itself (instead of a t_ prefix) so a self-service signup and
// its account are the same lookup.
app.post("/api/turista/signup", publicFormLimiter, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — cadastro de turista indisponível." });

  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");
  const name = String(req.body.name || "").trim();
  const whatsapp = String(req.body.whatsapp || "").trim();
  const country = String(req.body.country || "").trim();
  const language = String(req.body.language || "").trim();
  const age = Number(req.body.age);
  const preferences = String(req.body.preferences || "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Informe um email válido." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "A senha precisa ter pelo menos 8 caracteres." });
  }
  if (isWeakPassword(password)) {
    return res.status(400).json({ error: "Essa senha é fácil demais de adivinhar. Use uma combinação de letras e números que não seja óbvia." });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: "As senhas não coincidem." });
  }
  // All profile fields are mandatory at signup — a "perfil de turista"
  // that's just an empty shell defeats the point of requiring one to review.
  if (!name || !whatsapp || !country || !language || !preferences || !Number.isFinite(age) || age <= 0) {
    return res.status(400).json({ error: "Preencha nome, WhatsApp, país, idioma, idade e preferências de viagem." });
  }

  // Só exige a confirmação de email de verdade quando dá pra mandar o link
  // (Resend configurado) — sem isso, cai pro comportamento antigo (conta já
  // confirmada, login imediato) pra não travar o cadastro em ambientes sem
  // Resend configurado ainda.
  const requireEmailConfirmation = !!resend;

  const { data: created, error: createErr } = await supabaseAdminAuth.auth.admin.createUser({
    email,
    password,
    email_confirm: !requireEmailConfirmation,
    app_metadata: { role: "tourist" },
  });
  if (createErr || !created.user) {
    return res.status(400).json({ error: describeAuthError(createErr, "Erro ao criar sua conta (o email já pode estar em uso).") });
  }

  const interests = sanitizeTouristInterests(req.body.interests);
  const newTurista: Turista = { id: created.user.id, name, email, whatsapp, country, language, age, preferences, interests };
  const { error: insertErr } = await supabase.from("turistas").insert(newTurista);
  if (insertErr) {
    // Don't leave a bare auth account behind with no profile row — it would
    // pass requireTourist's role check but have nothing for a review to use.
    await supabaseAdminAuth.auth.admin.deleteUser(created.user.id).catch(() => {});
    log.error("Erro ao salvar perfil de turista no Supabase:", insertErr.message);
    return res.status(500).json({ error: "Erro ao criar seu perfil." });
  }

  if (!requireEmailConfirmation) {
    return res.status(201).json({ success: true, emailConfirmationSent: false });
  }

  // Gera o link de confirmação e manda pelo Resend — mesmo padrão já usado
  // pro convite de admin/parceiro (server-to-server, não depende do envio de
  // email nativo do Supabase, que precisa de SMTP configurado à parte).
  // redirectTo aponta de volta pra /turista, a mesma aba onde a pessoa criou
  // o cadastro — ao clicar, o Supabase já autentica a sessão e essa página
  // detecta o login sozinha, sem precisar de nenhum passo extra.
  const { data: linkData, error: linkErr } = await supabaseAdminAuth.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: { redirectTo: `${SITE_URL}/turista` },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    log.warn("Turista criado, mas falha ao gerar link de confirmação:", linkErr?.message);
    return res.status(201).json({ success: true, emailConfirmationSent: false });
  }

  try {
    await resend!.emails.send({
      from: "EcoSafari Brasil <onboarding@resend.dev>",
      to: email,
      subject: "Confirme seu email — EcoSafari Brasil",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #2D4635;">Bem-vindo(a) à EcoSafari! 🌿</h2>
          <p>Olá, ${name}! Falta só um passo: confirme seu email pra ativar seu perfil de turista e poder avaliar pousadas, guias e atrações.</p>
          <p><a href="${linkData.properties.action_link}" style="display:inline-block; background:#2D4635; color:#fff; padding:10px 20px; text-decoration:none; border-radius:4px;">Confirmar meu email</a></p>
          <p style="color: #888; font-size: 12px;">Se o botão não funcionar, copie e cole este link no navegador:<br/>${linkData.properties.action_link}</p>
        </div>
      `,
    });
    res.status(201).json({ success: true, emailConfirmationSent: true });
  } catch (err: any) {
    log.warn("Turista criado, mas falha ao enviar email de confirmação via Resend:", err.message);
    res.status(201).json({ success: true, emailConfirmationSent: false });
  }
});

app.get("/api/turista/me", requireTourist, async (req, res) => {
  const userId = (res.locals.touristUser as { id: string }).id;
  const { data, error } = await supabase.from("turistas").select("*").eq("id", userId).maybeSingle();
  if (error || !data) return res.status(404).json({ error: "Perfil de turista não encontrado." });
  res.json(data as Turista);
});

// Edição do próprio perfil — nunca mexe em email/coins aqui: email é a
// identidade de login (mudar exigiria reautenticação), coins só espelham o
// saldo do app via POST /api/integrations/app-coins-sync, nunca são
// escritas pelo próprio turista.
app.put("/api/turista/me", requireTourist, async (req, res) => {
  const userId = (res.locals.touristUser as { id: string }).id;

  const name = String(req.body.name || "").trim();
  const whatsapp = String(req.body.whatsapp || "").trim();
  const country = String(req.body.country || "").trim();
  const language = String(req.body.language || "").trim();
  const age = Number(req.body.age);
  const preferences = String(req.body.preferences || "").trim();
  if (!name || !whatsapp || !country || !language || !preferences || !Number.isFinite(age) || age <= 0) {
    return res.status(400).json({ error: "Preencha nome, WhatsApp, país, idioma, idade e preferências de viagem." });
  }
  const interests = sanitizeTouristInterests(req.body.interests);
  // Opcional — só é enviado quando a pessoa troca a foto (ver ImageUploadButton
  // em TuristaProfileView.tsx); omitido, o UPDATE simplesmente não mexe nela.
  const photoUrl = typeof req.body.photoUrl === "string" ? req.body.photoUrl.trim() : undefined;

  const { data, error } = await supabase
    .from("turistas")
    .update({ name, whatsapp, country, language, age, preferences, interests, ...(photoUrl !== undefined ? { photoUrl } : {}) })
    .eq("id", userId)
    .select()
    .maybeSingle();
  if (error || !data) return res.status(500).json({ error: "Erro ao salvar seu perfil." });
  res.json(data as Turista);
});

// Direito de acesso/portabilidade (LGPD art. 18, incisos I/V) — um dump de
// tudo que está vinculado a este turista, pra ele baixar sozinho sem
// precisar pedir pra equipe. Junta os mesmos dados que já existem
// espalhados em /favoritos, /visitados, /resgates, num JSON só.
app.get("/api/turista/me/export", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string; email?: string };
  const [profileRes, favoritosRes, resgatesRes, reviewsRes, bookingsRes] = await Promise.all([
    supabase.from("turistas").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("turista_favoritos").select("pousadaId").eq("turistaId", user.id),
    supabase.from("turista_resgates").select("*").eq("turistaId", user.id),
    supabase.from("reviews").select("id,pousadaId,atracaoId,guideId,rating,comment,date,photoUrl").eq("turistaId", user.id),
    user.email
      ? supabase.from("bookings").select("id,pousadaName,checkIn,checkOut,status,totalPrice").eq("customerEmail", user.email)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  res.setHeader("Content-Disposition", `attachment; filename="ecosafari-meus-dados-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({
    exportedAt: new Date().toISOString(),
    perfil: profileRes.data,
    favoritos: favoritosRes.data || [],
    resgates: resgatesRes.data || [],
    avaliacoes: reviewsRes.data || [],
    reservas: bookingsRes.data || [],
  });
});

// Direito de eliminação (LGPD art. 18, inciso VI) — apaga o perfil e os
// dados diretamente pessoais (favoritos), remove a conta de autenticação, e
// ANONIMIZA (não apaga) as avaliações já publicadas: o nome vira "Usuário
// removido", mas a nota/comentário continua valendo pro histórico da
// pousada/guia avaliado — mesma lógica de qualquer loja que mantém reviews
// depois que o autor fecha a conta. Resgates não são tocados: são registro
// de uma transação já concluída com o parceiro (código já usado/pendente),
// não dado pessoal solto.
app.delete("/api/turista/me", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string };
  if (!supabaseAdminAuth) {
    return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — não é possível excluir a conta agora." });
  }

  await supabase.from("reviews").update({ userName: "Usuário removido", photoUrl: null }).eq("turistaId", user.id);
  await supabase.from("turista_favoritos").delete().eq("turistaId", user.id);
  await supabase.from("turistas").delete().eq("id", user.id);
  const { error: deleteAuthErr } = await supabaseAdminAuth.auth.admin.deleteUser(user.id);
  if (deleteAuthErr) {
    log.error("Erro ao excluir conta de autenticação do turista:", deleteAuthErr.message);
    return res.status(500).json({ error: "Seu perfil foi removido, mas houve um erro ao excluir a conta de login. Fale com a equipe pra concluir." });
  }

  res.json({ success: true });
});

// Deixa uma conta já autenticada (admin, parceiro...) virar turista também,
// SEM criar uma segunda conta desconectada — só acrescenta isTourist=true ao
// app_metadata que a conta já tem (nunca mexe em role/isAdmin/partnerType já
// existentes) e cria o perfil em "turistas" com o mesmo id/email. Não pede
// email nem senha porque a pessoa já está logada; só falta o perfil.
app.post("/api/turista/upgrade", requireAnyAuth, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — não é possível virar turista agora." });
  const user = res.locals.authUser as { id: string; email?: string; app_metadata?: Record<string, unknown> };

  if (isTouristUser(user)) {
    return res.status(400).json({ error: "Esta conta já tem um perfil de turista." });
  }
  const email = String(user.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "Esta conta não tem um email associado." });

  const name = String(req.body.name || "").trim();
  const whatsapp = String(req.body.whatsapp || "").trim();
  const country = String(req.body.country || "").trim();
  const language = String(req.body.language || "").trim();
  const age = Number(req.body.age);
  const preferences = String(req.body.preferences || "").trim();
  if (!name || !whatsapp || !country || !language || !preferences || !Number.isFinite(age) || age <= 0) {
    return res.status(400).json({ error: "Preencha nome, WhatsApp, país, idioma, idade e preferências de viagem." });
  }

  const mergedMetadata = { ...(user.app_metadata || {}), isTourist: true };
  const { error: updateErr } = await supabaseAdminAuth.auth.admin.updateUserById(user.id, { app_metadata: mergedMetadata });
  if (updateErr) return res.status(500).json({ error: describeAuthError(updateErr, "Erro ao ativar o perfil de turista.") });

  const interests = sanitizeTouristInterests(req.body.interests);
  const newTurista: Turista = { id: user.id, name, email, whatsapp, country, language, age, preferences, interests };
  const { error: insertErr } = await supabase.from("turistas").insert(newTurista);
  if (insertErr) {
    // Desfaz o isTourist se não conseguiu criar o perfil — não deixa a conta
    // passando no requireTourist sem ter uma linha em "turistas" pra usar.
    await supabaseAdminAuth.auth.admin.updateUserById(user.id, { app_metadata: user.app_metadata || {} }).catch(() => {});
    log.error("Erro ao salvar perfil de turista no Supabase:", insertErr.message);
    return res.status(500).json({ error: "Erro ao criar seu perfil de turista." });
  }

  res.status(201).json({ success: true });
});

// Pousadas que o turista já visitou de verdade — inferido a partir de
// reservas pagas/confirmadas feitas com o mesmo email da conta (bookings não
// tem vínculo direto de turistaId, só o email do hóspede na hora da reserva).
const VISITED_BOOKING_STATUSES = ["pago", "confirmado_pousada", "confirmado_guia", "confirmado_total"];

app.get("/api/turista/visitados", requireTourist, async (req, res) => {
  const email = (res.locals.touristUser as { email?: string }).email;
  if (!email) return res.json([]);
  const { data, error } = await supabase
    .from("bookings")
    .select("pousadaId,pousadaName,checkIn,checkOut,status")
    .eq("customerEmail", email)
    .in("status", VISITED_BOOKING_STATUSES);
  if (error) return res.status(500).json({ error: "Erro ao buscar histórico de visitas." });
  // Uma pousada só aparece uma vez, mesmo com várias reservas — mostra a
  // estadia mais recente.
  const byPousada = new Map<string, any>();
  for (const b of data || []) {
    const existing = byPousada.get(b.pousadaId);
    if (!existing || b.checkIn > existing.checkIn) byPousada.set(b.pousadaId, b);
  }
  res.json(Array.from(byPousada.values()));
});

// ----------------------------------------------------
// FAVORITOS — pousadas que um turista logado marcou como "gostei". Alimenta
// o widget de perfil no cabeçalho e a lista de favoritos.
// ----------------------------------------------------

app.get("/api/turista/favoritos", requireTourist, async (req, res) => {
  const userId = (res.locals.touristUser as { id: string }).id;
  const { data: favs, error } = await supabase.from("turista_favoritos").select("pousadaId").eq("turistaId", userId);
  if (error) return res.status(500).json({ error: "Erro ao buscar favoritos." });
  const ids = (favs || []).map((f: any) => f.pousadaId);
  if (ids.length === 0) return res.json([]);
  const { data: rows } = await supabase.from("pousadas").select("*").in("id", ids);
  res.json((rows || []).map(mapPousadaRow));
});

app.post("/api/turista/favoritos/:pousadaId", requireTourist, async (req, res) => {
  const userId = (res.locals.touristUser as { id: string }).id;
  const { pousadaId } = req.params;
  const { data: pousada } = await supabase.from("pousadas").select("id").eq("id", pousadaId).maybeSingle();
  if (!pousada) return res.status(404).json({ error: "Pousada não encontrada." });
  const { error } = await supabase.from("turista_favoritos").upsert({ turistaId: userId, pousadaId }, { onConflict: "turistaId,pousadaId" });
  if (error) return res.status(500).json({ error: "Erro ao favoritar pousada." });
  res.status(201).json({ success: true });
});

app.delete("/api/turista/favoritos/:pousadaId", requireTourist, async (req, res) => {
  const userId = (res.locals.touristUser as { id: string }).id;
  const { error } = await supabase.from("turista_favoritos").delete().eq("turistaId", userId).eq("pousadaId", req.params.pousadaId);
  if (error) return res.status(500).json({ error: "Erro ao remover favorito." });
  res.json({ success: true });
});

// ----------------------------------------------------
// RECOMPENSAS & RESGATES — o programa de Coins em si. Cada pousada cadastra
// os próprios brindes (recompensas); o turista troca Coins por um código,
// que a pousada confirma presencialmente (resgate). As Coins em si nunca são
// geradas aqui — vêm só do app separado, ver POST /api/integrations/app-coins-sync.
// ----------------------------------------------------

const RECOMPENSA_FIELDS = ["title", "description", "coinCost", "active"] as const;

// Público — só as recompensas ativas, para o turista escolher o que resgatar.
app.get("/api/pousadas/:id/recompensas", async (req, res) => {
  const { data, error } = await supabase
    .from("pousada_recompensas")
    .select("*")
    .eq("pousadaId", req.params.id)
    .eq("active", true)
    .order("coinCost", { ascending: true });
  if (error) return res.status(500).json({ error: "Erro ao buscar recompensas." });
  res.json(data);
});

// Visão de gestão do próprio parceiro (ou admin) — inclui as inativas também,
// pra dar pra reativar depois.
app.get("/api/pousadas/:id/recompensas/manage", requirePartnerAccess("pousada"), async (req, res) => {
  const { data, error } = await supabase
    .from("pousada_recompensas")
    .select("*")
    .eq("pousadaId", req.params.id)
    .order("createdAt", { ascending: false });
  if (error) return res.status(500).json({ error: "Erro ao buscar recompensas." });
  res.json(data);
});

app.post("/api/pousadas/:id/recompensas", requirePartnerAccess("pousada"), async (req, res) => {
  const { id: pousadaId } = req.params;
  const coinCost = Number(req.body.coinCost);
  if (!req.body.title || !Number.isFinite(coinCost) || coinCost <= 0) {
    return res.status(400).json({ error: "Informe um título e um custo em Coins válido (maior que zero)." });
  }
  const newRecompensa: Recompensa = {
    ...pickFields<Recompensa>(req.body, RECOMPENSA_FIELDS),
    id: `rc_${randomUUID()}`,
    pousadaId,
    coinCost,
    active: true,
    createdAt: new Date().toISOString(),
  } as Recompensa;
  const { error } = await supabase.from("pousada_recompensas").insert(newRecompensa);
  if (error) return res.status(500).json({ error: "Erro ao criar recompensa." });
  await logAdminAction(res.locals.actorUser, "create", "recompensa", newRecompensa.id, `${newRecompensa.title} — ${coinCost} coins`);
  res.status(201).json(newRecompensa);
});

app.put("/api/pousadas/:id/recompensas/:recompensaId", requirePartnerAccess("pousada"), async (req, res) => {
  const updates = pickFields<Recompensa>(req.body, RECOMPENSA_FIELDS);
  const { data, error } = await supabase
    .from("pousada_recompensas")
    .update(updates)
    .eq("id", req.params.recompensaId)
    .eq("pousadaId", req.params.id)
    .select()
    .single();
  if (error || !data) return res.status(404).json({ error: "Recompensa não encontrada." });
  await logAdminAction(res.locals.actorUser, "update", "recompensa", data.id, data.title);
  res.json(data);
});

app.delete("/api/pousadas/:id/recompensas/:recompensaId", requirePartnerAccess("pousada"), async (req, res) => {
  const { error } = await supabase.from("pousada_recompensas").delete().eq("id", req.params.recompensaId).eq("pousadaId", req.params.id);
  if (error) return res.status(500).json({ error: "Erro ao excluir recompensa." });
  await logAdminAction(res.locals.actorUser, "delete", "recompensa", req.params.recompensaId, req.params.recompensaId);
  res.json({ success: true });
});

app.post("/api/turista/resgates", requireTourist, async (req, res) => {
  const userId = (res.locals.touristUser as { id: string }).id;
  const { recompensaId } = req.body;

  const { data: recompensa } = await supabase.from("pousada_recompensas").select("*").eq("id", recompensaId).maybeSingle();
  if (!recompensa || !recompensa.active) return res.status(404).json({ error: "Recompensa não encontrada ou não está mais disponível." });

  const { data: turista } = await supabase.from("turistas").select("coins").eq("id", userId).maybeSingle();
  const currentCoins = turista?.coins || 0;
  if (currentCoins < recompensa.coinCost) {
    return res.status(400).json({ error: `Coins insuficientes — você tem ${currentCoins}, essa recompensa custa ${recompensa.coinCost}.` });
  }

  const newResgate: Resgate = {
    id: `rs_${randomUUID()}`,
    turistaId: userId,
    recompensaId,
    pousadaId: recompensa.pousadaId,
    coinCost: recompensa.coinCost,
    code: randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase(),
    status: "pendente",
    createdAt: new Date().toISOString(),
  };

  const { error: insertErr } = await supabase.from("turista_resgates").insert(newResgate);
  if (insertErr) return res.status(500).json({ error: "Erro ao criar resgate." });

  const { error: updateErr } = await supabase.from("turistas").update({ coins: currentCoins - recompensa.coinCost }).eq("id", userId);
  if (updateErr) {
    // Desfaz o resgate se não conseguiu debitar as Coins — não deixa o
    // turista com um código válido sem ter pago por ele.
    await supabase.from("turista_resgates").delete().eq("id", newResgate.id);
    return res.status(500).json({ error: "Erro ao debitar Coins." });
  }

  res.status(201).json(newResgate);
});

app.get("/api/turista/resgates", requireTourist, async (req, res) => {
  const userId = (res.locals.touristUser as { id: string }).id;
  const { data, error } = await supabase.from("turista_resgates").select("*").eq("turistaId", userId).order("createdAt", { ascending: false });
  if (error) return res.status(500).json({ error: "Erro ao buscar resgates." });
  res.json(data);
});

// A pousada confirma presencialmente digitando o código que o turista
// mostrou — assim que usado, o código não vale mais.
app.post("/api/pousadas/:id/resgates/:code/usar", requirePartnerAccess("pousada"), async (req, res) => {
  const { data: resgate } = await supabase
    .from("turista_resgates")
    .select("*")
    .eq("code", req.params.code.toUpperCase())
    .eq("pousadaId", req.params.id)
    .maybeSingle();
  if (!resgate) return res.status(404).json({ error: "Código não encontrado para esta pousada." });
  if (resgate.status !== "pendente") return res.status(400).json({ error: "Este código já foi usado ou cancelado." });

  const { data: updated, error } = await supabase
    .from("turista_resgates")
    .update({ status: "usado", usedAt: new Date().toISOString() })
    .eq("id", resgate.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: "Erro ao confirmar resgate." });
  await logAdminAction(res.locals.actorUser, "redeem", "resgate", resgate.id, `código ${resgate.code}`);
  res.json(updated);
});

// ----------------------------------------------------
// PRODUTOS & CONSUMO — catálogo de itens vendáveis (frigobar, vestuário,
// brindes) por pousada, e o registro de consumo de cada hóspede durante a
// estadia (a "comanda"). Cada produto tem um QR code fixo (gerado a partir
// do próprio id — ver GET /api/produtos/:id/qrcode) que a recepção escaneia
// pra lançar o consumo na reserva certa.
// ----------------------------------------------------

const PRODUTO_FIELDS = ["name", "description", "category", "price", "active"] as const;

app.get("/api/pousadas/:id/produtos", requirePartnerAccess("pousada"), async (req, res) => {
  const { data, error } = await supabase.from("produtos").select("*").eq("pousadaId", req.params.id).order("createdAt", { ascending: false });
  if (error) return res.status(500).json({ error: "Erro ao buscar produtos." });
  res.json(data);
});

app.post("/api/pousadas/:id/produtos", requirePartnerAccess("pousada"), async (req, res) => {
  const price = Number(req.body.price);
  if (!req.body.name || !Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ error: "Informe um nome e um preço válido (maior que zero)." });
  }
  const newProduto = {
    ...pickFields<Produto>(req.body, PRODUTO_FIELDS),
    id: `pr_${randomUUID()}`,
    pousadaId: req.params.id,
    price,
    active: true,
    createdAt: new Date().toISOString(),
  };
  const { error } = await supabase.from("produtos").insert(newProduto);
  if (error) return res.status(500).json({ error: "Erro ao criar produto." });
  await logAdminAction(res.locals.actorUser, "create", "produto", newProduto.id, `${newProduto.name} — R$${price}`);
  res.status(201).json(newProduto);
});

app.put("/api/pousadas/:id/produtos/:produtoId", requirePartnerAccess("pousada"), async (req, res) => {
  const updates = pickFields<Produto>(req.body, PRODUTO_FIELDS);
  const { data, error } = await supabase.from("produtos").update(updates).eq("id", req.params.produtoId).eq("pousadaId", req.params.id).select().single();
  if (error || !data) return res.status(404).json({ error: "Produto não encontrado." });
  res.json(data);
});

app.delete("/api/pousadas/:id/produtos/:produtoId", requirePartnerAccess("pousada"), async (req, res) => {
  const { error } = await supabase.from("produtos").delete().eq("id", req.params.produtoId).eq("pousadaId", req.params.id);
  if (error) return res.status(500).json({ error: "Erro ao excluir produto." });
  res.json({ success: true });
});

// QR code de um produto — encodifica só o id (curto, sem informação
// sensível) direto num PNG em data URL. Não precisa de coluna nem tabela
// própria: o mesmo id do produto sempre gera o mesmo QR.
app.get("/api/produtos/:id/qrcode", requirePartnerAccess("pousada"), async (req, res) => {
  try {
    const dataUrl = await QRCode.toDataURL(req.params.id, { width: 240, margin: 1 });
    res.json({ qrcode: dataUrl });
  } catch (err) {
    log.error("Erro ao gerar QR code do produto:", err);
    res.status(500).json({ error: "Erro ao gerar QR code." });
  }
});

// Reservas ainda não encerradas desta pousada — pra escolher de quem é o
// consumo ao escanear um produto (cobre quem já está hospedado e quem
// ainda vai chegar, não só o dia exato do check-in).
app.get("/api/pousadas/:id/hospedes-ativos", requirePartnerAccess("pousada"), async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("bookings")
    .select("id,customerName,customerEmail,checkIn,checkOut,status")
    .eq("pousadaId", req.params.id)
    .in("status", ["confirmado_total", "confirmado_pousada", "confirmado_guia", "pago"])
    .gte("checkOut", today)
    .order("checkIn", { ascending: true });
  if (error) return res.status(500).json({ error: "Erro ao buscar hóspedes ativos." });
  res.json(data);
});

app.get("/api/pousadas/:id/bookings/:bookingId/consumos", requirePartnerAccess("pousada"), async (req, res) => {
  const { data: booking } = await supabase.from("bookings").select("id,pousadaId").eq("id", req.params.bookingId).maybeSingle();
  if (!booking || booking.pousadaId !== req.params.id) return res.status(404).json({ error: "Reserva não encontrada nesta pousada." });
  const { data, error } = await supabase.from("consumos").select("*").eq("bookingId", req.params.bookingId).order("createdAt", { ascending: false });
  if (error) return res.status(500).json({ error: "Erro ao buscar consumo." });
  res.json(data);
});

app.post("/api/pousadas/:id/bookings/:bookingId/consumos", requirePartnerAccess("pousada"), async (req, res) => {
  const { data: booking } = await supabase.from("bookings").select("id,pousadaId").eq("id", req.params.bookingId).maybeSingle();
  if (!booking || booking.pousadaId !== req.params.id) return res.status(404).json({ error: "Reserva não encontrada nesta pousada." });

  const quantity = Math.max(1, Number(req.body.quantity) || 1);
  const { data: produto } = await supabase.from("produtos").select("*").eq("id", req.body.produtoId).eq("pousadaId", req.params.id).maybeSingle();
  if (!produto || !produto.active) return res.status(404).json({ error: "Produto não encontrado ou inativo." });

  const totalPrice = produto.price * quantity;
  const newConsumo = {
    id: `cs_${randomUUID()}`,
    bookingId: req.params.bookingId,
    pousadaId: req.params.id,
    produtoId: produto.id,
    produtoName: produto.name,
    quantity,
    unitPrice: produto.price,
    totalPrice,
    status: "pendente",
    createdAt: new Date().toISOString(),
  };
  const { error } = await supabase.from("consumos").insert(newConsumo);
  if (error) return res.status(500).json({ error: "Erro ao registrar consumo." });
  await logAdminAction(res.locals.actorUser, "create", "consumo", newConsumo.id, `${quantity}x ${produto.name} — reserva #${req.params.bookingId}`);
  res.status(201).json(newConsumo);
});

app.delete("/api/pousadas/:id/bookings/:bookingId/consumos/:consumoId", requirePartnerAccess("pousada"), async (req, res) => {
  const { error } = await supabase.from("consumos").delete().eq("id", req.params.consumoId).eq("pousadaId", req.params.id).eq("status", "pendente");
  if (error) return res.status(500).json({ error: "Erro ao remover consumo." });
  res.json({ success: true });
});

// Marca todo o consumo pendente da reserva como pago sem passar pelo
// Stripe — mesmo espírito do "Marcar como Paga" já usado em reservas, pra
// fechamentos na recepção em dinheiro/Pix.
app.post("/api/pousadas/:id/bookings/:bookingId/consumos/marcar-pago", requirePartnerAccess("pousada"), async (req, res) => {
  const { data: booking } = await supabase.from("bookings").select("id,pousadaId").eq("id", req.params.bookingId).maybeSingle();
  if (!booking || booking.pousadaId !== req.params.id) return res.status(404).json({ error: "Reserva não encontrada nesta pousada." });
  const { data, error } = await supabase
    .from("consumos")
    .update({ status: "pago" })
    .eq("bookingId", req.params.bookingId)
    .eq("status", "pendente")
    .select();
  if (error) return res.status(500).json({ error: "Erro ao marcar consumo como pago." });
  await logAdminAction(res.locals.actorUser, "update", "consumo", req.params.bookingId, `${(data || []).length} lançamento(s) marcados como pagos`);
  res.json({ success: true, updated: (data || []).length });
});

// Gera um link de pagamento Stripe pro consumo pendente da reserva —
// mesmo padrão de checkout já usado pra reserva, só que como uma cobrança
// separada (não altera o valor nem o status da reserva em si).
app.post("/api/pousadas/:id/bookings/:bookingId/consumos/cobrar", requirePartnerAccess("pousada"), async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe não configurado. Use 'Marcar como Pago' pra fechamentos fora do Stripe." });
  const { data: booking } = await supabase.from("bookings").select("*").eq("id", req.params.bookingId).maybeSingle();
  if (!booking || booking.pousadaId !== req.params.id) return res.status(404).json({ error: "Reserva não encontrada nesta pousada." });

  const { data: pendentes } = await supabase.from("consumos").select("*").eq("bookingId", req.params.bookingId).eq("status", "pendente");
  if (!pendentes || pendentes.length === 0) return res.status(400).json({ error: "Não há consumo pendente pra cobrar." });

  const total = pendentes.reduce((sum: number, c: any) => sum + c.totalPrice, 0);
  const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  const origin = `${protocol}://${req.get("host")}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "brl",
          product_data: { name: `Consumo — ${booking.pousadaName} (${pendentes.length} ${pendentes.length === 1 ? "item" : "itens"})` },
          unit_amount: Math.round(total * 100),
        },
        quantity: 1,
      }],
      customer_email: booking.customerEmail || undefined,
      metadata: { consumoBookingId: booking.id, consumoIds: pendentes.map((c: any) => c.id).join(",") },
      success_url: `${origin}/pagamento-confirmado?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?payment=cancelled`,
    });
    res.json({ url: session.url });
  } catch (err: any) {
    log.error("Erro ao criar sessão de checkout de consumo:", err.message);
    res.status(500).json({ error: "Erro ao criar sessão de pagamento." });
  }
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
  if (req.headers["x-sync-secret"] !== APP_COINS_SYNC_SECRET) {
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

// ROTEIROS CRUD
app.get("/api/roteiros", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("roteiros").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar roteiros" });
  res.json(data);
});

app.post("/api/roteiros", requireAdmin, async (req, res) => {
  const newRoteiro: Roteiro = { ...pickFields<Roteiro>(req.body, ROTEIRO_FIELDS), id: `rt_${randomUUID()}` } as Roteiro;
  const { error } = await supabase.from("roteiros").insert(newRoteiro);
  if (error) {
    log.error("Erro ao salvar roteiro no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar roteiro" });
  }
  await logAdminAction(res.locals.adminUser, "create", "roteiro", newRoteiro.id, newRoteiro.name);
  res.status(201).json(newRoteiro);
});

app.put("/api/roteiros/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Roteiro>(req.body, ROTEIRO_FIELDS);
  const { data, error } = await supabase.from("roteiros").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Roteiro não encontrado" });
  await logAdminAction(res.locals.adminUser, "update", "roteiro", id, data.name);
  res.json(data);
});

app.delete("/api/roteiros/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data: existing } = await supabase.from("roteiros").select("name").eq("id", id).maybeSingle();
  const { error } = await supabase.from("roteiros").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir roteiro" });
  await logAdminAction(res.locals.adminUser, "delete", "roteiro", id, existing?.name || id);
  res.json({ success: true, message: "Roteiro excluído com sucesso" });
});

// RESERVAS (DE ROTEIRO) CRUD
app.get("/api/reservas", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("reservas").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar reservas" });
  res.json(data);
});

app.post("/api/reservas", requireAdmin, async (req, res) => {
  const newReserva: Reserva = { ...pickFields<Reserva>(req.body, RESERVA_FIELDS), id: `rv_${randomUUID()}` } as Reserva;
  const { error } = await supabase.from("reservas").insert(newReserva);
  if (error) {
    log.error("Erro ao salvar reserva no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar reserva" });
  }
  await logAdminAction(res.locals.adminUser, "create", "reserva_roteiro", newReserva.id, `roteiro ${newReserva.roteiroId} — turista ${newReserva.turistaId}`);
  res.status(201).json(newReserva);
});

app.put("/api/reservas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Reserva>(req.body, RESERVA_FIELDS);
  const { data, error } = await supabase.from("reservas").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Reserva não encontrada" });
  await logAdminAction(res.locals.adminUser, "update", "reserva_roteiro", id, `status: ${data.status}`);
  res.json(data);
});

app.delete("/api/reservas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("reservas").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir reserva" });
  await logAdminAction(res.locals.adminUser, "delete", "reserva_roteiro", id, id);
  res.json({ success: true, message: "Reserva excluída com sucesso" });
});

// PAGAMENTOS CRUD
app.get("/api/pagamentos", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("pagamentos").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar pagamentos" });
  res.json(data);
});

app.post("/api/pagamentos", requireAdmin, async (req, res) => {
  const newPagamento: Pagamento = { ...pickFields<Pagamento>(req.body, PAGAMENTO_FIELDS), id: `pg_${randomUUID()}` } as Pagamento;
  const { error } = await supabase.from("pagamentos").insert(newPagamento);
  if (error) {
    log.error("Erro ao salvar pagamento no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar pagamento" });
  }
  await logAdminAction(res.locals.adminUser, "create", "pagamento", newPagamento.id, `R$ ${newPagamento.amount} — reserva ${newPagamento.reservaId}`);
  res.status(201).json(newPagamento);
});

app.put("/api/pagamentos/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Pagamento>(req.body, PAGAMENTO_FIELDS);
  const { data, error } = await supabase.from("pagamentos").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Pagamento não encontrado" });
  await logAdminAction(res.locals.adminUser, "update", "pagamento", id, `status: ${data.status}`);
  res.json(data);
});

app.delete("/api/pagamentos/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("pagamentos").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir pagamento" });
  await logAdminAction(res.locals.adminUser, "delete", "pagamento", id, id);
  res.json({ success: true, message: "Pagamento excluído com sucesso" });
});

// GUIAS (turismo) CRUD — distinta da tabela "guides" (pousadas) já existente
app.get("/api/guias", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("guias").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar guias" });
  res.json(data);
});

app.post("/api/guias", requireAdmin, async (req, res) => {
  const newGuia: GuiaTuristico = { ...pickFields<GuiaTuristico>(req.body, GUIA_TURISTICO_FIELDS), id: `gt_${randomUUID()}` } as GuiaTuristico;
  const { error } = await supabase.from("guias").insert(newGuia);
  if (error) {
    log.error("Erro ao salvar guia no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar guia" });
  }
  await logAdminAction(res.locals.adminUser, "create", "guia_turistico", newGuia.id, newGuia.name);
  res.status(201).json(newGuia);
});

app.put("/api/guias/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<GuiaTuristico>(req.body, GUIA_TURISTICO_FIELDS);
  const { data, error } = await supabase.from("guias").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Guia não encontrado" });
  await logAdminAction(res.locals.adminUser, "update", "guia_turistico", id, data.name);
  res.json(data);
});

app.delete("/api/guias/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data: existing } = await supabase.from("guias").select("name").eq("id", id).maybeSingle();
  const { error } = await supabase.from("guias").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir guia" });
  await logAdminAction(res.locals.adminUser, "delete", "guia_turistico", id, existing?.name || id);
  res.json({ success: true, message: "Guia excluído com sucesso" });
});

// CANDIDATURAS CRUD — cadastro público de parceiros (guias e pousadas)
// GET/PUT/DELETE são usados pelo painel de Gestão; POST é público (formulário /seja-parceiro).
app.get("/api/candidaturas", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("candidaturas").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar candidaturas" });
  res.json(data);
});

// Consulta pública de status por email + token — para o parceiro acompanhar
// a candidatura sem precisar ligar. Exige os dois (não só o email) porque um
// email sozinho é fácil de adivinhar/saber de outra pessoa; o token só o
// próprio candidato recebe, na hora em que envia o formulário. Só devolve os
// campos necessários pra mostrar o status — nunca telefone/mensagem/email,
// mesmo pra quem acertar o par certo.
app.get("/api/candidaturas/status", async (req, res) => {
  const email = String(req.query.email || "").trim().toLowerCase();
  const token = String(req.query.token || "").trim();
  if (!email || !token) {
    return res.status(400).json({ error: "Informe o email e o código de acompanhamento enviados na confirmação do cadastro." });
  }
  // ilike with no wildcards = exact match, case-insensitive
  const { data, error } = await supabase
    .from("candidaturas")
    .select("id,type,status,dateCreated,name,pousadaName")
    .ilike("email", email)
    .eq("statusToken", token);
  if (error) return res.status(500).json({ error: "Erro ao buscar candidatura" });
  res.json(data);
});

const CANDIDATURA_PUBLIC_FIELDS = ["type", "name", "email", "phone", "message", "languages", "availability", "age", "experienceYears", "specialty", "pousadaName", "location", "capacity", "atracaoName", "atracaoType"] as const;

app.post("/api/candidaturas", publicFormLimiter, async (req, res) => {
  const { recaptchaToken, ...body } = req.body;
  if (!(await verifyRecaptcha(recaptchaToken))) {
    return res.status(400).json({ error: "Falha na verificação de segurança. Recarregue a página e tente novamente." });
  }

  // Server-controlled fields go last so a malicious body can't override them
  // (e.g. submitting status: "aprovado" directly, or a chosen statusToken).
  const newCandidatura: Candidatura = {
    ...pickFields<Candidatura>(body, CANDIDATURA_PUBLIC_FIELDS),
    id: `cand_${randomUUID()}`,
    status: "pendente",
    dateCreated: new Date().toISOString(),
    statusToken: randomUUID(),
  } as Candidatura;

  let { error } = await supabase.from("candidaturas").insert(newCandidatura);
  // Degrades gracefully if scripts/add-candidatura-status-token.sql hasn't
  // been run yet — the submission itself must not break just because the
  // status-token column doesn't exist in the DB yet (status lookup by
  // email+token just won't work for this one until the column is added and
  // it's resubmitted, which is a much smaller problem than losing candidates).
  if (error?.message?.includes("statusToken")) {
    const { statusToken, ...withoutToken } = newCandidatura as any;
    ({ error } = await supabase.from("candidaturas").insert(withoutToken));
  }
  if (error) {
    log.error("Erro ao salvar candidatura no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar candidatura" });
  }

  const label = newCandidatura.type === "pousada"
    ? `Nova candidatura de pousada: ${newCandidatura.pousadaName || newCandidatura.name}`
    : newCandidatura.type === "atracao"
    ? `Nova candidatura de atração: ${newCandidatura.atracaoName || newCandidatura.name}`
    : `Nova candidatura de guia: ${newCandidatura.name}`;
  addNotification("admin", label, "status_update");

  res.status(201).json(newCandidatura);
});

// Only "status" is ever editable from the admin panel (triage: pendente →
// contatado/aprovado/rejeitado) — applicant-submitted fields (name, email,
// message, etc.) are read-only here on purpose, so an admin session can't be
// used to rewrite what a candidate actually submitted.
app.put("/api/candidaturas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Candidatura>(req.body, ["status"]);
  const { data, error } = await supabase.from("candidaturas").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Candidatura não encontrada" });
  await logAdminAction(res.locals.adminUser, "update_status", "candidatura", id, `${data.name} — ${data.status}`);
  res.json(data);
});

app.delete("/api/candidaturas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data: existing } = await supabase.from("candidaturas").select("name").eq("id", id).maybeSingle();
  const { error } = await supabase.from("candidaturas").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir candidatura" });
  await logAdminAction(res.locals.adminUser, "delete", "candidatura", id, existing?.name || id);
  res.json({ success: true, message: "Candidatura excluída com sucesso" });
});

// REFERRAL SOURCES — pesquisa "como você chegou até nós?" no primeiro acesso.
// POST é público (qualquer visitante responde); GET é admin-only (estatísticas).
const REFERRAL_SOURCE_FIELDS = ["source", "otherText"] as const;

app.post("/api/referral-sources", publicFormLimiter, async (req, res) => {
  const newSource: ReferralSource = {
    ...pickFields<ReferralSource>(req.body, REFERRAL_SOURCE_FIELDS),
    id: `ref_${randomUUID()}`,
    timestamp: new Date().toISOString(),
  } as ReferralSource;
  // referral_sources may not exist (see scripts/add-referral-sources-table.sql)
  // — this endpoint's only caller in the frontend was already removed, so it
  // degrades gracefully instead of erroring if the table isn't there.
  try {
    const { error } = await supabase.from("referral_sources").insert(newSource);
    if (error) log.warn("Erro ao salvar origem do visitante no Supabase:", error.message);
  } catch (err: any) {
    log.warn("Erro ao salvar origem do visitante no Supabase:", err.message);
  }
  res.status(201).json(newSource);
});

app.get("/api/referral-sources", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("referral_sources").select("*");
  if (error) return res.json([]);
  res.json(data);
});

// ----------------------------------------------------
// ADMIN USER MANAGEMENT (Supabase Auth)
// ----------------------------------------------------

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — gestão de administradores indisponível." });
  const { data, error } = await supabaseAdminAuth.auth.admin.listUsers({ perPage: 200 });
  if (error || !data?.users) return res.status(500).json({ error: "Erro ao listar administradores." });
  const admins = data.users
    .filter((u: any) => isAdminUser(u))
    .map((u: any) => ({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at || null,
      isChief: u.app_metadata?.isChief === true,
    }));
  res.json(admins);
});

// ----------------------------------------------------
// ADMIN GOVERNANCE — propostas + votação dos 3 admins-chefe
//
// Conceder acesso de admin deixou de ser uma ação unilateral: qualquer admin
// pode propor um email (grant) ou propor remover o acesso de outro admin
// (revoke) via POST /api/admin/proposals — mas isso só se efetiva com os
// votos dos 3 admins-chefe (app_metadata.isChief === true, marcado só via
// scripts/set-chief-admins.ts). Concessão exige unanimidade (3/3); revogação
// exige maioria (2/3). Um "não" de qualquer chefe já rejeita uma proposta de
// concessão na hora — não faz sentido esperar unanimidade que já ficou
// impossível.
// ----------------------------------------------------

const REQUIRED_YES_VOTES: Record<"grant" | "revoke", number> = { grant: 3, revoke: 2 };

// Concede admin — se o email já tem conta (ex: um guia ou turista que também
// vai virar admin), só ACRESCENTA isAdmin=true ao app_metadata existente,
// nunca substitui: o papel de turista/parceiro que a conta já tinha continua
// intacto. Se não existir conta, cria uma nova (sem role nenhum, só admin).
async function finalizeGrantAdmin(email: string): Promise<{ ok: boolean; message?: string; actionLink?: string | null }> {
  if (!supabaseAdminAuth) return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY não configurada." };

  const { data: existing, error: listErr } = await supabaseAdminAuth.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) return { ok: false, message: describeAuthError(listErr, "Erro ao verificar contas existentes.") };
  const match = existing?.users?.find((u: any) => u.email?.toLowerCase() === email);

  let userId: string;
  if (match) {
    const mergedMetadata = { ...(match.app_metadata || {}), isAdmin: true };
    const { error } = await supabaseAdminAuth.auth.admin.updateUserById(match.id, { app_metadata: mergedMetadata });
    if (error) return { ok: false, message: describeAuthError(error, "Erro ao conceder acesso de administrador.") };
    userId = match.id;
  } else {
    const { data: created, error: createErr } = await supabaseAdminAuth.auth.admin.createUser({
      email,
      password: randomUUID(),
      email_confirm: true,
      app_metadata: { isAdmin: true },
    });
    if (createErr || !created.user) return { ok: false, message: describeAuthError(createErr, "Erro ao criar administrador.") };
    userId = created.user.id;
  }

  // Link de recuperação pra pessoa definir a própria senha — sem
  // redirectTo explícito o Supabase usa a "Site URL" do painel, que pode
  // estar apontando pra localhost num projeto mal configurado.
  const { data: linkData, error: linkErr } = await supabaseAdminAuth.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${SITE_URL}/parceiro` },
  });
  if (linkErr) log.warn(`Admin ${email} criado/promovido, mas falha ao gerar link de acesso:`, linkErr.message);
  return { ok: true, actionLink: linkData?.properties?.action_link || null };
}

// Revoga só a chave isAdmin (e isChief, por segurança — ninguém fica chefe
// sem ser admin) do app_metadata — qualquer outro papel (turista, parceiro)
// que a conta tenha continua intacto.
async function finalizeRevokeAdmin(userId: string | null): Promise<{ ok: boolean; message?: string }> {
  if (!supabaseAdminAuth) return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY não configurada." };
  if (!userId) return { ok: false, message: "Administrador não identificado." };
  const { data: existing, error: listErr } = await supabaseAdminAuth.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) return { ok: false, message: describeAuthError(listErr, "Erro ao verificar contas existentes.") };
  const match = existing?.users?.find((u: any) => u.id === userId);
  if (!match) return { ok: false, message: "Administrador não encontrado." };

  const remainingMetadata: Record<string, unknown> = { ...(match.app_metadata || {}) };
  delete remainingMetadata.isAdmin;
  delete remainingMetadata.isChief;
  if (remainingMetadata.role === "admin") delete remainingMetadata.role;

  const { error } = await supabaseAdminAuth.auth.admin.updateUserById(userId, { app_metadata: remainingMetadata });
  if (error) return { ok: false, message: describeAuthError(error, "Erro ao revogar acesso de administrador.") };
  return { ok: true };
}

// Lista as propostas (mais recentes primeiro) junto com os votos já
// registrados em cada uma — qualquer admin vê o andamento, mas só um chefe
// consegue de fato votar (POST .../vote, abaixo, usa requireChief).
app.get("/api/admin/proposals", requireAdmin, async (req, res) => {
  const { data: proposals, error } = await supabase
    .from("admin_invite_proposals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ error: "Erro ao buscar propostas de administrador." });

  const ids = (proposals || []).map((p: any) => p.id);
  const { data: votes } = ids.length
    ? await supabase.from("admin_invite_votes").select("*").in("proposal_id", ids)
    : { data: [] as any[] };

  const withVotes = (proposals || []).map((p: any) => ({
    ...p,
    votes: (votes || []).filter((v: any) => v.proposal_id === p.id),
  }));
  res.json(withVotes);
});

app.post("/api/admin/proposals", requireAdmin, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — governança de administradores indisponível." });
  const actor = res.locals.adminUser as { id: string; email?: string };
  const action = req.body.action === "revoke" ? "revoke" : "grant";

  if (action === "grant") {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Informe um email válido." });
    }
    const { data: existingUsers } = await supabaseAdminAuth.auth.admin.listUsers({ perPage: 1000 });
    const match = existingUsers?.users?.find((u: any) => u.email?.toLowerCase() === email);
    if (match && isAdminUser(match)) {
      return res.status(400).json({ error: "Este email já tem acesso de administrador." });
    }
    const { data: pending } = await supabase
      .from("admin_invite_proposals")
      .select("id")
      .eq("email", email)
      .eq("action", "grant")
      .eq("status", "pending");
    if (pending && pending.length > 0) {
      return res.status(400).json({ error: "Já existe uma proposta pendente de concessão para este email." });
    }

    const proposal = {
      id: `prop_${randomUUID()}`,
      email,
      action: "grant",
      target_user_id: null,
      proposed_by_id: actor.id,
      proposed_by_email: actor.email || "",
      status: "pending",
    };
    const { error } = await supabase.from("admin_invite_proposals").insert(proposal);
    if (error) return res.status(500).json({ error: "Erro ao criar proposta." });
    await logAdminAction(actor, "propose_grant_admin", "admin_proposal", proposal.id, email);
    return res.status(201).json(proposal);
  }

  // action === "revoke"
  const targetUserId = String(req.body.targetUserId || "");
  if (!targetUserId) return res.status(400).json({ error: "Informe o administrador a ser removido." });
  const { data: existingUsers } = await supabaseAdminAuth.auth.admin.listUsers({ perPage: 1000 });
  const match = existingUsers?.users?.find((u: any) => u.id === targetUserId);
  if (!match || !isAdminUser(match)) {
    return res.status(404).json({ error: "Administrador não encontrado." });
  }
  const { data: pending } = await supabase
    .from("admin_invite_proposals")
    .select("id")
    .eq("target_user_id", targetUserId)
    .eq("action", "revoke")
    .eq("status", "pending");
  if (pending && pending.length > 0) {
    return res.status(400).json({ error: "Já existe uma proposta pendente para remover este administrador." });
  }

  const proposal = {
    id: `prop_${randomUUID()}`,
    email: match.email,
    action: "revoke",
    target_user_id: targetUserId,
    proposed_by_id: actor.id,
    proposed_by_email: actor.email || "",
    status: "pending",
  };
  const { error } = await supabase.from("admin_invite_proposals").insert(proposal);
  if (error) return res.status(500).json({ error: "Erro ao criar proposta." });
  await logAdminAction(actor, "propose_revoke_admin", "admin_proposal", proposal.id, match.email);
  res.status(201).json(proposal);
});

app.post("/api/admin/proposals/:id/vote", requireChief, async (req, res) => {
  const chief = res.locals.chiefUser as { id: string; email?: string };
  const approve = req.body.approve === true;
  const { id } = req.params;

  const { data: proposal, error: fetchErr } = await supabase
    .from("admin_invite_proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !proposal) return res.status(404).json({ error: "Proposta não encontrada." });
  if (proposal.status !== "pending") return res.status(400).json({ error: "Esta proposta já foi resolvida." });

  const { error: voteErr } = await supabase
    .from("admin_invite_votes")
    .upsert(
      { proposal_id: id, chief_id: chief.id, chief_email: chief.email || "", approve },
      { onConflict: "proposal_id,chief_id" }
    );
  if (voteErr) return res.status(500).json({ error: "Erro ao registrar voto." });
  await logAdminAction(chief, approve ? "vote_approve" : "vote_reject", "admin_proposal", id, proposal.email);

  if (!approve) {
    await supabase.from("admin_invite_proposals").update({ status: "rejected", resolved_at: new Date().toISOString() }).eq("id", id);
    return res.json({ status: "rejected" });
  }

  const { data: votes } = await supabase.from("admin_invite_votes").select("*").eq("proposal_id", id);
  const yesVotes = (votes || []).filter((v: any) => v.approve).length;
  const required = REQUIRED_YES_VOTES[proposal.action as "grant" | "revoke"];

  if (yesVotes < required) {
    return res.json({ status: "pending", yesVotes, required });
  }

  const result = proposal.action === "grant"
    ? await finalizeGrantAdmin(proposal.email)
    : await finalizeRevokeAdmin(proposal.target_user_id);

  await supabase
    .from("admin_invite_proposals")
    .update({
      status: result.ok ? "approved" : "rejected",
      result_message: result.ok ? null : result.message || null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (result.ok) {
    await logAdminAction(chief, proposal.action === "grant" ? "grant_admin" : "revoke_admin", "admin", proposal.target_user_id || null, proposal.email);
  }

  res.json({
    status: result.ok ? "approved" : "error",
    actionLink: result.ok ? (result as { actionLink?: string | null }).actionLink || null : null,
    error: result.ok ? null : result.message,
  });
});

// Cancela uma proposta ainda pendente — qualquer admin pode cancelar (não só
// quem propôs ou os chefes), já que a votação em si é o que precisa de
// governança forte; desistir de uma proposta não concede nada a ninguém.
app.delete("/api/admin/proposals/:id", requireAdmin, async (req, res) => {
  const actor = res.locals.adminUser as { id: string; email?: string };
  const { data: proposal } = await supabase.from("admin_invite_proposals").select("*").eq("id", req.params.id).maybeSingle();
  if (!proposal) return res.status(404).json({ error: "Proposta não encontrada." });
  if (proposal.status !== "pending") return res.status(400).json({ error: "Esta proposta já foi resolvida." });
  const { error } = await supabase
    .from("admin_invite_proposals")
    .update({ status: "cancelled", resolved_at: new Date().toISOString() })
    .eq("id", req.params.id);
  if (error) return res.status(500).json({ error: "Erro ao cancelar proposta." });
  await logAdminAction(actor, "cancel_admin_proposal", "admin_proposal", req.params.id, proposal.email);
  res.json({ success: true });
});

// Log de auditoria — toda ação administrativa registrada por logAdminAction
// (criar/editar/excluir conteúdo, aprovar candidatura, votar/conceder/
// revogar admin...), visível para qualquer admin autenticado.
app.get("/api/admin/audit-log", requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return res.status(500).json({ error: "Erro ao buscar log de auditoria." });
  res.json(data);
});

// ----------------------------------------------------
// PARTNER SELF-SERVICE ACCESS (Supabase Auth)
// Lets a pousada/atração/guia log in and edit only their own profile — see
// requirePartnerAccess above for the ownership check every partner-editable
// route enforces. Invite/list/revoke here are admin-only (same
// service_role-backed pattern as ADMIN USER MANAGEMENT above); the partner
// never sets their own app_metadata, so they can't grant themselves access
// to a different record.
// ----------------------------------------------------

const PARTNER_TABLE_BY_TYPE: Record<PartnerType, string> = {
  pousada: "pousadas",
  atracao: "atracoes",
  guia: "guides",
};

app.get("/api/partners/:type/:id/access", requireAdmin, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — gestão de acesso de parceiros indisponível." });
  const partnerType = req.params.type as PartnerType;
  if (!PARTNER_TABLE_BY_TYPE[partnerType]) return res.status(400).json({ error: "Tipo de parceiro inválido." });
  const { id } = req.params;

  const { data, error } = await supabaseAdminAuth.auth.admin.listUsers({ perPage: 200 });
  if (error || !data?.users) return res.status(500).json({ error: "Erro ao listar acessos." });
  const linked = data.users
    .filter((u: any) => u.app_metadata?.role === "partner" && u.app_metadata?.partnerType === partnerType && u.app_metadata?.partnerId === id)
    .map((u: any) => ({ id: u.id, email: u.email, createdAt: u.created_at, lastSignInAt: u.last_sign_in_at || null }));
  res.json(linked);
});

// Creates (or re-links, if the email already has an account) a Supabase
// Auth user and gets them access as fast as possible.
//
// This used to call inviteUserByEmail first — the one admin API call that
// both creates the user AND emails them via Supabase's own mail sending —
// but that makes account creation and email delivery a single atomic step:
// when Supabase's mail sending hits its (tight, shared-tier) rate limit, the
// WHOLE call fails and no account gets created at all, leaving the partner
// record with no login and no link an admin could even hand out manually
// (see the "Erro ao criar acesso" dead end this used to produce). Splitting
// "create the account" from "get a link for it" — createUser, which never
// triggers Supabase's own email, followed by generateLink — means a mail
// hiccup can only ever affect whether the email arrives automatically, never
// whether the account and its recovery link exist at all.
// app_metadata (the actual role/partnerId authorization) has to be set in a
// second call either way since createUser doesn't accept it directly.
// Supabase's admin SDK sometimes surfaces a failure with no usable
// `.message` (just an empty error body, which JSON.stringify turns into the
// literal text "{}") — most often when an internal Supabase-side rate limit
// or quota was hit, not something our own request did wrong. Showing that
// raw "{}" to an admin is useless, so this falls back to a message that at
// least points at the real likely cause.
function describeAuthError(err: any, fallback: string): string {
  const msg = err?.message;
  return typeof msg === "string" && msg.trim() && msg.trim() !== "{}" ? msg : fallback;
}

async function provisionPartnerLogin(
  email: string,
  appMetadata: Record<string, unknown>
): Promise<{ userId: string | null; actionLink: string | null; emailSent: boolean; error?: string }> {
  if (!supabaseAdminAuth) return { userId: null, actionLink: null, emailSent: false, error: "SUPABASE_SERVICE_ROLE_KEY não configurada." };

  let userId: string | null = null;

  const { data: created, error: createErr } = await supabaseAdminAuth.auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
  });
  if (created?.user) {
    userId = created.user.id;
  } else {
    // createUser refuses to touch an email that already has an account
    // (e.g. re-inviting after a revoke, or applying twice) — look them up
    // instead of treating that as a hard failure.
    const { data: existing, error: listErr } = await supabaseAdminAuth.auth.admin.listUsers({ perPage: 1000 });
    const match = existing?.users?.find((u: any) => u.email?.toLowerCase() === email);
    if (!match) {
      return {
        userId: null,
        actionLink: null,
        emailSent: false,
        error: describeAuthError(createErr, describeAuthError(listErr, "Erro ao criar acesso — o Supabase recusou a operação sem detalhar o motivo. Provavelmente um limite temporário da API do Supabase; tente de novo em alguns minutos ou convide manualmente pela ficha do parceiro.")),
      };
    }

    // This account already has SOME role — only proceed if it's the exact
    // same association we're about to (re)grant. Otherwise this would
    // silently strip an existing admin's access, or move a partner account
    // from whatever record they already manage onto a different one, just
    // because someone reused their email on a second invite/candidatura.
    const existingMeta = match.app_metadata || {};
    const isSameGrant = Object.entries(appMetadata).every(([k, v]) => existingMeta[k] === v);
    if (existingMeta.role && !isSameGrant) {
      return {
        userId: null,
        actionLink: null,
        emailSent: false,
        error: `Este email já tem uma conta com outro acesso (${existingMeta.role === "admin" ? "administrador" : `parceiro de ${existingMeta.partnerType || "outro registro"}`}). Revogue o acesso atual antes de reatribuí-lo, ou use outro email.`,
      };
    }
    userId = match.id;
  }

  const { error: updateErr } = await supabaseAdminAuth.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
  if (updateErr) {
    return {
      userId,
      actionLink: null,
      emailSent: false,
      error: describeAuthError(updateErr, "Erro ao vincular o acesso — o Supabase recusou a operação sem detalhar o motivo. Provavelmente um limite temporário da API do Supabase; tente de novo em alguns minutos ou convide manualmente pela ficha do parceiro."),
    };
  }

  // Same reasoning as the admin-invite recovery link above: without an
  // explicit redirectTo this falls back to the Supabase project's "Site
  // URL" setting, which sends the partner to whatever's configured there
  // (a dead localhost link if that was never updated past local dev)
  // instead of the real /parceiro portal.
  const { data: linkData, error: linkErr } = await supabaseAdminAuth.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${SITE_URL}/parceiro` },
  });
  if (linkErr) log.warn("Acesso criado, mas falha ao gerar link de apoio:", linkErr.message);
  const actionLink = linkData?.properties?.action_link || null;

  // Send the link ourselves via Resend (already configured for booking
  // confirmations) instead of relying on Supabase's own rate-limited mail
  // sending. Best-effort: emailSent just stays false — never treated as an
  // error — if Resend isn't configured or the send itself fails, since
  // actionLink is always returned above as a manual fallback either way.
  let emailSent = false;
  if (resend && actionLink) {
    try {
      await resend.emails.send({
        from: "EcoSafari Brasil <onboarding@resend.dev>",
        to: email,
        subject: "Seu acesso de parceiro EcoSafari",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #2D4635;">Bem-vindo(a) à EcoSafari! 🌿</h2>
            <p>Seu acesso ao portal do parceiro foi criado. Clique no link abaixo para definir sua senha e acessar seu perfil:</p>
            <p><a href="${actionLink}" style="display:inline-block; background:#2D4635; color:#fff; padding:10px 20px; text-decoration:none; border-radius:4px;">Definir senha e acessar</a></p>
            <p style="color: #888; font-size: 12px;">Se o botão não funcionar, copie e cole este link no navegador:<br/>${actionLink}</p>
          </div>
        `,
      });
      emailSent = true;
    } catch (err: any) {
      log.warn("Acesso criado, mas falha ao enviar email via Resend:", err.message);
    }
  }

  return { userId, actionLink, emailSent };
}

app.post("/api/partners/invite", requireAdmin, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — convite de parceiro indisponível." });
  const email = String(req.body.email || "").trim().toLowerCase();
  const partnerType = req.body.partnerType as PartnerType;
  const partnerId = String(req.body.partnerId || "");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Informe um email válido." });
  }
  const table = PARTNER_TABLE_BY_TYPE[partnerType];
  if (!table || !partnerId) {
    return res.status(400).json({ error: "Informe o tipo e o id do parceiro." });
  }

  // Confirm the target record actually exists before linking an account to
  // it — otherwise a typo'd id would silently create dead-end access.
  const { data: target } = await supabase.from(table).select("id").eq("id", partnerId).maybeSingle();
  if (!target) return res.status(404).json({ error: "Parceiro não encontrado." });

  const result = await provisionPartnerLogin(email, { role: "partner", partnerType, partnerId });
  if (result.error) return res.status(400).json({ error: result.error });

  await logAdminAction(res.locals.adminUser, "invite_partner", "partner_access", partnerId, `${email} — ${partnerType}`);

  res.status(201).json({
    user: { id: result.userId, email },
    actionLink: result.actionLink,
    emailSent: result.emailSent,
  });
});

// Turns a candidatura into an actual partner in one step: creates the
// pousada/guides/atracoes row from what the applicant submitted, then
// creates their partner login (same recovery-link pattern as
// POST /api/partners/invite above) — collapsing what used to be 3 manual
// admin actions (approve status → create record by hand → invite access by
// hand) into one. The new record is intentionally unverified/indisponível
// (not a public "trust badge" yet) since nothing here has been vetted
// beyond what the candidate typed into a public form — the partner (or an
// admin) fills in photos/pricing/etc. via the self-service portal before
// it's flagged as verified.
app.post("/api/candidaturas/:id/approve", requireAdmin, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — aprovação com criação de acesso indisponível." });
  const { id } = req.params;

  const { data: candidatura, error: fetchErr } = await supabase.from("candidaturas").select("*").eq("id", id).maybeSingle();
  if (fetchErr || !candidatura) return res.status(404).json({ error: "Candidatura não encontrada." });
  if (candidatura.partnerId) return res.status(400).json({ error: "Esta candidatura já foi aprovada e virou um parceiro." });

  const email = String(candidatura.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Candidatura sem um email válido — não é possível criar o acesso do parceiro." });
  }

  const partnerType = candidatura.type as PartnerType;
  const table = PARTNER_TABLE_BY_TYPE[partnerType];
  if (!table) return res.status(400).json({ error: "Tipo de candidatura desconhecido." });

  let newRecord: Record<string, any>;
  if (partnerType === "guia") {
    newRecord = {
      id: `g_${randomUUID()}`,
      name: candidatura.name,
      email,
      phone: candidatura.phone || "",
      languages: splitCommaList(candidatura.languages).map(language => ({ language, level: "intermediario" as const })),
      specialty: splitCommaList(candidatura.specialty),
      status: "indisponivel",
      bio: candidatura.message || undefined,
      age: candidatura.age || undefined,
    };
  } else if (partnerType === "pousada") {
    newRecord = {
      id: `p_${randomUUID()}`,
      name: candidatura.pousadaName || candidatura.name,
      description: candidatura.message || "Nova pousada parceira EcoSafari — perfil em preparação.",
      location: candidatura.location || "",
      pricePerNight: 0,
      images: [],
      features: [],
      activities: [],
      experiences: [],
      capacity: candidatura.capacity || 1,
      verified: false,
      viewCount: 0,
    };
  } else {
    newRecord = {
      id: `at_${randomUUID()}`,
      type: candidatura.atracaoType === "restaurante" ? "restaurante" : "parada_legal",
      name: candidatura.atracaoName || candidatura.name,
      description: candidatura.message || "Nova atração parceira EcoSafari — perfil em preparação.",
      location: candidatura.location || "",
      images: [],
      rating: 0,
      verified: false,
      dateCreated: new Date().toISOString(),
    };
  }

  const { error: insertErr } = await supabase.from(table).insert(newRecord);
  if (insertErr) {
    log.error(`Erro ao criar parceiro (${table}) a partir da candidatura:`, insertErr.message);
    return res.status(500).json({ error: "Erro ao criar o registro do parceiro." });
  }

  // The partner record was already created successfully above — a login
  // failure here (e.g. Supabase Auth hiccup) shouldn't be reported as a hard
  // failure, since an admin can still invite access manually from the new
  // record's own "Acesso de parceiro" panel.
  const loginResult = await provisionPartnerLogin(email, { role: "partner", partnerType, partnerId: newRecord.id });
  if (loginResult.error) log.warn("Registro do parceiro criado, mas falha ao criar login:", loginResult.error);

  const { data: updatedCandidatura, error: updateErr } = await supabase
    .from("candidaturas")
    .update({ status: "aprovado", partnerId: newRecord.id })
    .eq("id", id)
    .select()
    .single();
  if (updateErr) log.warn("Parceiro criado, mas falha ao marcar candidatura como aprovada:", updateErr.message);

  await logAdminAction(res.locals.adminUser, "approve", "candidatura", id, `${candidatura.name} → ${partnerType} ${newRecord.id}`);

  res.status(201).json({
    candidatura: updatedCandidatura || { ...candidatura, status: "aprovado", partnerId: newRecord.id },
    partnerType,
    partnerId: newRecord.id,
    actionLink: loginResult.actionLink,
    loginCreated: !loginResult.error,
    emailSent: loginResult.emailSent,
    // Surfaced in the admin UI instead of only console.warn — otherwise the
    // only way to see *why* login provisioning failed is digging through
    // Vercel function logs, which isn't realistic for day-to-day triage.
    loginError: loginResult.error,
  });
});

app.delete("/api/partners/access/:userId", requireAdmin, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — gestão de acesso de parceiros indisponível." });
  // Remove só o papel de parceiro (role/partnerType/partnerId) — preserva
  // qualquer isAdmin/isChief que essa mesma conta também tenha, em vez de
  // substituir o app_metadata inteiro (o que apagaria acesso de admin junto).
  const { data: existing, error: fetchErr } = await supabaseAdminAuth.auth.admin.getUserById(req.params.userId);
  if (fetchErr || !existing?.user) return res.status(404).json({ error: "Usuário não encontrado." });
  const remainingMetadata: Record<string, unknown> = { ...(existing.user.app_metadata || {}) };
  delete remainingMetadata.role;
  delete remainingMetadata.partnerType;
  delete remainingMetadata.partnerId;
  const { error } = await supabaseAdminAuth.auth.admin.updateUserById(req.params.userId, { app_metadata: remainingMetadata });
  if (error) return res.status(500).json({ error: "Erro ao revogar acesso." });
  await logAdminAction(res.locals.adminUser, "revoke_partner_access", "partner_access", req.params.userId, existing.user.email || req.params.userId);
  res.json({ success: true });
});

// Lets a logged-in partner fetch their own record without needing to know
// their own id up front — the dashboard just calls this and renders
// whichever of pousada/atracao/guia comes back.
app.get("/api/my-partner-profile", authLimiter, async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Autenticação necessária." });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "Token inválido." });

  const partnerType = data.user.app_metadata?.partnerType as PartnerType | undefined;
  const partnerId = data.user.app_metadata?.partnerId as string | undefined;
  if (data.user.app_metadata?.role !== "partner" || !partnerType || !partnerId) {
    return res.status(403).json({ error: "Esta conta não tem um perfil de parceiro vinculado." });
  }

  const table = PARTNER_TABLE_BY_TYPE[partnerType];
  const { data: row, error: rowErr } = await supabase.from(table).select("*").eq("id", partnerId).maybeSingle();
  if (rowErr || !row) return res.status(404).json({ error: "Perfil de parceiro não encontrado." });

  const mapped =
    partnerType === "pousada" ? mapPousadaRow(row) :
    partnerType === "atracao" ? mapAtracaoRow(row) :
    mapGuideRow(row);

  res.json({
    partnerType,
    partnerId,
    [partnerType === "pousada" ? "pousada" : partnerType === "atracao" ? "atracao" : "guia"]: mapped,
  });
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

// Guards against a known failure mode: a stale/duplicate deployment of an
// older build (e.g. one left running from before this app moved off
// hardcoded demo data) can still write its old seed rows straight into the
// shared Supabase database, independent of anything this deployment does.
// The old demo dataset used short sequential ids ("1".."7" for pousadas,
// "b1"/"b2", "r1".."r3", etc.) that this codebase hasn't generated since
// switching to crypto.randomUUID()-based ids — so any row with one of these
// exact ids appearing again is a reliable signal that something else is
// still seeding fake data, not a false positive from real usage.
const KNOWN_FAKE_IDS: Record<string, string[]> = {
  pousadas: ["1", "2", "3", "4", "5", "6", "7"],
  guides: ["g1", "g2", "g3", "g4"],
  guias: ["gt1", "gt2", "gt3"],
  bookings: ["b1", "b2"],
  reviews: ["r1", "r2", "r3"],
  turistas: ["t1", "t2"],
  roteiros: ["rt1", "rt2", "rt3"],
  reservas: ["rv1", "rv2"],
  pagamentos: ["pg1", "pg2"],
  notifications: ["n1", "n2"],
};

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

// ----------------------------------------------------
// INTELLIGENT WHATSAPP CHAT BOT (GEMINI ENGINE)
// ----------------------------------------------------

// Formats listings dynamically for the LLM to read
async function getPousadasContext() {
  const { data } = await supabase.from("pousadas").select("*");
  return (data || []).map(mapPousadaRow).map(p => {
    return `- ID: "${p.id}", Nome: "${p.name}", Localização: "${p.location}", Preço/noite: R$ ${p.pricePerNight}, Capacidade: ${p.capacity} hóspedes. Experiências: [${p.experiences.map(e => `${e.title}: R$ ${e.price}`).join(", ")}]. Características: [${p.features.join(", ")}].`;
  }).join("\n");
}

// Só guias disponíveis — não faz sentido a IA recomendar alguém que não pode
// atender agora. Dados já eram públicos (o mesmo catálogo de /api/guides/public),
// só reaproveitados aqui pra deixar a Sofia sugerir o guia certo pelo
// idioma/especialidade/interesse em vez de sempre responder de forma genérica.
async function getGuidesContext() {
  const { data } = await supabase.from("guides").select("*");
  return (data || [])
    .map(mapGuideRow)
    .filter(g => g.status === "disponivel")
    .map(g => {
      const languages = g.languages.map(l => l.language).join(", ") || "não informado";
      const interests = [...g.specialty, ...(g.interests || [])].join(", ") || "não informado";
      return `- ID: "${g.id}", Nome: "${g.name}", Idiomas: [${languages}], Especialidades/temas: [${interests}].`;
    }).join("\n");
}

const AGENCY_WHATSAPP = "+55 65 99986-8334";

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
        model: "gemini-2.5-flash",
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

// ----------------------------------------------------
// SERVING FRONTEND VITE APP
// ----------------------------------------------------

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Injects pousada-specific <title>/description/Open Graph tags into the served
// index.html, so link previews on WhatsApp/Facebook/etc show the right pousada
// (those crawlers don't run JS, so client-side title updates alone don't work).
function injectPousadaMeta(html: string, pousada: Pousada): string {
  const title = `${pousada.name} — EcoSafari Brasil`;
  const description = (pousada.description || "Conheça esta pousada parceira da EcoSafari Brasil.").slice(0, 200);
  const image = (pousada.images && pousada.images[0]) || "/species/onca-pintada.png";

  return html
    .replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content=".*?"\s*\/>/, `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace(/<meta property="og:title" content=".*?"\s*\/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`)
    .replace(/<meta property="og:description" content=".*?"\s*\/>/, `<meta property="og:description" content="${escapeHtml(description)}" />`)
    .replace(/<meta property="og:image" content=".*?"\s*\/>/, `<meta property="og:image" content="${escapeHtml(image)}" />`)
    .replace(/<meta name="twitter:title" content=".*?"\s*\/>/, `<meta name="twitter:title" content="${escapeHtml(title)}" />`)
    .replace(/<meta name="twitter:description" content=".*?"\s*\/>/, `<meta name="twitter:description" content="${escapeHtml(description)}" />`)
    .replace(/<meta name="twitter:image" content=".*?"\s*\/>/, `<meta name="twitter:image" content="${escapeHtml(image)}" />`);
}

// SITE_URL: base URL used to build absolute links in the sitemap. Falls back
// to a placeholder — set this env var once the real domain (item 14) is live
// so the sitemap doesn't need a code change.
const SITE_URL = (process.env.SITE_URL || "https://www.ecosafaribrasil.com.br").replace(/\/$/, "");

app.get("/sitemap.xml", async (req, res) => {
  const staticPaths = ["/", "/sobre", "/faq", "/privacidade", "/termos", "/seja-parceiro"];
  const { data: pousadaRows } = await supabase.from("pousadas").select("id,name");
  const urls = [
    ...staticPaths.map(p => `${SITE_URL}${p}`),
    ...(pousadaRows || []).flatMap(p => [`${SITE_URL}/pousadas/${p.id}`, `${SITE_URL}/site/${slugify(p.name)}`]),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(u => `  <url><loc>${u}</loc></url>`)
    .join("\n")}\n</urlset>`;
  res.setHeader("Content-Type", "application/xml");
  res.send(xml);
});

// Registered at module scope (not inside startLocalServer) so these also run
// as a Vercel serverless function, where app.listen() never executes and the
// static/SPA-fallback branch below is handled by Vercel's CDN + vercel.json
// rewrites instead. Intercepts requests that match a real pousada id/slug —
// anything else (e.g. static files under /pousadas/*.png) falls through via
// next() to the static/Vite middleware (local) or Vercel's own static
// handling (production), which always takes priority over rewrites.
app.get('/pousadas/:id', async (req, res, next) => {
  try {
    const { data: pousadaRow } = await supabase.from("pousadas").select("*").eq("id", req.params.id).maybeSingle();
    if (!pousadaRow) return next();
    const pousada = mapPousadaRow(pousadaRow);
    const indexPath = isProd ? path.join(distPath, 'index.html') : path.join(process.cwd(), 'index.html');
    let html = fs.readFileSync(indexPath, 'utf-8');
    if (!isProd && viteDevServer) {
      html = await viteDevServer.transformIndexHtml(req.originalUrl, html);
    }
    html = injectPousadaMeta(html, pousada);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    next(err);
  }
});

// Same meta injection for each pousada's own "official site" at /site/:slug
app.get('/site/:slug', async (req, res, next) => {
  try {
    const { data: allPousadas } = await supabase.from("pousadas").select("*");
    const pousadaRow = (allPousadas || []).find(p => slugify(p.name) === req.params.slug);
    if (!pousadaRow) return next();
    const pousada = mapPousadaRow(pousadaRow);
    const indexPath = isProd ? path.join(distPath, 'index.html') : path.join(process.cwd(), 'index.html');
    let html = fs.readFileSync(indexPath, 'utf-8');
    if (!isProd && viteDevServer) {
      html = await viteDevServer.transformIndexHtml(req.originalUrl, html);
    }
    html = injectPousadaMeta(html, pousada);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    next(err);
  }
});

// Catches errors passed to next(err) by any route above (routes that handle
// their own try/catch and respond directly never reach this). Must be
// registered with all 4 params — that arity is how Express recognizes an
// error handler instead of regular middleware.
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  log.error("Erro não tratado:", err);
  reportServerError(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Erro interno do servidor" });
});

// Long-lived Node process entrypoint — used locally (npm run dev) and on
// hosts that run `npm run start` directly (e.g. Render, Railway). Never
// invoked on Vercel: serverless functions there just export `app` below and
// Vercel's own runtime handles the HTTP listening.
async function startLocalServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    viteDevServer = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(viteDevServer.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    log.info(`Server running on port ${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startLocalServer();
}

export default app;
