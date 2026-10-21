import React, { Suspense, lazy, useMemo, useState } from "react";
import { MapPin, Navigation, ExternalLink, Copy, Check, PawPrint, Plane } from "lucide-react";
import type { Pousada } from "../types";
import { useI18n } from "../i18n/I18nProvider";
import { useSightingStats, isPublishableAppSpecies } from "../lib/useSightingStats";
import { findWildSpecies } from "../data/wildSpecies";
import { approximatePosition } from "../data/places";
import { NEARBY_RADIUS_KM, speciesNearPousadas } from "../lib/nearbySightings";
import { directionsQueryUrl, directionsUrl, hasCoordinates, nearestReference, placeUrl, searchUrl, wazeQueryUrl, wazeUrl } from "../lib/mapsLinks";

const LocationMiniMap = lazy(() => import("./LocationMiniMap"));

const btn = "inline-flex items-center justify-center gap-2 text-[11px] uppercase tracking-widest font-bold px-3 py-2.5 whitespace-nowrap transition cursor-pointer";

// "Localização e como chegar" — padrão em toda pousada do catálogo:
//  - coordenada exata (marcada no portal): pino, rota até o ponto, Waze e
//    copiar coordenadas;
//  - só a cidade conhecida: mapa com a área aproximada, e os botões
//    procuram a pousada pelo NOME no Google Maps/Waze (o Google acha o
//    estabelecimento — melhor que um pino chutado);
//  - nada conhecido: só os botões pelo nome.
// Também: aeroporto mais próximo e, o que o Google não tem, os animais
// avistados por perto no app EcoSafari Go.
export default function PousadaLocation({ pousada }: { pousada: Pousada }) {
  const { t } = useI18n();
  const stats = useSightingStats();
  const [copied, setCopied] = useState(false);

  const exact = hasCoordinates(pousada);
  const approx = exact ? null : approximatePosition(pousada.location);
  const center = exact ? { lat: pousada.latitude as number, lng: pousada.longitude as number } : approx;
  const query = [pousada.name, pousada.location].filter(Boolean).join(", ");

  const nearby = useMemo(() => {
    if (!stats) return [];
    // Mesmo critério do mapa da home: só espécies do catálogo do app ou que
    // o site conhece (texto livre de teste não aparece).
    const ok = stats.species.filter(s => isPublishableAppSpecies(s) || findWildSpecies(s.name));
    const keys = new Set(ok.map(s => s.key));
    const result = speciesNearPousadas(
      [{ id: pousada.id, lat: center?.lat ?? 0, lng: center?.lng ?? 0, exact }],
      stats.points.filter(p => keys.has(p.speciesKey)),
      ok.map(s => ({ name: s.name, pousadaCounts: s.pousadaCounts || {} }))
    );
    return result[pousada.id] || [];
  }, [stats, pousada.id, center?.lat, center?.lng, exact]);

  const googleUrl = pousada.googleMapsUrl || (exact ? placeUrl(center!.lat, center!.lng) : searchUrl(query));
  const routeUrl = exact ? directionsUrl(center!.lat, center!.lng) : directionsQueryUrl(query);
  const wazeLink = exact ? wazeUrl(center!.lat, center!.lng) : wazeQueryUrl(query);
  const airport = center ? nearestReference(center.lat, center.lng) : null;
  const coordsText = exact ? `${center!.lat.toFixed(6)}, ${center!.lng.toFixed(6)}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(coordsText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* sem permissão de área de transferência */ }
  };

  return (
    <div className={`bg-white border border-editorial-border shadow-sm grid grid-cols-1 ${center ? "md:grid-cols-5" : ""}`}>
      {center && (
        <div className="md:col-span-3 bg-editorial-secondary">
          <Suspense fallback={<div className="h-64 flex items-center justify-center text-editorial-muted text-xs">{t("map.loading")}</div>}>
            <LocationMiniMap lat={center.lat} lng={center.lng} approximate={!exact} label={t("location.mapLabel", { name: pousada.name })} />
          </Suspense>
        </div>
      )}
      <div className={`${center ? "md:col-span-2" : ""} p-6 flex flex-col gap-4`}>
        <div>
          <h2 className="text-2xl font-serif font-bold text-editorial-primary mb-1">{t("location.title")}</h2>
          <p className="flex items-start gap-1.5 text-sm text-editorial-text"><MapPin className="h-4 w-4 mt-0.5 text-editorial-accent flex-shrink-0" /> {pousada.location}</p>
          {!exact && <p className="text-[11px] text-editorial-muted mt-1">{t(center ? "location.approximate" : "location.byName")}</p>}
        </div>

        {airport && airport.km <= 1500 && (
          <p className="flex items-start gap-1.5 text-xs text-editorial-muted">
            <Plane className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /> {t(exact ? "location.distance" : "location.distanceApprox", { km: airport.km, place: airport.name })}
          </p>
        )}

        <div className="grid grid-cols-1 gap-2">
          <a href={routeUrl} target="_blank" rel="noopener noreferrer" className={`${btn} bg-editorial-primary text-white hover:opacity-90`}>
            <Navigation className="h-4 w-4 flex-shrink-0" /> {t("location.directions")}
          </a>
          <div className="grid grid-cols-2 gap-2">
            <a href={googleUrl} target="_blank" rel="noopener noreferrer" className={`${btn} border border-editorial-primary text-editorial-primary hover:bg-editorial-secondary`}>
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" /> Google Maps
            </a>
            <a href={wazeLink} target="_blank" rel="noopener noreferrer" className={`${btn} border border-editorial-primary text-editorial-primary hover:bg-editorial-secondary`}>
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" /> Waze
            </a>
          </div>
          {exact && (
            <button type="button" onClick={copy} className="inline-flex items-center justify-center gap-1.5 text-[11px] text-editorial-muted hover:text-editorial-primary cursor-pointer">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? t("location.copied") : `${t("location.copy")} · ${coordsText}`}
            </button>
          )}
        </div>

        {nearby.length > 0 && (
          <div className="border-t border-editorial-border pt-4">
            <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-emerald-800 flex items-center gap-1.5 mb-2"><PawPrint className="h-3.5 w-3.5" /> {t("map.nearbyTitle")}</h3>
            <div className="flex flex-wrap gap-1.5">
              {nearby.slice(0, 8).map(s => (
                <span key={s.name} className="text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-full px-2 py-0.5">{s.name} · {s.count}</span>
              ))}
            </div>
            <p className="text-[10px] text-editorial-muted mt-2">{t("map.nearbyNote", { km: NEARBY_RADIUS_KM })}</p>
          </div>
        )}
      </div>
    </div>
  );
}
