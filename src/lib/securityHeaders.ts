// Fonte única dos cabeçalhos de segurança do site. O Express (server.ts)
// aplica estes valores em toda resposta que passa por ele, e o vercel.json
// repete os mesmos valores para o que a CDN da Vercel serve direto (SPA e
// assets estáticos) — JSON não importa TypeScript, então a cópia lá é
// inevitável. securityHeaders.test.ts falha o CI se as duas divergirem.
//
// Allowlist reflete os terceiros que o app realmente carrega: Google
// reCAPTCHA v3, Google Tradutor (LanguageSwitcher), Meta Pixel, Google
// Analytics 4, Supabase (API + Storage), Sentry, YouTube/Drive (vídeos das
// pousadas). Ao adicionar um script/embed externo novo, inclua o domínio
// aqui E no vercel.json — o console do navegador mostra a diretiva exata
// que bloqueou.
export const CSP_DIRECTIVES: readonly string[] = [
  "default-src 'self'",
  "script-src 'self' https://www.google.com https://www.gstatic.com https://connect.facebook.net https://www.googletagmanager.com https://translate.google.com https://translate.googleapis.com https://translate-pa.googleapis.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://www.gstatic.com https://translate.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self' https://*.supabase.co https://www.google.com https://www.facebook.com https://*.sentry.io https://www.googletagmanager.com https://*.google-analytics.com https://translate.googleapis.com https://translate-pa.googleapis.com",
  // YouTube (modo sem cookies) e Google Drive: vídeos de apresentação das
  // pousadas colados pelo gestor na Galeria de Fotos.
  "frame-src https://www.google.com https://www.youtube-nocookie.com https://www.youtube.com https://drive.google.com https://translate.google.com",
  "media-src 'self' blob: https://*.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

export const CONTENT_SECURITY_POLICY = CSP_DIRECTIVES.join("; ");

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // camera=(self): o leitor de QR dos produtos (Caixa/Consumo) usa a câmera
  // do próprio site — "camera=()" bloqueava o scanner em produção.
  "Permissions-Policy": "geolocation=(), microphone=(), camera=(self)",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
};
