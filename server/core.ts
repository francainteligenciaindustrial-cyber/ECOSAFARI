// Núcleo do servidor: configuração do Express, middlewares globais, clientes
// (Supabase, Stripe, Resend, Gemini), autenticação e helpers compartilhados.
// As rotas ficam em server/routes/<área>.ts e são registradas em server.ts.
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
import { Pousada, Guide, Booking, Sighting, Review, Notification, Species, Turista, Roteiro, Reserva, Pagamento, GuiaTuristico, Candidatura, ReferralSource, Atracao, PartnerType, Recompensa, Resgate, Produto, Consumo, Pacote, PacoteItem, PacotePublico, Cupom } from "../src/types.js";
import QRCode from "qrcode";
import { slugify } from "../src/lib/slug.js";
import { SECURITY_HEADERS } from "../src/lib/securityHeaders.js";
import { safeEqual } from "../src/lib/safeEqual.js";
import { buildPousadaSender, pickReplyTo, EMAIL_ADDRESS, parseFromHeader } from "../src/lib/emailSender.js";
import { lodgingTotal, normalizePrecosPorMes } from "../src/lib/pricing.js";
import { splitBooking } from "../src/lib/finance.js";
import { sendWhatsAppTemplate } from "./whatsapp.js";
import { AsyncLocalStorage } from "async_hooks";


dotenv.config();

export const app = express();

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
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

export function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

export function structuredLog(level: "info" | "warn" | "error", message: unknown, ...details: unknown[]) {
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

export const log = {
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
// Valores em src/lib/securityHeaders.ts (fonte única, testada contra o
// vercel.json).
app.disable("x-powered-by");
app.use((req, res, next) => {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
  next();
});

export const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
export const isProd = process.env.NODE_ENV === "production";
export const distPath = path.join(process.cwd(), 'dist');

// "vite" is dev-only and imported dynamically below (inside startLocalServer,
// never called on Vercel) so its whole dependency tree stays out of the
// serverless function bundle — a static top-level import here was pulling it
// in regardless and is the likely cause of past FUNCTION_INVOCATION_FAILED
// crashes on Vercel. Type-only reference below has no runtime cost.
export let viteDevServer: import("vite").ViteDevServer | null = null;
// Importações ES são somente leitura: quem cria o Vite (server.ts) usa o
// setter, e as rotas enxergam o valor novo (binding vivo).
export function setViteDevServer(server: import("vite").ViteDevServer) {
  viteDevServer = server;
}

// Initialize Supabase client safely — no hardcoded fallback on purpose: a
// literal project URL/key baked into source code stays in git history forever
// (even after rotation) and previously meant a missing .env silently pointed
// at a real Supabase project instead of failing loudly. Configure these in
// .env locally and in the deploy platform's environment variables.
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórias. Defina-as no .env (local) ou nas variáveis de ambiente do deploy (Vercel/Render)."
  );
}
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// The backend is a trusted intermediary: every legitimate read/write (public or
// admin) is mediated and authorized by this Express app, never by the browser
// talking to Supabase directly. So the backend itself uses the service_role key
// (bypasses RLS) when available, while RLS on the tables stays locked down
// against anyone who extracts the public anon key and hits Supabase directly.
export const supabase = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

if (SUPABASE_SERVICE_ROLE_KEY) {
  log.info("Supabase: usando service_role key (RLS bypassada para o backend confiável).");
} else {
  log.warn("Supabase: SUPABASE_SERVICE_ROLE_KEY não configurada — usando anon key. Tabelas com RLS restrita ficarão inacessíveis ao backend até essa chave ser definida.");
}

// Separate client for admin-account management (Supabase Auth Admin API),
// e.g. creating the first admin user. Only usable when service_role is present.
export const supabaseAdminAuth = SUPABASE_SERVICE_ROLE_KEY
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
export class SupabaseRateLimitStore {
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
export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: new SupabaseRateLimitStore() as any,
  message: { error: "Muitas tentativas. Tente novamente em alguns minutos." },
});

export const publicFormLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new SupabaseRateLimitStore() as any,
  message: { error: "Muitos envios em pouco tempo. Tente novamente mais tarde." },
});

export const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  store: new SupabaseRateLimitStore() as any,
  message: { error: "Muitas tentativas de pagamento. Tente novamente mais tarde." },
});

export const chatLimiter = rateLimit({
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
export const viewLimiter = rateLimit({
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
export function isAdminUser(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return user?.app_metadata?.isAdmin === true || user?.app_metadata?.role === "admin";
}

// Mesma lógica, pro papel de turista: isTourist convive com isAdmin/role de
// parceiro que a conta já tenha — é o que permite um admin ou parceiro virar
// turista com a MESMA conta (ver POST /api/turista/upgrade) em vez de ter
// que criar uma segunda conta desconectada. role === "tourist" continua
// valendo pras contas de turista "puras" (criadas direto por
// POST /api/turista/signup, sem nenhum outro papel).
export function isTouristUser(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
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
export function getTokenAal(token: string): string | null {
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
export function hasUnsatisfiedMfaRequirement(user: { factors?: { status?: string }[] | null }, token: string): boolean {
  const hasMfaEnrolled = (user.factors || []).some(f => f.status === "verified");
  if (!hasMfaEnrolled) return false;
  return getTokenAal(token) !== "aal2";
}

// Verifies the caller is an authenticated admin (Supabase Auth JWT with
// app_metadata.isAdmin === true) before allowing access to admin-only routes.
// The Gestão tab hides itself client-side for non-admins, but that's cosmetic —
// this is what actually stops someone from calling the API directly.
export const requireAdmin: express.RequestHandler[] = [
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
export const requireAnyUploader: express.RequestHandler[] = [
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
export function requirePartnerAccess(partnerType: PartnerType): express.RequestHandler[] {
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
        // Múltiplas propriedades: além do vínculo "principal" acima (em
        // app_metadata), um parceiro pode ter propriedades extras
        // registradas em partner_links (ver scripts/add-partner-links.sql) —
        // dono de mais de uma pousada gerenciando tudo com o mesmo login.
        if (role === "partner") {
          const { data: link } = await supabase
            .from("partner_links")
            .select("id")
            .eq("userId", data.user.id)
            .eq("partnerType", partnerType)
            .eq("partnerId", req.params.id)
            .maybeSingle();
          if (link) {
            res.locals.isAdmin = false;
            return next();
          }
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
export const requireTourist: express.RequestHandler[] = [
  authLimiter,
  async (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "Crie um perfil de turista (ou faça login) para continuar." });
    }
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user || !isTouristUser(data.user)) {
        return res.status(403).json({ error: "É preciso ter um perfil de turista para continuar." });
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
export const requireAnyAuth: express.RequestHandler[] = [
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
export const requireChief: express.RequestHandler[] = [
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
export async function logAdminAction(
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
export const LIXEIRA_TABLE: Record<string, string> = {
  pousada: "pousadas",
  guide: "guides",
  atracao: "atracoes",
  turista: "turistas",
  species: "species",
};

export async function moverParaLixeira(
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

export async function purgeLixeiraExpirada() {
  const { error } = await supabase.from("lixeira").delete().lt("expiresAt", new Date().toISOString());
  if (error) log.warn("Erro ao purgar lixeira expirada:", error.message);
}

// Optional Sentry error reporting — lazy-imported only when SENTRY_DSN is
// set, so an unconfigured deployment doesn't pay for the dependency at
// startup. Same graceful-degradation pattern as Stripe/Resend/Gemini above.
export const SENTRY_DSN = process.env.SENTRY_DSN;
export let sentryReady: Promise<typeof import("@sentry/node")> | null = null;
if (SENTRY_DSN) {
  sentryReady = import("@sentry/node").then((Sentry) => {
    Sentry.init({ dsn: SENTRY_DSN, tracesSampleRate: 0.1 });
    return Sentry;
  });
}
export async function reportServerError(err: unknown) {
  if (!sentryReady) return;
  const Sentry = await sentryReady.catch(() => null);
  Sentry?.captureException(err);
}

// reCAPTCHA v3 (invisible — no checkbox challenge). Verifies a token the
// frontend gets from Google before accepting a public-form submission, to
// keep bots from scripting POSTs straight at the API. Fails open (allows the
// submission) when RECAPTCHA_SECRET_KEY isn't configured yet, or when Google's
// endpoint itself is unreachable — a captcha outage shouldn't block real users.
export const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;

// Compartilhado com o backend do aplicativo separado que distribui Coins por
// avistamento — é o que autentica POST /api/integrations/app-coins-sync
// (server-to-server, nunca chamado pelo navegador). Sem essa variável
// configurada nos dois lados, o endpoint recusa qualquer chamada.
export const APP_COINS_SYNC_SECRET = process.env.APP_COINS_SYNC_SECRET;
export async function verifyRecaptcha(token: unknown): Promise<boolean> {
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
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Modelo do chatbot e da moderação. A família 2.5 está sendo aposentada pelo
// Google; o Flash-Lite 3.5 é estável, mais barato e basta para respostas
// curtas e classificação. Troque por GEMINI_MODEL sem novo deploy de código.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
export let ai: GoogleGenAI | null = null;
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
export const VERCEL_ENV = process.env.VERCEL_ENV;
export const isSafeEnvironmentForLiveIntegrations =
  !VERCEL_ENV || VERCEL_ENV === "production" || process.env.ALLOW_LIVE_INTEGRATIONS_IN_PREVIEW === "true";

// Initialize Stripe safely — checkout falls back to the payment simulation
// button in the chatbot until a real key is provided.
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
export let stripe: Stripe | null = null;
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
export const RESEND_API_KEY = process.env.RESEND_API_KEY;
export let resend: Resend | null = null;
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

// Remetente precisa ser de um domínio verificado no Resend — o padrão
// onboarding@resend.dev só entrega pro email do dono da conta Resend, e pra
// qualquer outro destinatário a API responde com erro (sem lançar exceção).
export const EMAIL_FROM = process.env.EMAIL_FROM || "EcoSafari Brasil <onboarding@resend.dev>";
if (resend && !process.env.EMAIL_FROM) {
  log.warn("EMAIL_FROM não definido — usando onboarding@resend.dev, que só entrega para o email dono da conta Resend. Verifique um domínio no Resend e defina EMAIL_FROM.");
}

// O SDK do Resend devolve { error } em vez de lançar quando a API recusa o
// envio — sem checar isso, falhas viravam "email enviado" silenciosamente.
// from/replyTo opcionais: e-mails de reserva saem pelo remetente da própria
// pousada (ver remetenteDaPousada). Se o Resend recusar esse remetente
// (domínio ainda não verificado), reenvia pelo EMAIL_FROM da plataforma —
// o hóspede recebe de qualquer jeito.
// Último erro de envio (sem o destinatário) — exposto em /api/resend/status
// para diagnosticar recusas do Resend sem precisar abrir os logs da Vercel.
export let lastEmailFailure: { at: string; from: string; message: string } | null = null;
const recordEmailFailure = (from: string, message: string) => {
  lastEmailFailure = { at: new Date().toISOString(), from: parseFromHeader(from).address, message: String(message).slice(0, 300) };
};

export async function sendEmail(msg: { to: string; subject: string; html: string; attachments?: { filename: string; content: string }[]; from?: string; replyTo?: string }): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: "Resend não configurado" };
  const { from, replyTo, ...rest } = msg;
  const attempt = async (sender: string, reply?: string) => {
    const { error } = await resend!.emails.send({ ...rest, from: sender, ...(reply ? { replyTo: reply } : {}) });
    return error;
  };
  try {
    let error = await attempt(from || EMAIL_FROM, replyTo);
    if (error && from && from !== EMAIL_FROM) {
      log.warn(`Resend recusou o remetente ${from} (${error.message}) — reenviando por ${EMAIL_FROM}.`);
      error = await attempt(EMAIL_FROM, replyTo);
    }
    if (error) {
      log.warn(`Resend recusou o envio para ${msg.to}: ${error.message}`);
      recordEmailFailure(EMAIL_FROM, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err: any) {
    log.warn(`Falha ao enviar email para ${msg.to}: ${err.message}`);
    recordEmailFailure(EMAIL_FROM, err.message);
    return { ok: false, error: err.message };
  }
}

// Remetente dos e-mails de reserva ao hóspede (confirmação/voucher, pedido
// de avaliação) — mesmo padrão de Booking/Airbnb:
//  - Padrão: sai do domínio do EcoSafari com o nome da pousada na frente,
//    "Pesqueiro Vagalume via EcoSafari Brasil <reservas@ecosafari...>", e a
//    resposta do hóspede vai para o e-mail de contato da pousada.
//  - Exceção: pousada com domínio próprio verificado no Resend, que só o
//    admin configura (emailRemetente) — o parceiro não consegue apontar para
//    o domínio de outra pousada.
// Responder-para: emailContato (a pousada edita no portal) > emailRemetente
// > e-mail de login de um gestor. Sem nenhum, as respostas vão para a
// plataforma.
export async function remetenteDaPousada(pousadaId: string | undefined): Promise<{ from?: string; replyTo?: string }> {
  if (!pousadaId) return {};
  const { data } = await supabase.from("pousadas").select("*").eq("id", pousadaId).maybeSingle();
  if (!data) return {};
  const replyTo = pickReplyTo(data.emailContato, data.emailRemetente) || (await getPousadaGestorEmails(pousadaId).catch(() => []))[0];
  const from = buildPousadaSender({ pousadaName: data.name, platformFrom: EMAIL_FROM, ownAddress: data.emailRemetente, ownName: data.emailRemetenteNome });
  return { from, replyTo };
}

// Situação do domínio do remetente no Resend: "verified", "pending",
// "not_found" ou "unknown" (chave sem permissão para listar domínios — a
// chave "Sending access" não lista; o envio funciona mesmo assim).
export async function statusDominioRemetente(address: string): Promise<{ domain: string; status: string }> {
  const domain = address.split("@")[1]?.toLowerCase() || "";
  if (!resend || !domain) return { domain, status: "unknown" };
  try {
    const { data, error } = await resend.domains.list();
    if (error || !data) return { domain, status: "unknown" };
    const list: any[] = Array.isArray((data as any).data) ? (data as any).data : [];
    const hit = list.find(d => String(d.name).toLowerCase() === domain);
    return { domain, status: hit ? String(hit.status) : "not_found" };
  } catch {
    return { domain, status: "unknown" };
  }
}

// Helper to push a notification
export function addNotification(target: 'admin' | 'guide' | 'pousada', message: string, type: 'booking_new' | 'payment_received' | 'status_update' | 'sighting_new', bookingId?: string) {
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
export function resolveTranslation(val: any, lang: "pt" | "en" | "es" = "pt"): string {
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

export function parseJSONSafe(val: any) {
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
export function sanitizeIlikeTerm(term: string): string {
  return term.replace(/[,()]/g, " ").trim();
}

// Bloqueia as senhas mais óbvias que "8 caracteres" sozinho deixa passar —
// não é uma lista exaustiva (isso é trabalho pra um serviço como
// haveibeenpwned), só barra o caso mais comum de conta comprometida por
// força bruta trivial num cadastro de autoatendimento (turista, sem
// nenhuma vetting humana no meio).
export const COMMON_WEAK_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "password", "password1", "password123",
  "qwertyui", "qwerty123", "senha123", "senha1234", "abcd1234", "12345678a",
  "letmein1", "iloveyou", "admin123", "welcome1", "changeme", "00000000",
  "11111111", "88888888",
]);

export function isWeakPassword(password: string): boolean {
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
export function toStringArray(val: any): string[] {
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
export function toLanguageArray(val: any): { language: string; level: "basico" | "intermediario" | "avancado" }[] {
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
export function toStringArrayOrObjects(val: any): any[] {
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
export function splitCommaList(val: string | undefined): string[] {
  if (!val) return [];
  return val.split(",").map(s => s.trim()).filter(Boolean);
}

// Whitelists which fields a client-supplied body may set on an insert/update.
// Without this, `.update(req.body)` / `.insert({ ...req.body })` pass every
// key the caller sent straight to Supabase, so a form field never meant to be
// editable (or one the client shouldn't control at all) still gets written if
// it's present in the payload — the routes below only ever set columns that
// are actually meant to be admin/user editable for that entity.
export function pickFields<T extends object>(body: any, allowedKeys: readonly (keyof T)[]): Partial<T> {
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
export const POUSADA_CREATE_FIELDS = ["name", "description", "longDescription", "location", "pricePerNight", "images", "features", "activities", "experiences", "capacity", "videoUrl", "officialSiteUrl", "teamPhotoUrl", "teamSectionTitle", "teamSectionText", "officialSiteImages", "rooms", "unavailableDates", "hasOwnWebsite", "ownWebsiteUrl", "menu", "cuisineTypes", "transportOptions", "entertainmentOptions", "serviceNotes", "hasParking", "hasWifi", "facebookUrl", "tiktokUrl", "youtubeUrl", "logoUrl", "themeColorPrimary", "themeColorAccent", "latitude", "longitude", "emailContato", "precosPorMes", "googleMapsUrl"] as const;
// googleCalendarId fica de fora de POUSADA_CREATE_FIELDS de propósito — é
// um detalhe de organização interna da agência (qual calendário Google essa
// pousada usa), não algo que o parceiro deveria poder mexer autoeditando o
// próprio cadastro. Normalmente preenchido via POST
// /api/pousadas/:id/google-calendar (cria um calendário novo), mas também
// editável aqui à mão se o admin preferir apontar pra um que já existe.
// emailRemetente/emailRemetenteNome: só admin (ver remetenteDaPousada).
export const POUSADA_UPDATE_FIELDS = [...POUSADA_CREATE_FIELDS, "verified", "googleCalendarId", "emailRemetente", "emailRemetenteNome", "customDomain", "sitePublicado", "appLodgeId", "commissionPct", "plano", "conservationPct", "conservationPartner", "featured"] as const;
export const GUIDE_FIELDS = ["name", "email", "phone", "languages", "specialty", "status", "bio", "age", "birthplace", "interests", "photoUrl", "images", "unavailableDates"] as const;
export const SPECIES_FIELDS = ["name", "scientificName", "category", "description", "details", "sightings", "image", "bestPousadaId", "bestPousadaName"] as const;
export const TURISTA_FIELDS = ["name", "email", "whatsapp", "country", "language", "age", "preferences"] as const;
export const ROTEIRO_FIELDS = ["name", "duration", "price", "difficulty", "capacity", "description"] as const;
export const RESERVA_FIELDS = ["turistaId", "roteiroId", "date", "status", "totalPrice"] as const;
export const PAGAMENTO_FIELDS = ["reservaId", "amount", "date", "method", "status"] as const;
export const GUIA_TURISTICO_FIELDS = ["name", "specialty", "phone", "availability", "rating"] as const;

// Normalizes a raw pousadas row from Supabase into the shape the frontend
// expects — parses the jsonb-ish fields, resolves multi-language text, and
// fills in safe types. No fake-lodge fallback text here on purpose: earlier
// versions defaulted a missing name/description to "Araras Eco Lodge" (the
// old demo data's name), which is exactly the kind of fake content that
// kept leaking into the real site. A pousada with a blank field now just
// shows blank, not a placeholder impersonating a real business.
export function mapPousadaRow(p: any): Pousada {
  const rawExperiences = parseJSONSafe(p.experiences) || [];
  const experiences = Array.isArray(rawExperiences)
    ? rawExperiences.map((exp: any) => ({
        title: resolveTranslation(exp.title),
        description: resolveTranslation(exp.description),
        price: typeof exp.price === "number" ? exp.price : parseFloat(exp.price || "0"),
        ...(exp.requiresProvider ? { requiresProvider: true, providerType: typeof exp.providerType === "string" ? exp.providerType.slice(0, 60) : undefined } : {}),
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
    unavailableDates: toStringArray(p.unavailableDates),
    hasOwnWebsite: typeof p.hasOwnWebsite === "boolean" ? p.hasOwnWebsite : false,
    ownWebsiteUrl: p.ownWebsiteUrl || "",
    menu: parseJSONSafe(p.menu) || [],
    cuisineTypes: toStringArray(p.cuisineTypes),
    transportOptions: toStringArray(p.transportOptions),
    entertainmentOptions: toStringArray(p.entertainmentOptions),
    serviceNotes: p.serviceNotes || "",
    hasParking: typeof p.hasParking === "boolean" ? p.hasParking : false,
    hasWifi: typeof p.hasWifi === "boolean" ? p.hasWifi : false,
    facebookUrl: p.facebookUrl || "",
    tiktokUrl: p.tiktokUrl || "",
    youtubeUrl: p.youtubeUrl || "",
    logoUrl: p.logoUrl || "",
    themeColorPrimary: p.themeColorPrimary || "",
    themeColorAccent: p.themeColorAccent || "",
    // Campos novos precisam estar aqui: esta função é uma lista fixa, e o que
    // não passa por ela nunca chega ao site — nem ao formulário da Gestão,
    // que então salvaria o campo vazio por cima do valor do banco.
    latitude: toNumberOrUndefined(p.latitude),
    longitude: toNumberOrUndefined(p.longitude),
    googleMapsUrl: p.googleMapsUrl || undefined,
    emailContato: p.emailContato || "",
    emailRemetente: p.emailRemetente || "",
    emailRemetenteNome: p.emailRemetenteNome || "",
    customDomain: p.customDomain || "",
    sitePublicado: p.sitePublicado === true,
    appLodgeId: p.appLodgeId || "",
    commissionPct: toNumberOrUndefined(p.commissionPct) ?? null,
    plano: p.plano === "basico" ? "basico" : "gestao",
    precosPorMes: normalizePrecosPorMes(parseJSONSafe(p.precosPorMes) ?? p.precosPorMes),
    conservationPct: toNumberOrUndefined(p.conservationPct) ?? null,
    conservationPartner: p.conservationPartner || "",
    featured: p.featured === true,
  };
}

function toNumberOrUndefined(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

// Image uploads go to the "site-media" Supabase Storage bucket (public,
// created via scripts/create-storage-bucket.mjs) instead of the git repo —
// before this, replacing a photo meant a developer editing files and
// pushing a deploy, which doesn't scale past one person maintaining the
// site. memoryStorage() keeps the file in RAM only long enough to forward
// it to Supabase; nothing touches disk.
export const upload = multer({
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
export function detectImageType(buffer: Buffer): { ext: string; contentType: string } | null {
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
export async function moderateImage(buffer: Buffer, mimeType: string): Promise<{ ok: boolean; reason?: string }> {
  if (!ai) return { ok: true };
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
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

export async function moderateText(text: string): Promise<{ ok: boolean; reason?: string }> {
  if (!ai || !text.trim()) return { ok: true };
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
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

// Foto de celular chega com 3–8 MB; quem abre o site do Pantanal muitas
// vezes está com sinal fraco. Reduz para no máximo 1920px e grava em WebP
// (~80–90% menor). GIF fica como está (pode ser animado). Se o sharp
// falhar por qualquer motivo, sobe o original — melhor pesado que perdido.
export async function optimizeUploadedImage(buffer: Buffer, detected: { ext: string; contentType: string }): Promise<{ buffer: Buffer; ext: string; contentType: string }> {
  if (detected.ext === "gif") return { buffer, ...detected };
  try {
    const { default: sharp } = await import("sharp");
    const webp = await sharp(buffer)
      .rotate()
      .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    if (webp.length >= buffer.length && detected.ext === "webp") return { buffer, ...detected };
    return { buffer: webp, ext: "webp", contentType: "image/webp" };
  } catch (err: any) {
    log.warn("Não foi possível otimizar a imagem enviada, subindo o original:", err?.message);
    return { buffer, ...detected };
  }
}

// Grava pulando colunas que ainda não existem no banco (migração SQL
// pendente) em vez de falhar a gravação inteira — o resto dos campos é
// salvo e quem chamou recebe a lista do que ficou de fora.
export async function writeSkippingMissingColumns(
  row: Record<string, any>,
  run: (row: Record<string, any>) => PromiseLike<{ data: any; error: any }>
): Promise<{ data: any; error: any; skipped: string[] }> {
  const current = { ...row };
  const skipped: string[] = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = await run(current);
    const missing = result.error?.code === "PGRST204" ? /'([^']+)' column/.exec(result.error.message || "")?.[1] : undefined;
    if (missing && missing in current) {
      skipped.push(missing);
      delete current[missing];
      continue;
    }
    if (skipped.length) log.warn(`Campos ignorados por migração SQL pendente: ${skipped.join(", ")}`);
    return { data: result.data, error: result.error, skipped };
  }
  return { data: null, error: { message: "Colunas demais ausentes no banco — rode as migrações SQL pendentes." }, skipped };
}

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
export function mapGuideRow(g: any): Guide {
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
export function toPublicGuide(g: Guide): Omit<Guide, "email" | "phone"> {
  const { email, phone, ...publicFields } = g;
  return publicFields;
}

// ATRAÇÕES CRUD — parceiro que não é uma hospedagem: "Parada Legal" (passeio,
// artesanato, lembrança) ou "Restaurante". Separado de pousadas porque nem
// todo parceiro tem quartos pra reservar (ver Pousada vs. Atração no /seja-parceiro).
export function mapAtracaoRow(a: any): Atracao {
  return {
    id: a.id,
    type: a.type,
    name: resolveTranslation(a.name),
    description: resolveTranslation(a.description),
    location: resolveTranslation(a.location),
    images: parseJSONSafe(a.images) || [],
    menu: parseJSONSafe(a.menu) || undefined,
    availability: a.availability || undefined,
    latitude: toNumberOrUndefined(a.latitude),
    longitude: toNumberOrUndefined(a.longitude),
    rating: typeof a.rating === "number" ? a.rating : (a.rating ? parseFloat(a.rating) : 0),
    verified: typeof a.verified === "boolean" ? a.verified : false,
    dateCreated: a.dateCreated || ""
  };
}

export const ATRACAO_FIELDS = ["type", "name", "description", "location", "images", "menu", "availability", "latitude", "longitude"] as const;

// Simulate creating booking (e.g. from WhatsApp Bot or Landing Page Wizard)
// Concorrência: a checagem abaixo e o INSERT são dois passos, mas o banco
// tem a palavra final — o trigger de scripts/add-booking-overlap-guard.sql
// trava por pousada+quarto dentro do INSERT e recusa com 23P01 quando não
// sobra unidade. isOverbookingError traduz isso em 409.
export type AvailabilityResult = { ok: boolean; status?: number; body?: Record<string, unknown> };

// Erro do trigger bookings_guard_room_overlap (exclusion_violation).
export const isOverbookingError = (error: { code?: string } | null | undefined) => error?.code === "23P01";
export const OVERBOOKING_MESSAGE = "Essas datas acabaram de ser reservadas por outra pessoa. Escolha outras datas.";

export const shiftDays = (date: string, days: number) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);

// Disponibilidade de uma pousada num período — usada tanto pelo cadastro
// manual do admin quanto pela reserva online do turista. Estadias que só
// se encostam (check-out de uma = check-in da outra) não conflitam.
// excludeBookingId permite revalidar depois de gravar a própria reserva.
export async function checkPousadaAvailability(pousada: Pousada, checkIn: string, checkOut: string, newGuests: number, roomType?: string, excludeBookingId?: string): Promise<AvailabilityResult> {
  const suggestions = [{ checkIn: shiftDays(checkIn, 7), checkOut: shiftDays(checkOut, 7), note: "Uma semana mais tarde" }];

  const blocked = (pousada.unavailableDates || []).filter(d => d >= checkIn && d < checkOut);
  if (blocked.length > 0) {
    return { ok: false, status: 400, body: { error: `A pousada não recebe hóspedes em: ${blocked.slice(0, 5).join(", ")}.`, available: false, suggestions } };
  }

  let query = supabase
    .from("bookings")
    .select("id, checkIn, checkOut, adults, children, roomType")
    .eq("pousadaId", pousada.id)
    .neq("status", "cancelado")
    .lt("checkIn", checkOut)
    .gt("checkOut", checkIn);
  if (excludeBookingId) query = query.neq("id", excludeBookingId);
  const { data: overlapping, error } = await query;
  if (error) return { ok: false, status: 500, body: { error: "Erro ao consultar a disponibilidade." } };
  const overlappingBookings = overlapping || [];

  if (roomType) {
    const room = (pousada.rooms || []).find(r => r.type === roomType);
    if (!room) return { ok: false, status: 400, body: { error: `Tipo de quarto "${roomType}" não encontrado nesta pousada.` } };
    if (newGuests > room.capacity) {
      return { ok: false, status: 400, body: { error: `O quarto "${roomType}" acomoda no máximo ${room.capacity} hóspedes.`, available: false } };
    }
    const sameRoom = overlappingBookings.filter(b => b.roomType === roomType).length;
    if (sameRoom >= room.quantity) {
      return { ok: false, status: 400, body: { error: `Sem unidades disponíveis do quarto "${roomType}" para estas datas (${room.quantity} no total).`, available: false, suggestions } };
    }
    return { ok: true };
  }

  const guestsAlready = overlappingBookings.reduce((acc, b) => acc + (b.adults || 0) + (b.children || 0), 0);
  if (guestsAlready + newGuests > pousada.capacity) {
    return { ok: false, status: 400, body: { error: "Indisponível para estas datas por atingir capacidade máxima.", available: false, suggestions } };
  }
  return { ok: true };
}

// Preço sempre calculado no servidor a partir do cadastro da pousada —
// nunca a partir de um valor enviado pelo navegador.
// Diárias somadas noite a noite (preço por temporada, ver src/lib/pricing.ts)
// + experiências escolhidas, cada uma por adulto (o turista pode marcar
// várias em "O que você quer fazer?").
export function computeBookingTotal(pousada: Pousada, checkIn: string, checkOut: string, adults: number, experience?: string | string[]): number {
  const titles = new Set((Array.isArray(experience) ? experience : experience ? [experience] : []).filter(Boolean));
  const extras = (pousada.experiences || [])
    .filter(e => titles.has(e.title))
    .reduce((acc, e) => acc + (Number(e.price) || 0) * adults, 0);
  return lodgingTotal(pousada, checkIn, checkOut) + extras;
}

// Percentuais padrão da plataforma (Vercel). Sem eles, 0 — o painel
// Financeiro avisa para configurar.
export const COMISSAO_PADRAO_PCT = Number(process.env.COMISSAO_PADRAO_PCT) || 0;
export const CONSERVACAO_PADRAO_PCT = Number(process.env.CONSERVACAO_PADRAO_PCT) || 0;
export const PLANO_GESTAO_VALOR = Number(process.env.PLANO_GESTAO_VALOR) || null;

export const commissionPctOf = (p: Pousada) => (typeof p.commissionPct === "number" ? p.commissionPct : COMISSAO_PADRAO_PCT);
export const conservationPctOf = (p: Pousada) => (typeof p.conservationPct === "number" ? p.conservationPct : CONSERVACAO_PADRAO_PCT);

// Afiliado ativo pelo código do link (?ref=).
export async function findAfiliado(code: unknown): Promise<{ code: string; commissionPct: number } | null> {
  const c = String(code || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
  if (!c) return null;
  const { data } = await supabase.from("afiliados").select("code, commissionPct, active").eq("code", c).maybeSingle();
  return data && data.active ? { code: data.code, commissionPct: Number(data.commissionPct) || 0 } : null;
}

// Campos financeiros gravados em cada reserva no momento em que ela é criada.
export async function bookingFinance(pousada: Pousada, total: number, refCode?: unknown) {
  const afiliado = await findAfiliado(refCode).catch(() => null);
  const s = splitBooking(total, commissionPctOf(pousada), afiliado?.commissionPct || 0, conservationPctOf(pousada));
  return {
    commissionPct: s.commissionPct,
    commissionAmount: s.commission,
    afiliadoCode: afiliado?.code,
    afiliadoCommission: afiliado ? s.affiliate : undefined,
    conservationAmount: s.conservation || undefined,
  };
}

// ----------------------------------------------------
// GOOGLE CALENDAR OAUTH & API INTEGRATION HELPERS
// ----------------------------------------------------

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Google Calendar OAuth tokens live in the "app_secrets" Supabase table (see
// scripts/add-app-secrets-table.sql) instead of a local JSON file. A local
// file doesn't survive Vercel's serverless filesystem (ephemeral and
// read-only in production, so this integration silently never worked there),
// and plaintext OAuth credentials belong in the same access-controlled store
// as everything else, not on disk. Same shared/serverless-safe reasoning as
// the rate_limits table above — one row per key, read/written by every
// instance through the service_role-backed `supabase` client.
export const GOOGLE_TOKENS_KEY = "google_calendar_tokens";

export async function loadStoredTokens(): Promise<any | null> {
  const { data, error } = await supabase.from("app_secrets").select("value").eq("key", GOOGLE_TOKENS_KEY).maybeSingle();
  if (error || !data) return null;
  return data.value;
}

export async function saveTokens(tokens: any): Promise<void> {
  const { error } = await supabase
    .from("app_secrets")
    .upsert({ key: GOOGLE_TOKENS_KEY, value: tokens, updated_at: new Date().toISOString() });
  if (error) log.error("Erro ao salvar tokens do Google Calendar no Supabase:", error.message);
  else log.info("Tokens do Google Calendar salvos com sucesso.");
}

export async function deleteTokens(): Promise<void> {
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
export const GOOGLE_OAUTH_STATE_KEY = "google_oauth_pending_state";
export const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export async function createOAuthState(): Promise<string> {
  const state = randomUUID();
  await supabase.from("app_secrets").upsert({
    key: GOOGLE_OAUTH_STATE_KEY,
    value: { state, expiresAt: Date.now() + GOOGLE_OAUTH_STATE_TTL_MS },
    updated_at: new Date().toISOString(),
  });
  return state;
}

export async function consumeOAuthState(candidate: string | undefined): Promise<boolean> {
  const { data } = await supabase.from("app_secrets").select("value").eq("key", GOOGLE_OAUTH_STATE_KEY).maybeSingle();
  // One-time use — delete regardless of outcome so a leaked/replayed
  // callback URL can't be reused.
  await supabase.from("app_secrets").delete().eq("key", GOOGLE_OAUTH_STATE_KEY);
  const pending = data?.value as { state: string; expiresAt: number } | undefined;
  if (!pending || !candidate) return false;
  if (Date.now() > pending.expiresAt) return false;
  return pending.state === candidate;
}

export function getOAuthClient(req: express.Request) {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.get("host");
  const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

export async function createCalendarEvent(booking: Booking, req: express.Request) {
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

// Update Status flow (Gateway Pay, Pousada confirm, Guide confirm)
// Extracted so both the REST endpoint and the Stripe payment-confirmation
// flow can trigger the same "pago" side effects (notifications, calendar sync).
export async function applyBookingStatusUpdate(id: string, body: Partial<Booking>, req: express.Request): Promise<Booking | null> {
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
    // Mesmo aviso pelo WhatsApp (modelo "reserva_confirmada", ver RUNBOOK).
    sendWhatsAppTemplate(updated.customerPhone, "reserva_confirmada", [
      (updated.customerName || "").split(" ")[0] || "viajante",
      updated.pousadaName,
      String(updated.checkIn).slice(0, 10).split("-").reverse().join("/"),
      String(updated.checkOut).slice(0, 10).split("-").reverse().join("/"),
      `${SITE_URL}/turista`,
    ]).catch(() => {});
  }

  return (savedBooking as Booking) || updated;
}

// ----------------------------------------------------
// AGENDA SELF-SERVICE DO PARCEIRO (pousada/guia) — confirmar/cancelar a
// própria reserva direto do próprio portal, sem depender do admin fazer
// isso por eles. Cancelar uma reserva já confirmada fora do prazo mínimo de
// 45 dias aciona a política de penalidade abaixo.
// ----------------------------------------------------

export const CONFIRMED_BOOKING_STATUSES = ["confirmado_pousada", "confirmado_guia", "confirmado_total"];

// Limites da política de cancelamento — ajustáveis aqui, num lugar só.
// >= 45 dias: cancelamento livre (o prazo mínimo pedido). Entre 20 e 44:
// só perde estrela de confiabilidade (selo interno, não a nota pública).
// Entre 5 e 19: só penalidade em dinheiro. Menos de 5: as duas coisas,
// maiores.
export const PENALTY_MIN_NOTICE_DAYS = 45;
export const PENALTY_MONEY_TIER_DAYS = 20;
export const PENALTY_SEVERE_TIER_DAYS = 5;
export const PENALTY_MONEY_PERCENT_TIER = 0.2;
export const PENALTY_MONEY_PERCENT_SEVERE = 0.5;
export const PENALTY_STARS_TIER = 0.5;
export const PENALTY_STARS_SEVERE = 1.5;

export function diasAteData(dataISO: string): number {
  const hoje = new Date(new Date().toISOString().slice(0, 10));
  const alvo = new Date(dataISO);
  return Math.round((alvo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

export function calcularPenalidadeCancelamento(totalPrice: number, diasAntecedencia: number): { valorPenalidade: number; estrelasPerdidas: number; motivo: string } {
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

export async function registrarPenalidadeCancelamento(prestadorType: "pousada" | "guia", prestadorId: string, booking: Booking) {
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

// ----------------------------------------------------
// LEMBRETES AUTOMÁTICOS DE CANCELAMENTO — roda uma vez por dia via Vercel
// Cron (ver "crons" em vercel.json), avisando pousada/guia com reserva
// confirmada nos marcos de 45/20/5 dias antes do check-in, reforçando o que
// eles perdem se cancelarem a partir dali. Idempotente via
// lembretes_enviados (não manda o mesmo aviso duas vezes).
// ----------------------------------------------------

export const REMINDER_THRESHOLDS = [45, 20, 5] as const;
export const CRON_SECRET = process.env.CRON_SECRET;

// Contas de parceiro não guardam email na própria tabela (pousadas/atracoes)
// — só o guia tem email direto no cadastro. Pra pousada, o email de login
// mora só no Supabase Auth, então precisa procurar pelo app_metadata.
export async function findPartnerEmail(partnerType: "pousada" | "guia", partnerId: string): Promise<string | null> {
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

export async function enviarLembreteCancelamento(booking: Booking, dias: number) {
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
    await sendEmail({
      to: email,
      subject: `Faltam ${dias} dias para a expedição de ${booking.customerName} — EcoSafari`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #101B4C;">Sua expedição está chegando 🐆</h2>
          <p>Olá, ${escapeHtml(dest.name)}! Faltam <strong>${dias} dias</strong> para a reserva de <strong>${escapeHtml(booking.customerName)}</strong> (${booking.checkIn} a ${booking.checkOut}).</p>
          <p>Se precisar cancelar a partir de agora, a política de cancelamento se aplica: <strong>${consequencia}</strong>.</p>
          <p style="color: #888; font-size: 12px;">Cancelamentos com 45 dias ou mais de antecedência não têm nenhuma penalidade.</p>
        </div>
      `,
    });
  }
}

// ----------------------------------------------------
// OCUPAÇÃO PÚBLICA (calendário de melhor época por espécie)
// ----------------------------------------------------

export const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

// Ocupação por mês (0–1) de uma pousada num intervalo de meses. Com quartos
// cadastrados, mede unidade-noite (uma reserva ocupa uma unidade); sem
// quartos, hóspede-noite contra a capacidade. Datas bloqueadas pela pousada
// contam como lotadas. Usado pelo calendário público e pelo painel do parceiro.
export async function ocupacaoMensal(pousada: Pousada, from: Date, months: number): Promise<{ month: string; occupancy: number; revenue: number; bookings: number }[]> {
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1));
  const startISO = start.toISOString().slice(0, 10);
  const endISO = end.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("bookings")
    .select("checkIn, checkOut, adults, children, roomType, totalPrice, status")
    .eq("pousadaId", pousada.id)
    .neq("status", "cancelado")
    .lt("checkIn", endISO)
    .gt("checkOut", startISO);
  const bookings = data || [];

  const units = (pousada.rooms || []).reduce((acc, r) => acc + (Number(r.quantity) || 0), 0);
  const perNight = units > 0 ? units : Math.max(1, Number(pousada.capacity) || 1);
  const blocked = new Set(pousada.unavailableDates || []);

  const result: { month: string; occupancy: number; revenue: number; bookings: number }[] = [];
  for (let i = 0; i < months; i++) {
    const mStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const mEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i + 1, 1));
    const days = Math.round((mEnd.getTime() - mStart.getTime()) / 86400000);
    let used = 0;
    for (let d = 0; d < days; d++) {
      const day = new Date(mStart.getTime() + d * 86400000).toISOString().slice(0, 10);
      if (blocked.has(day)) { used += perNight; continue; }
      let usedToday = 0;
      for (const b of bookings) {
        if (b.checkIn <= day && b.checkOut > day) usedToday += units > 0 ? 1 : (b.adults || 0) + (b.children || 0);
      }
      used += Math.min(perNight, usedToday);
    }
    const key = monthKey(mStart);
    const inMonth = bookings.filter(b => String(b.checkIn).slice(0, 7) === key);
    const paid = inMonth.filter(b => b.status !== "pendente_pagamento");
    result.push({
      month: key,
      occupancy: Math.round((used / (perNight * days)) * 100) / 100,
      revenue: paid.reduce((acc, b) => acc + (Number(b.totalPrice) || 0), 0),
      bookings: inMonth.length,
    });
  }
  return result;
}

// ----------------------------------------------------
// PAINEL DE RESULTADOS DO PARCEIRO
// ----------------------------------------------------

export const ORIGEM_LABEL = (b: { origem?: string | null; pacoteId?: string | null }) =>
  b.pacoteId ? "Pacote EcoSafari" : b.origem === "site" ? "Reserva online (site)" : "Equipe EcoSafari / WhatsApp";


// ----------------------------------------------------
// PACOTES COMBINADOS (pousada + guia + atração) — scripts/add-pacotes-cupons-mapa.sql
// ----------------------------------------------------

export const PACOTE_ITEM_KINDS = ["hospedagem", "guia", "atracao", "outro"] as const;

export function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

export function mapPacoteRow(row: any): Pacote {
  return {
    ...row,
    atracaoIds: parseJsonArray<string>(row.atracaoIds),
    items: parseJsonArray<PacoteItem>(row.items),
    nights: Number(row.nights) || 1,
    active: row.active !== false,
  };
}

export const pacotePricePerPerson = (p: Pacote) => p.items.reduce((acc, i) => acc + (Number(i.pricePerPerson) || 0), 0);

export async function loadPacote(id: string): Promise<Pacote | null> {
  const { data, error } = await supabase.from("pacotes").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapPacoteRow(data);
}

// Nomes resolvidos para a vitrine pública — sem email/telefone do guia.
export async function toPacotePublico(pacotes: Pacote[]): Promise<PacotePublico[]> {
  const pousadaIds = [...new Set(pacotes.map(p => p.pousadaId))];
  const guideIds = [...new Set(pacotes.map(p => p.guideId).filter(Boolean))] as string[];
  const atracaoIds = [...new Set(pacotes.flatMap(p => p.atracaoIds))];
  const [pousadasRes, guidesRes, atracoesRes] = await Promise.all([
    pousadaIds.length ? supabase.from("pousadas").select("id,name").in("id", pousadaIds) : Promise.resolve({ data: [] as any[] }),
    guideIds.length ? supabase.from("guides").select("id,name").in("id", guideIds) : Promise.resolve({ data: [] as any[] }),
    atracaoIds.length ? supabase.from("atracoes").select("id,name").in("id", atracaoIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const nameOf = (rows: any[] | null, id?: string) => (rows || []).find(r => r.id === id)?.name as string | undefined;
  return pacotes
    .filter(p => nameOf(pousadasRes.data, p.pousadaId))
    .map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      pousadaId: p.pousadaId,
      pousadaName: nameOf(pousadasRes.data, p.pousadaId)!,
      guideName: nameOf(guidesRes.data, p.guideId),
      atracaoNames: p.atracaoIds.map(id => nameOf(atracoesRes.data, id)).filter(Boolean) as string[],
      nights: p.nights,
      items: p.items,
      pricePerPerson: pacotePricePerPerson(p),
      imageUrl: p.imageUrl,
    }));
}

export function sanitizePacote(body: any): { ok: true; value: Omit<Pacote, "id" | "createdAt"> } | { ok: false; error: string } {
  const name = String(body.name ?? "").trim().slice(0, 120);
  const pousadaId = String(body.pousadaId ?? "").trim();
  const nights = Math.trunc(Number(body.nights));
  const items = parseJsonArray<any>(body.items)
    .map(i => ({
      label: String(i?.label ?? "").trim().slice(0, 120),
      kind: (PACOTE_ITEM_KINDS as readonly string[]).includes(i?.kind) ? i.kind : "outro",
      pricePerPerson: Math.round(Number(i?.pricePerPerson) * 100) / 100,
    }))
    .filter(i => i.label && Number.isFinite(i.pricePerPerson) && i.pricePerPerson >= 0) as PacoteItem[];
  if (!name) return { ok: false, error: "Dê um nome ao pacote." };
  if (!pousadaId) return { ok: false, error: "Escolha a pousada do pacote." };
  if (!Number.isInteger(nights) || nights < 1 || nights > 30) return { ok: false, error: "Número de noites inválido (1 a 30)." };
  if (items.length === 0 || items.reduce((a, i) => a + i.pricePerPerson, 0) <= 0) return { ok: false, error: "Inclua ao menos um item com preço." };
  return {
    ok: true,
    value: {
      name,
      description: String(body.description ?? "").trim().slice(0, 1000) || undefined,
      pousadaId,
      guideId: String(body.guideId ?? "").trim() || undefined,
      atracaoIds: parseJsonArray<string>(body.atracaoIds).map(String).slice(0, 10),
      nights,
      items,
      imageUrl: String(body.imageUrl ?? "").trim().slice(0, 500) || undefined,
      active: body.active !== false,
    },
  };
}


// ----------------------------------------------------
// CUPONS PROMOCIONAIS
// ----------------------------------------------------

export const normalizeCupomCode = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);

export type CupomResult = { ok: true; cupom: Cupom; discount: number } | { ok: false; error: string };

// Regras: ativo, dentro da validade, com usos sobrando, acima do valor
// mínimo e (se for de uma pousada só) da pousada certa. Desconto nunca passa
// do subtotal. O preço final é sempre recalculado aqui no servidor.
export async function validarCupom(codeRaw: unknown, pousadaId: string, subtotal: number): Promise<CupomResult> {
  const code = normalizeCupomCode(codeRaw);
  if (!code) return { ok: false, error: "Informe o código do cupom." };
  const { data, error } = await supabase.from("cupons").select("*").eq("code", code).maybeSingle();
  if (error || !data) return { ok: false, error: "Cupom inválido ou expirado." };
  const cupom = data as Cupom;
  const today = new Date().toISOString().slice(0, 10);
  if (!cupom.active) return { ok: false, error: "Cupom inválido ou expirado." };
  if (cupom.validFrom && today < String(cupom.validFrom).slice(0, 10)) return { ok: false, error: "Cupom ainda não está valendo." };
  if (cupom.validUntil && today > String(cupom.validUntil).slice(0, 10)) return { ok: false, error: "Cupom inválido ou expirado." };
  if (cupom.maxUses != null && Number(cupom.usedCount || 0) >= Number(cupom.maxUses)) return { ok: false, error: "Cupom esgotado." };
  if (cupom.pousadaId && cupom.pousadaId !== pousadaId) return { ok: false, error: "Este cupom não vale para esta pousada." };
  if (cupom.minTotal && subtotal < Number(cupom.minTotal)) return { ok: false, error: `Cupom válido para reservas a partir de R$ ${Number(cupom.minTotal).toLocaleString("pt-BR")}.` };
  const raw = cupom.percentOff ? (subtotal * Number(cupom.percentOff)) / 100 : Number(cupom.amountOff || 0);
  const discount = Math.min(subtotal, Math.round(raw * 100) / 100);
  if (!(discount > 0)) return { ok: false, error: "Cupom inválido ou expirado." };
  return { ok: true, cupom, discount };
}

// Consome um uso de forma atômica (função SQL cupom_registrar_uso, que só
// incrementa se ainda houver usos). Sem a função (migração pendente), cai
// para ler-e-gravar — aceitável para o volume atual.
export async function registrarUsoCupom(cupom: Cupom): Promise<boolean> {
  const { data, error } = await supabase.rpc("cupom_registrar_uso", { cupom_id: cupom.id });
  if (!error) return data === true;
  const { error: updErr } = await supabase.from("cupons").update({ usedCount: Number(cupom.usedCount || 0) + 1 }).eq("id", cupom.id);
  return !updErr;
}

export const cupomLimiter = rateLimit({ windowMs: 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false, message: { error: "Muitas tentativas. Aguarde um minuto." } });

export function sanitizeCupom(body: any): { ok: true; value: Partial<Cupom> } | { ok: false; error: string } {
  const code = normalizeCupomCode(body.code);
  const percentOff = body.percentOff === "" || body.percentOff == null ? undefined : Number(body.percentOff);
  const amountOff = body.amountOff === "" || body.amountOff == null ? undefined : Number(body.amountOff);
  if (code.length < 3) return { ok: false, error: "O código precisa ter ao menos 3 letras/números." };
  if ((percentOff == null) === (amountOff == null)) return { ok: false, error: "Defina um desconto em % OU em R$ (só um dos dois)." };
  if (percentOff != null && !(percentOff > 0 && percentOff <= 100)) return { ok: false, error: "Percentual entre 1 e 100." };
  if (amountOff != null && !(amountOff > 0)) return { ok: false, error: "Valor do desconto inválido." };
  const opt = (v: unknown) => (v === "" || v == null ? null : Number(v));
  const date = (v: unknown) => (typeof v === "string" && ISO_DATE.test(v) ? v : null);
  return {
    ok: true,
    value: {
      code,
      description: String(body.description ?? "").trim().slice(0, 200) || undefined,
      percentOff: percentOff ?? null as any,
      amountOff: amountOff ?? null as any,
      minTotal: opt(body.minTotal) as any,
      maxUses: opt(body.maxUses) as any,
      validFrom: date(body.validFrom) as any,
      validUntil: date(body.validUntil) as any,
      pousadaId: String(body.pousadaId ?? "").trim() || null as any,
      active: body.active !== false,
    },
  };
}


// ----------------------------------------------------
// AVALIAÇÃO AUTOMÁTICA PÓS-ESTADIA
// ----------------------------------------------------

// Marcador em lembretes_enviados (threshold = -1) para não pedir avaliação
// duas vezes da mesma reserva — reaproveita a tabela dos lembretes de
// cancelamento em vez de criar outra.
export const REVIEW_REQUEST_THRESHOLD = -1;
export const REVIEW_REQUEST_STATUSES = ["pago", ...CONFIRMED_BOOKING_STATUSES];

export async function enviarPedidoAvaliacao(booking: Booking): Promise<boolean> {
  if (!booking.customerEmail || /@reserva\.com$/i.test(booking.customerEmail)) return false;
  const link = `${SITE_URL}/?avaliar=${encodeURIComponent(booking.pousadaId)}#avaliacoes`;
  const primeiroNome = escapeHtml((booking.customerName || "").split(" ")[0] || "viajante");
  const result = await sendEmail({
    ...(await remetenteDaPousada(booking.pousadaId)),
    to: booking.customerEmail,
    subject: `Como foi sua estadia na ${booking.pousadaName}? — EcoSafari`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #101B4C;">Obrigado por viajar com a gente, ${primeiroNome}! 🌿</h2>
        <p>Esperamos que a estadia na <strong>${escapeHtml(booking.pousadaName)}</strong> tenha sido inesquecível.</p>
        <p>Leva um minuto: sua avaliação ajuda outros viajantes a escolher e ajuda a pousada a melhorar.</p>
        <p><a href="${link}" style="display:inline-block; background:#101B4C; color:#fff; padding:12px 22px; text-decoration:none; border-radius:4px;">Avaliar minha estadia</a></p>
        <p style="color:#888; font-size:12px;">Thank you for traveling with EcoSafari! Tap the button above to rate your stay.</p>
      </div>
    `,
  });
  return result.ok;
}

// Check-out entre 1 e 3 dias atrás (folga para o cron que falhou num dia).
export async function enviarPedidosDeAvaliacao(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("bookings")
    .select("*")
    .in("status", REVIEW_REQUEST_STATUSES)
    .gte("checkOut", shiftDays(today, -3))
    .lt("checkOut", today);
  let sent = 0;
  for (const booking of (data || []) as Booking[]) {
    const { data: already } = await supabase.from("lembretes_enviados").select("id").eq("bookingId", booking.id).eq("threshold", REVIEW_REQUEST_THRESHOLD).maybeSingle();
    if (already) continue;
    if (!(await enviarPedidoAvaliacao(booking))) continue;
    await sendWhatsAppTemplate(booking.customerPhone, "avaliacao_estadia", [
      (booking.customerName || "").split(" ")[0] || "viajante",
      booking.pousadaName,
      `${SITE_URL}/?avaliar=${encodeURIComponent(booking.pousadaId)}#avaliacoes`,
    ]).catch(() => false);
    const { error } = await supabase.from("lembretes_enviados").insert({ id: `lb_${randomUUID()}`, bookingId: booking.id, threshold: REVIEW_REQUEST_THRESHOLD, sentAt: new Date().toISOString() });
    if (!error) sent++;
  }
  return sent;
}

// Itens do checkout do Stripe: pacote vira um item por componente (pousada,
// guia, atração) × pessoas; reserva comum continua um item só. Cupom entra
// como desconto do próprio Stripe, então aparece separado no recibo.
export async function buildCheckoutLineItems(booking: Booking): Promise<{ lineItems: Stripe.Checkout.SessionCreateParams.LineItem[]; discountAmount: number }> {
  const discountAmount = Math.max(0, Number(booking.discountAmount) || 0);
  const guests = (Number(booking.adults) || 1) + (Number(booking.children) || 0);
  if (booking.pacoteId) {
    const pacote = await loadPacote(booking.pacoteId);
    if (pacote && pacote.items.length > 0) {
      const lineItems = pacote.items
        .filter(i => i.pricePerPerson > 0)
        .map(i => ({
          price_data: { currency: "brl", product_data: { name: `${pacote.name} — ${i.label}` }, unit_amount: Math.round(i.pricePerPerson * 100) },
          quantity: guests,
        }));
      const itemsTotal = lineItems.reduce((acc, li) => acc + li.price_data.unit_amount * li.quantity, 0);
      // Só usa o detalhamento se bater com o total gravado na reserva
      // (pacote pode ter mudado de preço depois da reserva).
      if (itemsTotal === Math.round((Number(booking.totalPrice) + discountAmount) * 100)) return { lineItems, discountAmount };
    }
  }
  return {
    lineItems: [{
      price_data: { currency: "brl", product_data: { name: `${booking.pousadaName} — ${booking.experienceType}` }, unit_amount: Math.round((Number(booking.totalPrice) + discountAmount) * 100) },
      quantity: 1,
    }],
    discountAmount,
  };
}

// URLs de retorno sempre no domínio oficial (SITE_URL), nunca montadas a
// partir do cabeçalho Host da requisição. Sem payment_method_types fixo, o
// Stripe oferece os meios ativados no painel (cartão, Pix, boleto...).
export async function createBookingCheckoutSession(booking: Booking): Promise<string> {
  if (!stripe) throw new Error("Stripe não configurado");
  const { lineItems, discountAmount } = await buildCheckoutLineItems(booking);
  // Cupom: desconto de uso único criado no Stripe na hora, com o valor já
  // validado e gravado na reserva — o Stripe só aplica, não decide.
  let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
  if (discountAmount > 0) {
    const coupon = await stripe.coupons.create({
      amount_off: Math.round(discountAmount * 100),
      currency: "brl",
      duration: "once",
      max_redemptions: 1,
      name: `Cupom ${booking.cupomCode || "EcoSafari"}`.slice(0, 40),
    });
    discounts = [{ coupon: coupon.id }];
  }
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    discounts,
    customer_email: booking.customerEmail || undefined,
    metadata: { bookingId: booking.id },
    success_url: `${SITE_URL}/pagamento-confirmado?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/turista?pagamento=cancelado`,
  });
  if (!session.url) throw new Error("Stripe não devolveu a URL do checkout");
  return session.url;
}

// Signature-verified webhook: Stripe calls this directly (server-to-server),
// so it confirms payment even if the customer's browser never makes it back
// to /pagamento-confirmado. constructEvent() throws if the "stripe-signature"
// header doesn't match STRIPE_WEBHOOK_SECRET, which is what stops anyone
// from POSTing a fake "payment succeeded" event at this endpoint.
// Marca os consumos de uma sessão de checkout de consumo (não de reserva)
// como pagos — compartilhado entre o webhook e o retorno do navegador
// (GET /api/payments/confirm), mesma dualidade já usada pra confirmação de
// reserva via Stripe.
export async function applyConsumoPayment(session: Stripe.Checkout.Session) {
  const consumoIds = session.metadata?.consumoIds?.split(",").filter(Boolean);
  if (!consumoIds || consumoIds.length === 0) return false;
  const { error } = await supabase.from("consumos").update({ status: "pago" }).in("id", consumoIds).eq("status", "pendente");
  if (error) {
    log.error("Erro ao marcar consumo como pago via Stripe:", error.message);
    return false;
  }
  return true;
}

export async function handleStripeWebhook(req: express.Request, res: express.Response) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send("Stripe webhook não configurado");
  }

  const signature = req.headers["stripe-signature"];
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature as string, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    log.error("Assinatura do webhook Stripe inválida:", err.message);
    return res.status(400).send("Webhook Error: assinatura inválida");
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

// ----------------------------------------------------
// VOUCHER EM PDF & EMAIL DE CONFIRMAÇÃO (RESEND)
// ----------------------------------------------------

export function generateVoucherPdfBuffer(booking: Booking): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fillColor("#101B4C").fontSize(22).text("EcoSafari Brasil", { align: "left" });
    doc.fillColor("#666").fontSize(10).text("Voucher de Reserva Confirmada", { align: "left" });
    doc.moveDown(1.5);

    doc.strokeColor("#101B4C").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
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
    doc.strokeColor("#101B4C").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    doc.fontSize(14).fillColor("#101B4C").text(`Total pago: R$ ${booking.totalPrice.toLocaleString('pt-BR')}`);
    doc.moveDown(1.5);

    doc.fontSize(9).fillColor("#888").text(
      "Apresente este voucher (impresso ou digital) no check-in. Em caso de dúvidas, fale conosco pelo WhatsApp +55 65 99986-8334.",
      { width: 495 }
    );

    doc.end();
  });
}

export async function sendBookingConfirmationEmail(booking: Booking) {
  if (!resend || !booking.customerEmail) return;

  const pdfBuffer = await generateVoucherPdfBuffer(booking);

  await sendEmail({
    ...(await remetenteDaPousada(booking.pousadaId)),
    to: booking.customerEmail,
    subject: `Reserva confirmada — ${booking.pousadaName} (#${booking.id})`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #101B4C;">Pagamento confirmado! 🌿</h2>
        <p>Olá, ${escapeHtml(booking.customerName)}! Sua reserva na <strong>${escapeHtml(booking.pousadaName)}</strong> está confirmada.</p>
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

// Autoriza o acesso ao voucher de duas formas: (1) admin autenticado, ou
// (2) posse comprovada da sessão de pagamento Stripe que gerou esta reserva
// (?session_id=..., o mesmo valor que a página de confirmação já tem na URL
// logo após o checkout). Sem uma dessas duas provas, o UUID da reserva
// sozinho não abre mais o PDF de ninguém — antes disso, qualquer pessoa que
// descobrisse um booking.id (histórico do navegador, link encaminhado,
// captura de tela) conseguia baixar nome, email, datas e valor pago de
// qualquer hóspede, para sempre, sem nunca ter se autenticado.
export async function getAuthorizedBooking(req: express.Request, res: express.Response): Promise<Booking | null> {
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
    // O próprio hóspede baixa o voucher em "Minhas reservas" (e guarda no
    // celular para usar sem sinal) — só depois de pago.
    if (data.user?.email && data.user.email === booking.customerEmail && !["pendente_pagamento", "cancelado"].includes(booking.status)) {
      return booking as Booking;
    }
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

// Categorias fixas de interesse (passeios/aventuras, fauna/flora) que o
// turista marca no próprio perfil — espelha TOURIST_INTEREST_OPTIONS em
// src/lib/touristInterests.ts. Validado aqui filtrando qualquer valor fora
// da lista em vez de rejeitar a requisição inteira — defensivo contra o
// front enviar algo desatualizado, nunca quebra o cadastro/edição por causa
// disso.
export const TOURIST_INTEREST_OPTIONS = [
  "Trilhas guiadas", "Passeio de barco", "Focagem noturna", "Pesca esportiva",
  "Observação de aves", "Cavalgada", "Fotografia de vida selvagem", "Canoagem / Stand-up paddle",
  "Onça-pintada", "Jacarés", "Aves e araras", "Capivaras", "Primatas",
  "Vida aquática", "Flora do Pantanal", "Flora do Cerrado",
];

export function sanitizeTouristInterests(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is string => typeof v === "string" && TOURIST_INTEREST_OPTIONS.includes(v));
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const clip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

// Pousadas que o turista já visitou de verdade — inferido a partir de
// reservas pagas/confirmadas feitas com o mesmo email da conta (bookings não
// tem vínculo direto de turistaId, só o email do hóspede na hora da reserva).
export const VISITED_BOOKING_STATUSES = ["pago", "confirmado_pousada", "confirmado_guia", "confirmado_total"];

// ----------------------------------------------------
// RECOMPENSAS & RESGATES — o programa de Jaguars em si. Cada pousada cadastra
// os próprios brindes (recompensas); o turista troca Jaguars por um código,
// que a pousada confirma presencialmente (resgate). Os Jaguars em si nunca
// são gerados aqui — vêm só do app separado, ver POST /api/integrations/app-coins-sync.
// ----------------------------------------------------

export const RECOMPENSA_FIELDS = ["title", "description", "coinCost", "active"] as const;

// ----------------------------------------------------
// PRODUTOS & CONSUMO — catálogo de itens vendáveis (frigobar, vestuário,
// brindes) por pousada, e o registro de consumo de cada hóspede durante a
// estadia (a "comanda"). Cada produto tem um QR code fixo (gerado a partir
// do próprio id — ver GET /api/produtos/:id/qrcode) que a recepção escaneia
// pra lançar o consumo na reserva certa.
// ----------------------------------------------------

export const PRODUTO_FIELDS = ["name", "description", "category", "price", "active"] as const;

export const CANDIDATURA_PUBLIC_FIELDS = ["type", "name", "email", "phone", "message", "languages", "availability", "age", "experienceYears", "specialty", "pousadaName", "location", "capacity", "atracaoName", "atracaoType"] as const;

// REFERRAL SOURCES — pesquisa "como você chegou até nós?" no primeiro acesso.
// POST é público (qualquer visitante responde); GET é admin-only (estatísticas).
export const REFERRAL_SOURCE_FIELDS = ["source", "otherText"] as const;

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

export const REQUIRED_YES_VOTES: Record<"grant" | "revoke", number> = { grant: 3, revoke: 2 };

// Concede admin — se o email já tem conta (ex: um guia ou turista que também
// vai virar admin), só ACRESCENTA isAdmin=true ao app_metadata existente,
// nunca substitui: o papel de turista/parceiro que a conta já tinha continua
// intacto. Se não existir conta, cria uma nova (sem role nenhum, só admin).
export async function finalizeGrantAdmin(email: string): Promise<{ ok: boolean; message?: string; actionLink?: string | null }> {
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
export async function finalizeRevokeAdmin(userId: string | null): Promise<{ ok: boolean; message?: string }> {
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

// ----------------------------------------------------
// PARTNER SELF-SERVICE ACCESS (Supabase Auth)
// Lets a pousada/atração/guia log in and edit only their own profile — see
// requirePartnerAccess above for the ownership check every partner-editable
// route enforces. Invite/list/revoke here are admin-only (same
// service_role-backed pattern as ADMIN USER MANAGEMENT above); the partner
// never sets their own app_metadata, so they can't grant themselves access
// to a different record.
// ----------------------------------------------------

export const PARTNER_TABLE_BY_TYPE: Record<PartnerType, string> = {
  pousada: "pousadas",
  atracao: "atracoes",
  guia: "guides",
};

// Creates (or re-links, if the email already has an account) a Supabase
// Auth user and gets them access as fast as possible.
//
// Garante que exista um vínculo extra (além do "principal" em app_metadata)
// entre esse login de parceiro e uma propriedade — idempotente (upsert),
// então convidar a mesma pessoa pra mesma propriedade duas vezes não gera
// duplicata. Ver scripts/add-partner-links.sql.
export async function ensurePartnerLink(userId: string, partnerType: string, partnerId: string) {
  if (!userId || !partnerType || !partnerId) return;
  const { error } = await supabase.from("partner_links").upsert(
    { id: `pl_${userId}_${partnerType}_${partnerId}`, userId, partnerType, partnerId },
    { onConflict: "userId,partnerType,partnerId" }
  );
  if (error) log.warn("Erro ao vincular propriedade extra de parceiro:", error.message);
}

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
export function describeAuthError(err: any, fallback: string): string {
  const msg = err?.message;
  return typeof msg === "string" && msg.trim() && msg.trim() !== "{}" ? msg : fallback;
}

export async function provisionPartnerLogin(
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
      // Exceção: se já é parceiro e o convite novo também é de parceiro
      // (só que de outra propriedade), não é conflito — é dono de mais de
      // uma pousada/atração/guia. Soma como propriedade extra em
      // partner_links em vez de rejeitar ou sobrescrever a principal.
      if (existingMeta.role === "partner" && appMetadata.role === "partner") {
        await ensurePartnerLink(match.id, String((appMetadata as any).partnerType), String((appMetadata as any).partnerId));
        return { userId: match.id, actionLink: null, emailSent: false };
      }
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
    const sent = await sendEmail({
        to: email,
        subject: "Seu acesso de parceiro EcoSafari",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #101B4C;">Bem-vindo(a) à EcoSafari! 🌿</h2>
            <p>Seu acesso ao portal do parceiro foi criado. Clique no link abaixo para definir sua senha e acessar seu perfil:</p>
            <p><a href="${actionLink}" style="display:inline-block; background:#101B4C; color:#fff; padding:10px 20px; text-decoration:none; border-radius:4px;">Definir senha e acessar</a></p>
            <p style="color: #888; font-size: 12px;">Se o botão não funcionar, copie e cole este link no navegador:<br/>${actionLink}</p>
          </div>
        `,
      });
    emailSent = sent.ok;
  }

  return { userId, actionLink, emailSent };
}

export async function getPartnerUserFromRequest(req: express.Request) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

// Emails de todos os gestores de uma pousada (vínculo principal no
// app_metadata + vínculos extras em partner_links).
export async function getPousadaGestorEmails(pousadaId: string): Promise<string[]> {
  if (!supabaseAdminAuth) return [];
  const [{ data: usersData }, { data: links }] = await Promise.all([
    supabaseAdminAuth.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from("partner_links").select('"userId"').eq("partnerType", "pousada").eq("partnerId", pousadaId),
  ]);
  const linked = new Set(((links || []) as any[]).map(l => l.userId));
  return ((usersData?.users || []) as any[])
    .filter(u => u.email && u.app_metadata?.role === "partner" && ((u.app_metadata?.partnerType === "pousada" && u.app_metadata?.partnerId === pousadaId) || linked.has(u.id)))
    .map(u => u.email as string);
}

// ---------------- CAIXA (vendas no balcão) ----------------
export const PAYMENT_METHODS = ["dinheiro", "pix", "cartao_credito", "cartao_debito", "outro"] as const;
export const ACTIVE_BOOKING_STATUSES = ["confirmado_total", "confirmado_pousada", "confirmado_guia", "pago"];

// ---------------- COLABORADORES ----------------
export const COLAB_SERVICES_MAX = 15;
export const toCleanList = (v: unknown, maxItems: number, maxLen: number) =>
  (Array.isArray(v) ? v : []).map(x => clip(x, maxLen)).filter(Boolean).slice(0, maxItems);

export const mapColaborador = (c: any) => ({
  ...c,
  services: parseJSONSafe(c.services) || [],
  languages: parseJSONSafe(c.languages) || [],
  specialties: parseJSONSafe(c.specialties) || [],
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
export const KNOWN_FAKE_IDS: Record<string, string[]> = {
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

// ----------------------------------------------------
// INTELLIGENT WHATSAPP CHAT BOT (GEMINI ENGINE)
// ----------------------------------------------------

// Formats listings dynamically for the LLM to read
export async function getPousadasContext() {
  const { data } = await supabase.from("pousadas").select("*");
  return (data || []).map(mapPousadaRow).map(p => {
    return `- ID: "${p.id}", Nome: "${p.name}", Localização: "${p.location}", Preço/noite: R$ ${p.pricePerNight}, Capacidade: ${p.capacity} hóspedes. Experiências: [${p.experiences.map(e => `${e.title}: R$ ${e.price}`).join(", ")}]. Características: [${p.features.join(", ")}].`;
  }).join("\n");
}

// Só guias disponíveis — não faz sentido a IA recomendar alguém que não pode
// atender agora. Dados já eram públicos (o mesmo catálogo de /api/guides/public),
// só reaproveitados aqui pra deixar a Sofia sugerir o guia certo pelo
// idioma/especialidade/interesse em vez de sempre responder de forma genérica.
export async function getGuidesContext() {
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

export const AGENCY_WHATSAPP = "+55 65 99986-8334";

// ----------------------------------------------------
// SERVING FRONTEND VITE APP
// ----------------------------------------------------

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Injects pousada-specific <title>/description/Open Graph tags into the served
// index.html, so link previews on WhatsApp/Facebook/etc show the right pousada
// (those crawlers don't run JS, so client-side title updates alone don't work).
export function injectPousadaMeta(html: string, pousada: Pousada): string {
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
export const SITE_URL = (process.env.SITE_URL || "https://www.ecosafaribrasil.com.br").replace(/\/$/, "");
