// Meta (Facebook/Instagram) Ads Pixel — loaded only when VITE_META_PIXEL_ID
// is set, so it costs nothing when unconfigured. Without this, ad spend on
// this page can't be measured or optimized: Meta has no signal for which
// visitors actually became leads, so it can't learn who to show the ad to.
//
// It's still an advertising/tracking cookie, so it only loads if the visitor
// already accepted the cookie banner (see CookieConsentBanner) — called both
// at startup (in case consent was accepted in an earlier visit) and right
// when the banner's "Aceitar" button fires, so it activates immediately
// without needing a page reload.
const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined;
const COOKIE_CONSENT_KEY = "ecosafari_cookie_consent";

let initialized = false;

export function initMetaPixel() {
  if (initialized || !META_PIXEL_ID || typeof window === "undefined") return;
  if (localStorage.getItem(COOKIE_CONSENT_KEY) !== "accepted") return;
  initialized = true;

  const w = window as any;
  if (w.fbq) return;

  const n: any = (w.fbq = function (...args: any[]) {
    n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
  });
  w._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = "2.0";
  n.queue = [];

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  n("init", META_PIXEL_ID);
  n("track", "PageView");
}

// Fire a standard conversion event (e.g. "Lead" when someone submits the
// partner signup form) so Meta Ads can attribute and optimize for it.
export function trackMetaEvent(eventName: string, params?: Record<string, unknown>) {
  const w = window as any;
  if (!META_PIXEL_ID || !w.fbq) return;
  w.fbq("track", eventName, params);
}
