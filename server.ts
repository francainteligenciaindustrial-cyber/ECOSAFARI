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
import { Pousada, Guide, Booking, Sighting, Review, Notification, Species, Turista, Roteiro, Reserva, Pagamento, GuiaTuristico, Candidatura, ReferralSource, Atracao, PartnerType } from "./src/types.js";
import { slugify } from "./src/lib/slug.js";

dotenv.config();

const app = express();

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
  // Google reCAPTCHA v3, Meta Pixel, Supabase (API + Storage), Sentry.
  // If you add a new external script/embed later, this will block it until
  // its domain is added here — check the browser console for the CSP
  // violation, it names the exact directive/domain to add.
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' https://www.google.com https://www.gstatic.com https://connect.facebook.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://*.supabase.co https://www.google.com https://www.facebook.com https://*.sentry.io",
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
  console.log("Supabase: usando service_role key (RLS bypassada para o backend confiável).");
} else {
  console.warn("Supabase: SUPABASE_SERVICE_ROLE_KEY não configurada — usando anon key. Tabelas com RLS restrita ficarão inacessíveis ao backend até essa chave ser definida.");
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

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
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

// Verifies the caller is an authenticated admin (Supabase Auth JWT with
// app_metadata.role === "admin") before allowing access to admin-only routes.
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
      if (error || !data.user || data.user.app_metadata?.role !== "admin") {
        return res.status(403).json({ error: "Acesso restrito a administradores." });
      }
      // Stashed for routes that need to know which admin is calling — e.g.
      // preventing an admin from revoking their own access below.
      res.locals.adminUser = data.user;
      next();
    } catch (err) {
      res.status(401).json({ error: "Token inválido." });
    }
  },
];

// Any authenticated admin OR partner (of any type/record) — used for routes
// like image upload that don't belong to a specific resource yet, so there's
// nothing to scope ownership against. The real authorization boundary is
// still enforced downstream: an uploaded image is just a URL sitting in
// storage until it's attached to a record via a PUT that goes through
// requirePartnerAccess, which *does* check ownership.
const requireAdminOrPartner: express.RequestHandler[] = [
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
      if (error || !data.user || (role !== "admin" && role !== "partner")) {
        return res.status(403).json({ error: "Acesso restrito a administradores ou parceiros." });
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
        const role = data.user.app_metadata?.role;
        if (role === "admin") {
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
async function verifyRecaptcha(token: unknown): Promise<boolean> {
  if (!RECAPTCHA_SECRET_KEY) return true;
  if (typeof token !== "string" || !token) return false;
  try {
    const params = new URLSearchParams({ secret: RECAPTCHA_SECRET_KEY, response: token });
    const resp = await fetch("https://www.google.com/recaptcha/api/siteverify", { method: "POST", body: params });
    const data: any = await resp.json();
    return data.success === true && (typeof data.score !== "number" || data.score >= 0.5);
  } catch (err) {
    console.warn("Falha ao verificar reCAPTCHA (permitindo o envio):", err);
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
    console.log("Gemini API initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize Gemini client:", err);
  }
}

// Initialize Stripe safely — checkout falls back to the payment simulation
// button in the chatbot until a real key is provided.
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
let stripe: Stripe | null = null;
if (STRIPE_SECRET_KEY && STRIPE_SECRET_KEY !== "MY_STRIPE_SECRET_KEY") {
  try {
    stripe = new Stripe(STRIPE_SECRET_KEY);
    console.log("Stripe initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize Stripe client:", err);
  }
}
if (stripe && !STRIPE_WEBHOOK_SECRET) {
  console.warn("STRIPE_WEBHOOK_SECRET não configurada — o webhook /api/stripe/webhook ficará inativo e a confirmação de pagamento dependerá só do retorno do navegador.");
}

// Initialize Resend safely — booking confirmation emails are skipped
// (WhatsApp-only) until a real key is provided.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
let resend: Resend | null = null;
if (RESEND_API_KEY && RESEND_API_KEY !== "MY_RESEND_API_KEY") {
  try {
    resend = new Resend(RESEND_API_KEY);
    console.log("Resend initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize Resend client:", err);
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
    if (error) console.warn("Erro ao salvar notificação no Supabase:", error.message);
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
const POUSADA_CREATE_FIELDS = ["name", "description", "longDescription", "location", "pricePerNight", "images", "features", "activities", "experiences", "capacity", "videoUrl", "officialSiteUrl", "teamPhotoUrl", "teamSectionTitle", "teamSectionText", "officialSiteImages"] as const;
const POUSADA_UPDATE_FIELDS = [...POUSADA_CREATE_FIELDS, "verified"] as const;
const GUIDE_FIELDS = ["name", "email", "phone", "languages", "specialty", "status", "bio", "age", "birthplace", "interests", "photoUrl"] as const;
const SPECIES_FIELDS = ["name", "scientificName", "category", "description", "details", "sightings", "image", "bestPousadaId", "bestPousadaName"] as const;
const TURISTA_FIELDS = ["name", "email", "whatsapp", "country", "age", "preferences"] as const;
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
    rating: typeof p.rating === "number" ? p.rating : (p.rating ? parseFloat(p.rating) : 5),
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
    officialSiteImages: parseJSONSafe(p.officialSiteImages) || []
  };
}

// ----------------------------------------------------
// REST API ROUTES
// ----------------------------------------------------

// POUSADAS CRUD
app.get("/api/pousadas", async (req, res) => {
  const { data, error } = await supabase.from("pousadas").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar pousadas" });
  res.json((data || []).map(mapPousadaRow));
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
    console.warn("Erro ao atualizar contador de visualizações no Supabase:", error.message);
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

app.post("/api/upload-image", requireAdminOrPartner, (req, res) => {
  upload.single("file")(req, res, async (err: any) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });

    const detected = detectImageType(req.file.buffer);
    if (!detected) {
      return res.status(400).json({ error: "O conteúdo do arquivo não corresponde a uma imagem PNG, JPEG, WebP ou GIF válida." });
    }
    const objectPath = `uploads/${randomUUID()}.${detected.ext}`;

    const { error } = await supabase.storage
      .from("site-media")
      .upload(objectPath, req.file.buffer, { contentType: detected.contentType, upsert: false });

    if (error) {
      console.error("Erro ao subir imagem para o Supabase Storage:", error.message);
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
    console.error("Erro ao salvar pousada no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar pousada" });
  }
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
  res.json(mapPousadaRow(data));
});

app.delete("/api/pousadas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("pousadas").delete().eq("id", id);
  if (error) {
    console.error("Erro ao excluir pousada no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao excluir pousada" });
  }
  
  res.json({ success: true, message: "Pousada excluída com sucesso" });
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
    languages: toStringArray(g.languages),
    specialty: toStringArray(g.specialty),
    interests: toStringArray(g.interests),
    rating: typeof g.rating === "number" ? g.rating : (g.rating ? parseFloat(g.rating) : 5),
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
    console.error("Erro ao salvar guia no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar guia" });
  }
  res.status(201).json(newGuide);
});

app.put("/api/guides/:id", requirePartnerAccess("guia"), async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Guide>(req.body, GUIDE_FIELDS);
  const { data, error } = await supabase.from("guides").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Guia não encontrado" });
  res.json(mapGuideRow(data));
});

app.delete("/api/guides/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("guides").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir guia" });
  res.json({ success: true, message: "Guia excluído com sucesso" });
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
    rating: typeof a.rating === "number" ? a.rating : (a.rating ? parseFloat(a.rating) : 5),
    verified: typeof a.verified === "boolean" ? a.verified : false,
    dateCreated: a.dateCreated || ""
  };
}

const ATRACAO_FIELDS = ["type", "name", "description", "location", "images", "menu"] as const;

app.get("/api/atracoes", async (req, res) => {
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
    rating: 5,
    verified: false,
    dateCreated: new Date().toISOString(),
  } as Atracao;
  const { error } = await supabase.from("atracoes").insert(newAtracao);
  if (error) {
    console.error("Erro ao salvar atração no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar atração" });
  }
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
  res.json(mapAtracaoRow(data));
});

app.delete("/api/atracoes/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("atracoes").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir atração" });
  res.json({ success: true, message: "Atração excluída com sucesso" });
});

// BOOKINGS CRUD & FLOWS
app.get("/api/bookings", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("bookings").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar reservas" });
  res.json(data);
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
app.post("/api/bookings", requireAdmin, async (req, res) => {
  const { pousadaId, checkIn, checkOut, adults, children } = req.body;
  const { data: pousadaRow, error: pErr } = await supabase.from("pousadas").select("*").eq("id", pousadaId).maybeSingle();
  if (pErr || !pousadaRow) {
    return res.status(404).json({ error: "Pousada não encontrada" });
  }
  const targetPousada = mapPousadaRow(pousadaRow);

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

  const totalGuestsAlready = overlappingBookings.reduce((acc, curr) => acc + curr.adults + curr.children, 0);
  const newGuests = (adults || 1) + (children || 0);

  if (totalGuestsAlready + newGuests > targetPousada.capacity) {
    // Over capacity, suggest alternative dates
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
    dateCreated: new Date().toISOString()
  };

  const { error } = await supabase.from("bookings").insert(newBooking);
  if (error) {
    console.error("Erro ao salvar reserva no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao criar reserva" });
  }

  addNotification("admin", `Nova reserva criada: ${newBooking.customerName} na ${newBooking.pousadaName}.`, "booking_new", newBooking.id);

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
  if (error) console.error("Erro ao salvar tokens do Google Calendar no Supabase:", error.message);
  else console.log("Tokens do Google Calendar salvos com sucesso.");
}

async function deleteTokens(): Promise<void> {
  const { error } = await supabase.from("app_secrets").delete().eq("key", GOOGLE_TOKENS_KEY);
  if (error) console.error("Erro ao excluir tokens do Google Calendar no Supabase:", error.message);
  else console.log("Tokens do Google Calendar excluídos.");
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
    console.log("Sem tokens salvos do Google Calendar. Pulando sincronização.");
    return null;
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.log("GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET não configurados.");
    return null;
  }

  try {
    const oauth2Client = getOAuthClient(req);
    oauth2Client.setCredentials(tokens);

    oauth2Client.on("tokens", (newTokens) => {
      (async () => {
        const currentTokens = (await loadStoredTokens()) || {};
        const merged = { ...currentTokens, ...newTokens };
        await saveTokens(merged);
      })().catch(err => console.error("Erro ao persistir tokens renovados do Google Calendar:", err));
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
      calendarId: "primary",
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

    console.log("Evento no Google Calendar criado com sucesso:", response.data.id);
    return response.data.id;
  } catch (err) {
    console.error("Erro ao criar evento no Google Calendar:", err);
    return null;
  }
}

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
    console.error("Erro ao obter info do usuário Google:", err);
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
    console.error("Erro ao trocar código por tokens:", err);
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
      console.error("Erro na integração do Google Calendar:", calErr);
      updated.googleCalendarEventId = `gc_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  const { data: savedBooking, error } = await supabase.from("bookings").update(updated).eq("id", id).select().single();
  if (error) console.warn("Erro ao atualizar reserva no Supabase:", error.message);

  // Email confirmation with PDF voucher (only sends if RESEND_API_KEY is configured)
  if (status === "pago" && oldBooking.status !== "pago") {
    sendBookingConfirmationEmail(updated).catch(err => console.warn("Erro ao enviar email de confirmação:", err.message));
  }

  return (savedBooking as Booking) || updated;
}

app.put("/api/bookings/:id/status", requireAdmin, async (req, res) => {
  const updated = await applyBookingStatusUpdate(req.params.id, req.body, req);
  if (!updated) {
    return res.status(404).json({ error: "Reserva não encontrada" });
  }
  res.json(updated);
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
    console.error("Erro ao criar sessão de checkout Stripe:", err.message);
    res.status(500).json({ error: "Erro ao criar sessão de pagamento" });
  }
});

// Signature-verified webhook: Stripe calls this directly (server-to-server),
// so it confirms payment even if the customer's browser never makes it back
// to /pagamento-confirmado. constructEvent() throws if the "stripe-signature"
// header doesn't match STRIPE_WEBHOOK_SECRET, which is what stops anyone
// from POSTing a fake "payment succeeded" event at this endpoint.
async function handleStripeWebhook(req: express.Request, res: express.Response) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send("Stripe webhook não configurado");
  }

  const signature = req.headers["stripe-signature"];
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature as string, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("Assinatura do webhook Stripe inválida:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    const bookingId = session.metadata?.bookingId;
    if (session.payment_status === "paid" && bookingId) {
      try {
        await applyBookingStatusUpdate(bookingId, { status: "pago" }, req);
      } catch (err: any) {
        console.error("Erro ao confirmar reserva via webhook Stripe:", err.message);
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
      return res.status(400).json({ error: "Reserva não identificada na sessão de pagamento" });
    }
    const updated = await applyBookingStatusUpdate(bookingId, { status: "pago" }, req);
    if (!updated) {
      return res.status(404).json({ error: "Reserva não encontrada" });
    }
    res.json({ booking: updated });
  } catch (err: any) {
    console.error("Erro ao confirmar pagamento Stripe:", err.message);
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

app.get("/api/bookings/:id/voucher.pdf", async (req, res) => {
  const { data: booking, error: fetchErr } = await supabase.from("bookings").select("*").eq("id", req.params.id).maybeSingle();
  if (fetchErr || !booking) {
    return res.status(404).json({ error: "Reserva não encontrada" });
  }
  try {
    const buffer = await generateVoucherPdfBuffer(booking);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="voucher-${booking.id}.pdf"`);
    res.send(buffer);
  } catch (err: any) {
    console.error("Erro ao gerar voucher PDF:", err.message);
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
    likes: 0
  };

  const { error } = await supabase.from("sightings").insert(newSighting);
  if (error) {
    console.error("Erro ao salvar avistamento no Supabase:", error.message);
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
app.get("/api/reviews", async (req, res) => {
  const { data, error } = await supabase.from("reviews").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar avaliações" });
  res.json(data);
});

// A review targets exactly one of pousada/atração/guia — this table backs
// "avaliações" for all three partner kinds instead of a separate reviews
// table per kind. Whichever *Id is present in the body decides both which
// column gets set and which partner's average "rating" gets recalculated.
app.post("/api/reviews", publicFormLimiter, async (req, res) => {
  const { pousadaId, atracaoId, guideId } = req.body;
  const targetCount = [pousadaId, atracaoId, guideId].filter(Boolean).length;
  if (targetCount !== 1) {
    return res.status(400).json({ error: "Informe exatamente um de pousadaId, atracaoId ou guideId." });
  }

  const newReview: Review = {
    id: `r_${randomUUID()}`,
    pousadaId: pousadaId || undefined,
    atracaoId: atracaoId || undefined,
    guideId: guideId || undefined,
    userName: req.body.userName || "Turista Satisfeito",
    rating: req.body.rating || 5,
    comment: req.body.comment,
    date: new Date().toISOString().split("T")[0],
    photoUrl: req.body.photoUrl || undefined
  };

  const { error } = await supabase.from("reviews").insert(newReview);
  if (error) {
    console.error("Erro ao salvar avaliação no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar avaliação" });
  }

  // Recalculate the target's average rating from every review it has now
  const [column, table] = pousadaId ? ["pousadaId", "pousadas"] : atracaoId ? ["atracaoId", "atracoes"] : ["guideId", "guides"];
  const targetId = pousadaId || atracaoId || guideId;
  const { data: targetReviews } = await supabase.from("reviews").select("rating").eq(column, targetId);
  if (targetReviews && targetReviews.length > 0) {
    const avg = Number((targetReviews.reduce((sum, r) => sum + r.rating, 0) / targetReviews.length).toFixed(1));
    const { error: ratingErr } = await supabase.from(table).update({ rating: avg }).eq("id", targetId);
    if (ratingErr) console.warn(`Erro ao atualizar nota (${table}) no Supabase:`, ratingErr.message);
  }

  res.status(201).json(newReview);
});

// NOTIFICATIONS
app.get("/api/notifications", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("notifications").select("*");
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
    console.error("Erro ao salvar espécie no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar espécie" });
  }
  res.status(201).json(newSpecie);
});

app.put("/api/species/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Species>(req.body, SPECIES_FIELDS);
  const { data, error } = await supabase.from("species").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Espécie não encontrada" });
  res.json(data);
});

app.delete("/api/species/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("species").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir espécie" });
  res.json({ success: true, message: "Espécie excluída com sucesso" });
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
    console.error("Erro ao salvar turista no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar turista" });
  }
  res.status(201).json(newTurista);
});

app.put("/api/turistas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Turista>(req.body, TURISTA_FIELDS);
  const { data, error } = await supabase.from("turistas").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Turista não encontrado" });
  res.json(data);
});

app.delete("/api/turistas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("turistas").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir turista" });
  res.json({ success: true, message: "Turista excluído com sucesso" });
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
    console.error("Erro ao salvar roteiro no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar roteiro" });
  }
  res.status(201).json(newRoteiro);
});

app.put("/api/roteiros/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Roteiro>(req.body, ROTEIRO_FIELDS);
  const { data, error } = await supabase.from("roteiros").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Roteiro não encontrado" });
  res.json(data);
});

app.delete("/api/roteiros/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("roteiros").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir roteiro" });
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
    console.error("Erro ao salvar reserva no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar reserva" });
  }
  res.status(201).json(newReserva);
});

app.put("/api/reservas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Reserva>(req.body, RESERVA_FIELDS);
  const { data, error } = await supabase.from("reservas").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Reserva não encontrada" });
  res.json(data);
});

app.delete("/api/reservas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("reservas").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir reserva" });
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
    console.error("Erro ao salvar pagamento no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar pagamento" });
  }
  res.status(201).json(newPagamento);
});

app.put("/api/pagamentos/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Pagamento>(req.body, PAGAMENTO_FIELDS);
  const { data, error } = await supabase.from("pagamentos").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Pagamento não encontrado" });
  res.json(data);
});

app.delete("/api/pagamentos/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("pagamentos").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir pagamento" });
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
    console.error("Erro ao salvar guia no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar guia" });
  }
  res.status(201).json(newGuia);
});

app.put("/api/guias/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<GuiaTuristico>(req.body, GUIA_TURISTICO_FIELDS);
  const { data, error } = await supabase.from("guias").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Guia não encontrado" });
  res.json(data);
});

app.delete("/api/guias/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("guias").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir guia" });
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
    console.error("Erro ao salvar candidatura no Supabase:", error.message);
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
  res.json(data);
});

app.delete("/api/candidaturas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("candidaturas").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir candidatura" });
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
    if (error) console.warn("Erro ao salvar origem do visitante no Supabase:", error.message);
  } catch (err: any) {
    console.warn("Erro ao salvar origem do visitante no Supabase:", err.message);
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
// Lets an existing admin invite/revoke other admins from the dashboard
// itself, instead of requiring terminal + service_role access to run
// scripts/create-admin.ts every time someone new needs access.
// ----------------------------------------------------

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — gestão de administradores indisponível." });
  const { data, error } = await supabaseAdminAuth.auth.admin.listUsers({ perPage: 200 });
  if (error || !data?.users) return res.status(500).json({ error: "Erro ao listar administradores." });
  const admins = data.users
    .filter((u: any) => u.app_metadata?.role === "admin")
    .map((u: any) => ({ id: u.id, email: u.email, createdAt: u.created_at, lastSignInAt: u.last_sign_in_at || null }));
  res.json(admins);
});

app.post("/api/admin/users", requireAdmin, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — gestão de administradores indisponível." });
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Informe um email válido." });
  }

  // Created directly with app_metadata.role="admin" (same as
  // scripts/create-admin.ts) with a random password the invitee never
  // needs to know — they set their own via the recovery link below.
  const { data: created, error: createErr } = await supabaseAdminAuth.auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
    app_metadata: { role: "admin" },
  });
  if (createErr || !created.user) {
    return res.status(400).json({ error: createErr?.message || "Erro ao criar administrador (o email já pode estar em uso)." });
  }

  // A recovery link the new admin uses to set their own password —
  // generated directly instead of relying on Supabase's transactional email
  // (which needs SMTP configured and isn't guaranteed to be set up on every
  // deploy). Returned to the calling admin to copy and send manually,
  // mirroring the candidatura status-link pattern already used elsewhere.
  const { data: linkData, error: linkErr } = await supabaseAdminAuth.auth.admin.generateLink({ type: "recovery", email });
  if (linkErr) {
    console.warn("Administrador criado, mas falha ao gerar link de acesso:", linkErr.message);
  }

  res.status(201).json({
    user: { id: created.user.id, email: created.user.email },
    actionLink: linkData?.properties?.action_link || null,
  });
});

// Revokes admin access (clears app_metadata.role) rather than deleting the
// Supabase Auth account outright — reversible from the Supabase dashboard if
// it turns out to be a mistake. A caller can never revoke their own access
// through this route, so one admin can't accidentally lock everyone out.
app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — gestão de administradores indisponível." });
  const { id } = req.params;
  const requester = res.locals.adminUser as { id: string } | undefined;
  if (requester?.id === id) {
    return res.status(400).json({ error: "Você não pode remover seu próprio acesso por aqui." });
  }
  const { error } = await supabaseAdminAuth.auth.admin.updateUserById(id, { app_metadata: { role: null } });
  if (error) return res.status(500).json({ error: "Erro ao revogar acesso." });
  res.json({ success: true });
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
// Auth user and gets them access as fast as possible: tries
// inviteUserByEmail first, which is the only admin API call that both
// creates the user AND actually emails them via whatever mail sending is
// configured on this Supabase project — createUser+generateLink (the
// previous approach here) only ever mints a link, it never sends anything.
// app_metadata (the actual role/partnerId authorization) has to be set in a
// second call either way since inviteUserByEmail doesn't accept it directly.
// A recovery link is always generated too so the caller has something to
// copy/share manually if the automatic email doesn't land (e.g. no custom
// SMTP configured — Supabase's default mail sending is rate-limited on the
// free tier).
async function provisionPartnerLogin(
  email: string,
  appMetadata: Record<string, unknown>
): Promise<{ userId: string | null; actionLink: string | null; emailSent: boolean; error?: string }> {
  if (!supabaseAdminAuth) return { userId: null, actionLink: null, emailSent: false, error: "SUPABASE_SERVICE_ROLE_KEY não configurada." };

  let userId: string | null = null;
  let emailSent = false;

  const { data: invited, error: inviteErr } = await supabaseAdminAuth.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${SITE_URL}/parceiro`,
  });
  if (invited?.user) {
    userId = invited.user.id;
    emailSent = true;
  } else {
    // inviteUserByEmail refuses to touch an email that already has an
    // account (e.g. re-inviting after a revoke, or applying twice) — look
    // them up instead of treating that as a hard failure.
    const { data: existing, error: listErr } = await supabaseAdminAuth.auth.admin.listUsers({ perPage: 1000 });
    const match = existing?.users?.find((u: any) => u.email?.toLowerCase() === email);
    if (!match) return { userId: null, actionLink: null, emailSent: false, error: inviteErr?.message || listErr?.message || "Erro ao criar acesso." };

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
  if (updateErr) return { userId, actionLink: null, emailSent: false, error: updateErr.message };

  const { data: linkData, error: linkErr } = await supabaseAdminAuth.auth.admin.generateLink({ type: "recovery", email });
  if (linkErr) console.warn("Acesso criado, mas falha ao gerar link de apoio:", linkErr.message);
  return { userId, actionLink: linkData?.properties?.action_link || null, emailSent };
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
      languages: splitCommaList(candidatura.languages),
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
      rating: 5,
      verified: false,
      dateCreated: new Date().toISOString(),
    };
  }

  const { error: insertErr } = await supabase.from(table).insert(newRecord);
  if (insertErr) {
    console.error(`Erro ao criar parceiro (${table}) a partir da candidatura:`, insertErr.message);
    return res.status(500).json({ error: "Erro ao criar o registro do parceiro." });
  }

  // The partner record was already created successfully above — a login
  // failure here (e.g. Supabase Auth hiccup) shouldn't be reported as a hard
  // failure, since an admin can still invite access manually from the new
  // record's own "Acesso de parceiro" panel.
  const loginResult = await provisionPartnerLogin(email, { role: "partner", partnerType, partnerId: newRecord.id });
  if (loginResult.error) console.warn("Registro do parceiro criado, mas falha ao criar login:", loginResult.error);

  const { data: updatedCandidatura, error: updateErr } = await supabase
    .from("candidaturas")
    .update({ status: "aprovado", partnerId: newRecord.id })
    .eq("id", id)
    .select()
    .single();
  if (updateErr) console.warn("Parceiro criado, mas falha ao marcar candidatura como aprovada:", updateErr.message);

  res.status(201).json({
    candidatura: updatedCandidatura || { ...candidatura, status: "aprovado", partnerId: newRecord.id },
    partnerType,
    partnerId: newRecord.id,
    actionLink: loginResult.actionLink,
    loginCreated: !loginResult.error,
    emailSent: loginResult.emailSent,
  });
});

app.delete("/api/partners/access/:userId", requireAdmin, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — gestão de acesso de parceiros indisponível." });
  const { error } = await supabaseAdminAuth.auth.admin.updateUserById(req.params.userId, { app_metadata: { role: null } });
  if (error) return res.status(500).json({ error: "Erro ao revogar acesso." });
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
  rating FLOAT DEFAULT 5.0,
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
  "officialSiteImages" TEXT -- armazenado como string JSON, igual images
);

-- Caso a tabela já exista de uma execução anterior deste script, garante as novas colunas
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT true;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "viewCount" INTEGER DEFAULT 0;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "officialSiteUrl" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "teamPhotoUrl" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "teamSectionTitle" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "teamSectionText" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "officialSiteImages" TEXT;

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
  rating FLOAT DEFAULT 5.0
);

-- Caso a tabela já exista de uma execução anterior deste script
ALTER TABLE guides ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS birthplace TEXT;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS interests TEXT;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS rating FLOAT DEFAULT 5.0;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;

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
  rating FLOAT DEFAULT 5.0,
  verified BOOLEAN DEFAULT false,
  "dateCreated" TEXT
);

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
  "photoUrl" TEXT
);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "atracaoId" TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "guideId" TEXT;

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
  const pousadasContext = await getPousadasContext();
  const systemInstruction = `Você é a "Sofia", assistente de suporte do site da agência de turismo ecológico "EcoSafari Brasil".
Seu único papel é responder dúvidas PÚBLICAS sobre o site e as pousadas parceiras: localizações, preços de diária, experiências e atividades disponíveis, estrutura das pousadas, e dúvidas gerais de viagem (documentação, vacinas, o que levar, melhor época para avistamentos).

Catálogo público de pousadas parceiras:
${pousadasContext}

Regras importantes:
1. Você NÃO coleta dados pessoais do cliente e NÃO fecha reservas, pagamentos ou datas — isso é feito só pela equipe humana.
2. Sempre que o cliente quiser reservar, pagar, negociar preço, tratar de algo específico da viagem dele, ou qualquer coisa que exija um atendimento humano, direcione educadamente para o WhatsApp oficial da agência: ${AGENCY_WHATSAPP} (ex: "Para seguir com sua reserva, é só chamar a gente no WhatsApp oficial: ${AGENCY_WHATSAPP} 😊").
3. Seja breve, calorosa e direta — respostas curtas, adequadas para leitura rápida, sem blocos gigantes de texto.`;

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
      console.error("Gemini invocation failed, using fallback:", err);
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
  console.error("Erro não tratado:", err);
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
    console.log(`Server running on port ${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startLocalServer();
}

export default app;
