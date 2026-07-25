// Optional Sentry wiring for the frontend. Dynamically imports @sentry/react
// only when VITE_SENTRY_DSN is set, so unconfigured deployments pay zero
// bundle cost for it — same graceful-degradation pattern the backend uses
// for Stripe/Resend/Google Calendar (see server.ts).
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let initPromise: Promise<typeof import("@sentry/react")> | null = null;

async function getSentry() {
  if (!SENTRY_DSN) return null;
  if (!initPromise) {
    initPromise = import("@sentry/react").then((Sentry) => {
      Sentry.init({ dsn: SENTRY_DSN, tracesSampleRate: 0.1 });
      return Sentry;
    });
  }
  return initPromise;
}

export async function captureException(error: unknown, context?: Record<string, unknown>) {
  const Sentry = await getSentry().catch(() => null);
  if (Sentry) Sentry.captureException(error, context ? { extra: context } : undefined);
}

// Fires once at app startup (see main.tsx) so errors thrown outside React's
// render cycle — event handlers, timers, rejected promises — get reported
// too, not just the ones ErrorBoundary catches during render.
export function installGlobalErrorReporting() {
  if (!SENTRY_DSN) return;
  window.addEventListener("error", (e) => captureException(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => captureException(e.reason));
}
