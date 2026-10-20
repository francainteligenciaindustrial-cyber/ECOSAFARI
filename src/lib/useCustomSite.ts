import { useEffect, useState } from "react";
import { isPlatformHost } from "./customDomain";

export interface CustomSite { pousadaId: string; slug: string; mainUrl: string }

const PLATFORM_HOSTS = (import.meta.env.VITE_PLATFORM_HOSTS as string | undefined) || "";

// undefined = consultando; null = domínio da plataforma (fluxo normal);
// objeto = domínio próprio de uma pousada.
export function useCustomSite(): CustomSite | null | undefined {
  const [site, setSite] = useState<CustomSite | null | undefined>(() =>
    isPlatformHost(window.location.hostname, PLATFORM_HOSTS) ? null : undefined
  );

  useEffect(() => {
    if (site !== undefined) return;
    fetch(`/api/sites/by-host?host=${encodeURIComponent(window.location.hostname)}`)
      .then(res => (res.ok ? res.json() : null))
      .then((data: CustomSite | null) => setSite(data && data.slug ? data : null))
      .catch(() => setSite(null));
  }, [site]);

  return site;
}
