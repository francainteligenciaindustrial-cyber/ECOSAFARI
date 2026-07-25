import { useState, useEffect } from "react";

function getPath(): string {
  const p = window.location.pathname.replace(/\/+$/, "");
  return p || "/";
}

// Minimal client-side router: no external dependency, consistent with the
// app's existing manual pathname checks (e.g. /seja-parceiro, /mobile).

const SCROLL_KEY_PREFIX = "ecosafari_scroll:";

function saveScrollPosition(path: string) {
  try {
    localStorage.setItem(SCROLL_KEY_PREFIX + path, String(window.scrollY));
  } catch {
    // localStorage unavailable (private mode, etc.) — scroll memory just won't persist
  }
}

function restoreScrollPosition(path: string) {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(SCROLL_KEY_PREFIX + path);
  } catch {
    saved = null;
  }

  if (saved === null) {
    window.scrollTo(0, 0);
    return;
  }

  const y = Number(saved);
  const apply = () => window.scrollTo(0, y);
  // Retried at a few delays because pages that fetch their own data
  // (e.g. PousadaOfficialSite) aren't full-height yet on first paint.
  requestAnimationFrame(apply);
  setTimeout(apply, 150);
  setTimeout(apply, 500);
}

let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null;
function trackScroll() {
  if (scrollSaveTimer) return;
  scrollSaveTimer = setTimeout(() => {
    saveScrollPosition(getPath());
    scrollSaveTimer = null;
  }, 150);
}

if (typeof window !== "undefined") {
  window.addEventListener("scroll", trackScroll, { passive: true });
  window.addEventListener("beforeunload", () => saveScrollPosition(getPath()));
}

export function useRoute(): string {
  const [path, setPath] = useState(getPath());

  useEffect(() => {
    const onChange = () => setPath(getPath());
    window.addEventListener("popstate", onChange);
    window.addEventListener("app-navigate", onChange);
    return () => {
      window.removeEventListener("popstate", onChange);
      window.removeEventListener("app-navigate", onChange);
    };
  }, []);

  useEffect(() => {
    restoreScrollPosition(path);
  }, [path]);

  return path;
}

export function navigate(path: string) {
  saveScrollPosition(getPath());
  window.history.pushState({}, "", path);
  window.dispatchEvent(new Event("app-navigate"));
}
