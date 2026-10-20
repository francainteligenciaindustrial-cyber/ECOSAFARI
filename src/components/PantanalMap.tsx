import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useI18n } from "../i18n/I18nProvider";
import { navigate } from "../lib/router";
import { approximatePosition, spread } from "../data/places";
import { findWildSpecies, WILD_SPECIES, SightingArea } from "../data/wildSpecies";
import type { Atracao, Pousada } from "../types";
import type { SightingPoint } from "../lib/sightingStats";

interface SpeciesLike { id: string; name: string }

interface Props {
  pousadas: Pousada[];
  atracoes: Atracao[];
  species: SpeciesLike[];
  onSelectPousada: (p: Pousada) => void;
  // Avistamentos aprovados no app EcoSafari Go, agregados (~1 km).
  sightingPoints?: SightingPoint[];
}

const COLORS = { pousada: "#101B4C", atracao: "#F28C00", species: "#3F8A2E", app: "#1580B5" };

// Pino tracejado = posição aproximada (só a cidade é conhecida).
function pin(color: string, approximate: boolean): L.DivIcon {
  const ring = approximate ? "border-style:dashed;" : "";
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;${ring}box-shadow:0 1px 4px rgba(0,0,0,.45)"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

// Popup montado com DOM (textContent), nunca com HTML: nome e local vêm do
// cadastro dos parceiros.
function popupContent(title: string, subtitle: string, action?: { label: string; onClick: () => void }): HTMLElement {
  const box = document.createElement("div");
  box.style.minWidth = "160px";
  const h = document.createElement("strong");
  h.textContent = title;
  h.style.cssText = "display:block;font-family:'Playfair Display',Georgia,serif;color:#101B4C";
  const p = document.createElement("span");
  p.textContent = subtitle;
  p.style.cssText = "display:block;font-size:11px;color:#5E6670;margin-top:2px";
  box.append(h, p);
  if (action) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = action.label;
    b.style.cssText = "margin-top:8px;background:#101B4C;color:#fff;border:0;padding:6px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;cursor:pointer";
    b.addEventListener("click", action.onClick);
    box.append(b);
  }
  return box;
}

// O catálogo é recarregado a cada minuto (App.tsx) com arrays novos de mesmo
// conteúdo — a chave por conteúdo evita redesenhar e reenquadrar o mapa
// (perdendo o zoom do usuário) quando nada mudou de fato.
const contentKey = (items: { id: string; latitude?: number; longitude?: number; location?: string }[]) =>
  items.map(i => `${i.id}:${i.latitude ?? ""}:${i.longitude ?? ""}:${i.location ?? ""}`).join("|");

export default function PantanalMap({ pousadas: pousadasProp, atracoes: atracoesProp, species, onSelectPousada, sightingPoints = [] }: Props) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pousadas = useMemo(() => pousadasProp, [contentKey(pousadasProp)]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const atracoes = useMemo(() => atracoesProp, [contentKey(atracoesProp)]);
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [filter, setFilter] = useState("all");
  const [missing, setMissing] = useState(0);
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && !navigator.onLine);
  // Callback do pai muda a cada render; o ref evita redesenhar o mapa (e
  // perder o zoom do usuário) por causa disso.
  const onSelectRef = useRef(onSelectPousada);
  onSelectRef.current = onSelectPousada;

  // Espécies com áreas conhecidas: as do banco (casadas pelo nome) ou as
  // educativas padrão.
  const speciesAreas = useMemo(() => {
    const list = species.length > 0 ? species : WILD_SPECIES.map(s => ({ id: s.id, name: s.text.pt.name }));
    return list
      .map(s => ({ id: s.id, name: s.name, areas: (findWildSpecies(s.id) || findWildSpecies(s.name))?.areas || [] }))
      .filter(s => s.areas.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [species.map(s => `${s.id}:${s.name}`).join("|")]);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([-16.9, -56.6], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 16,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds: L.LatLngTuple[] = [];
    const perPlace = new Map<string, number>();
    let semPosicao = 0;

    const place = (lat: number | undefined, lng: number | undefined, location: string | undefined) => {
      const exact = typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng);
      const base = exact ? { lat: lat as number, lng: lng as number } : approximatePosition(location);
      if (!base) { semPosicao++; return null; }
      const key = `${base.lat.toFixed(3)},${base.lng.toFixed(3)}`;
      const n = perPlace.get(key) || 0;
      perPlace.set(key, n + 1);
      return { ...spread(base.lat, base.lng, n), approximate: !exact };
    };

    const showPartners = filter === "all" || filter === "parceiros";
    if (showPartners) {
      for (const p of pousadas) {
        const pos = place(p.latitude, p.longitude, p.location);
        if (!pos) continue;
        bounds.push([pos.lat, pos.lng]);
        L.marker([pos.lat, pos.lng], { icon: pin(COLORS.pousada, pos.approximate), title: p.name, keyboard: true })
          .bindPopup(popupContent(p.name, p.location, { label: t("map.viewLodge"), onClick: () => onSelectRef.current(p) }))
          .addTo(layer);
      }
      for (const a of atracoes) {
        const pos = place(a.latitude, a.longitude, a.location);
        if (!pos) continue;
        bounds.push([pos.lat, pos.lng]);
        L.marker([pos.lat, pos.lng], { icon: pin(COLORS.atracao, pos.approximate), title: a.name, keyboard: true })
          .bindPopup(popupContent(a.name, a.location, { label: t("map.viewAttraction"), onClick: () => navigate(`/atracoes/${a.id}`) }))
          .addTo(layer);
      }
    }

    // Áreas de avistamento: um círculo por área, listando as espécies dela.
    const byArea = new Map<string, { area: SightingArea; names: string[] }>();
    if (filter !== "parceiros") {
      for (const s of speciesAreas) {
        if (filter !== "all" && filter !== s.id) continue;
        for (const area of s.areas) {
          const entry = byArea.get(area.name) || { area, names: [] };
          entry.names.push(s.name);
          byArea.set(area.name, entry);
        }
      }
    }
    for (const { area, names } of byArea.values()) {
      bounds.push([area.lat, area.lng]);
      L.circle([area.lat, area.lng], { radius: 14000, color: COLORS.species, weight: 1, fillOpacity: 0.18 })
        .bindPopup(popupContent(area.name, names.join(", ")))
        .addTo(layer);
    }

    // Avistamentos reais do app: círculo maior onde houve mais registros.
    if (filter !== "parceiros") {
      const filtroNome = filter === "all" ? null : speciesAreas.find(s => s.id === filter)?.name || species.find(s => s.id === filter)?.name || null;
      const filtroWild = filtroNome ? findWildSpecies(filter) || findWildSpecies(filtroNome) : undefined;
      for (const p of sightingPoints) {
        if (filtroNome) {
          const pWild = findWildSpecies(p.speciesName);
          const mesma = (filtroWild && pWild && filtroWild.id === pWild.id) || p.speciesName.toLowerCase() === filtroNome.toLowerCase();
          if (!mesma) continue;
        }
        bounds.push([p.lat, p.lng]);
        L.circleMarker([p.lat, p.lng], { radius: Math.min(16, 4 + Math.sqrt(p.count) * 2), color: "#fff", weight: 1.5, fillColor: COLORS.app, fillOpacity: 0.75 })
          .bindPopup(popupContent(p.speciesName, t("species.monthSightings", { n: p.count })))
          .addTo(layer);
      }
    }

    setMissing(showPartners ? semPosicao : 0);
    if (bounds.length > 0) map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 9 });
  }, [pousadas, atracoes, speciesAreas, filter, t, sightingPoints, species]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 text-[11px]">
        <div className="flex flex-wrap items-center gap-4 text-editorial-muted">
          <span className="flex items-center gap-1.5"><span aria-hidden="true" className="w-3 h-3 rounded-full" style={{ background: COLORS.pousada }} /> {t("map.legend.pousada")}</span>
          <span className="flex items-center gap-1.5"><span aria-hidden="true" className="w-3 h-3 rounded-full" style={{ background: COLORS.atracao }} /> {t("map.legend.atracao")}</span>
          <span className="flex items-center gap-1.5"><span aria-hidden="true" className="w-3 h-3 rounded-full opacity-60" style={{ background: COLORS.species }} /> {t("map.legend.species")}</span>
          {sightingPoints.length > 0 && <span className="flex items-center gap-1.5"><span aria-hidden="true" className="w-3 h-3 rounded-full" style={{ background: COLORS.app }} /> {t("map.legend.appSightings")}</span>}
        </div>
        <label className="flex items-center gap-2">
          <span className="uppercase tracking-widest font-bold text-editorial-muted text-[10px]">{t("map.speciesFilter")}</span>
          <select value={filter} onChange={e => setFilter(e.target.value)} className="px-3 py-1.5 text-xs border border-editorial-border bg-white rounded-full cursor-pointer">
            <option value="all">{t("map.allSpecies")}</option>
            <option value="parceiros">{t("map.legend.pousada")} / {t("map.legend.atracao")}</option>
            {speciesAreas.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      {offline && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 mb-2">{t("map.offline")}</p>}
      <div ref={containerRef} className="h-[420px] md:h-[520px] border border-editorial-border relative z-0" role="region" aria-label={t("map.title")} />
      {missing > 0 && <p className="text-[11px] text-editorial-muted mt-2">{t("map.missing", { n: missing })}</p>}
    </div>
  );
}
