// Domínio próprio de pousada (ex.: pousadavagalume.com) apontando para o
// mesmo deploy do EcoSafari: o front descobre pelo hostname qual site
// oficial mostrar. Hosts da plataforma nunca consultam a API.

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/^www\./, "");
}

// Domínios da própria plataforma. VITE_PLATFORM_HOSTS (separados por
// vírgula) acrescenta o domínio definitivo do EcoSafari quando existir.
export function isPlatformHost(hostname: string, extra: string = ""): boolean {
  const host = normalizeHost(hostname);
  if (!host || host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.endsWith(".vercel.app")) return true;
  const configured = ["ecosafaribrasil.com.br", ...extra.split(",")].map(normalizeHost).filter(Boolean);
  return configured.includes(host);
}

// Valida o que o admin digita no cadastro: só o domínio, sem http nem barra.
export function isValidCustomDomain(value: string): boolean {
  const host = normalizeHost(value);
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host) && !isPlatformHost(host);
}
