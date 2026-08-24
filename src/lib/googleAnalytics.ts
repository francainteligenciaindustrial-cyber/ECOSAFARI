// Google Analytics 4 (gtag.js) — loaded only when VITE_GA_MEASUREMENT_ID is
// set, so it costs nothing when unconfigured. Sem isso, ninguém enxerga
// funil de conversão (visita → catálogo → detalhes → checkout), origem de
// tráfego real ou taxa de abandono — só o Meta Pixel mede quem veio de
// anúncio, não o que aconteceu depois. Segue o mesmo padrão de
// metaPixel.ts: mesma env-var-opcional, mesmo gate de consentimento.
//
// É um cookie de análise, então só carrega se o visitante já aceitou o
// banner de cookies (ver CookieConsentBanner) — chamado tanto no startup
// (caso o consentimento tenha sido dado numa visita anterior) quanto na hora
// que o botão "Aceitar" dispara, pra ativar na hora sem precisar recarregar.
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
const COOKIE_CONSENT_KEY = "ecosafari_cookie_consent";

let initialized = false;

export function initGoogleAnalytics() {
  if (initialized || !GA_MEASUREMENT_ID || typeof window === "undefined") return;
  if (localStorage.getItem(COOKIE_CONSENT_KEY) !== "accepted") return;
  initialized = true;

  const w = window as any;
  if (w.gtag) return;

  w.dataLayer = w.dataLayer || [];
  function gtag(...args: any[]) {
    w.dataLayer.push(args);
  }
  w.gtag = gtag;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID);
}

// Evento nomeado (ex: "select_pousada", "begin_checkout") pra medir o funil
// de reserva além do pageview automático do GA4.
export function trackGAEvent(eventName: string, params?: Record<string, unknown>) {
  const w = window as any;
  if (!GA_MEASUREMENT_ID || !w.gtag) return;
  w.gtag("event", eventName, params);
}
