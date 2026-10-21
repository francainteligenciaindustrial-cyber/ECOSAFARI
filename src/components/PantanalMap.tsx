import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useI18n } from "../i18n/I18nProvider";
import { navigate } from "../lib/router";
import { approximatePosition, spread } from "../data/places";
import { findWildSpecies, WILD_SPECIES, SightingArea } from "../data/wildSpecies";
import type { Atracao, Pousada } from "../types";
import type { SightingPoint } from "../lib/sightingStats";
import { countFor, NEARBY_RADIUS_KM, speciesNearPousadas, type LinkedSpecies, type NearbySpecies } from "../lib/nearbySightings";

interface SpeciesLike { id: string; name: string }

interface Props {
  pousadas: Pousada[];
  atracoes: Atracao[];
  species: SpeciesLike[];
  onSelectPousada: (p: Pousada) => void;
  // Avistamentos aprovados no app EcoSafari Go, agregados (~1 km).
  sightingPoints?: SightingPoint[];
  // Avistamentos vinculados a cada pousada pelo ID (appLodgeId).
  linkedSpecies?: LinkedSpecies[];
}

const COLORS = { pousada: "#101B4C", atracao: "#F28C00", species: "#3F8A2E", app: "#1580B5" };

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// Mesma espécie? Pelos apelidos conhecidos (src/data/wildSpecies.ts) ou pelo nome.
const sameSpecies = (a: string, b: string) => {
  const wa = findWildSpecies(a);
  const wb = findWildSpecies(b);
  return (wa && wb && wa.id === wb.id) || normalize(a) === normalize(b);
};

// Pino translúcido = posição aproximada (só a cidade é conhecida). Com número
// = quantos avistamentos da espécie filtrada houve perto da pousada.
function pin(color: string, approximate: boolean, badge?: number): L.DivIcon {
  const ring = approximate ? "opacity:.6;" : "";
  if (badge) {
    const size = Math.min(40, 24 + Math.sqrt(badge) * 3);
    return L.divIcon({
      className: "",
      html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${color};color:#fff;font:700 11px/1 Inter,sans-serif;border:3px solid #F6B21B;${ring}box-shadow:0 1px 5px rgba(0,0,0,.5)">${badge}</span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2],
    });
  }
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:20px;height:20px;border-radius:50%;background:${color};border:3px solid #fff;${ring}box-shadow:0 1px 4px rgba(0,0,0,.45)"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
}

// Popup montado com DOM (textContent), nunca com HTML: nome e local vêm do
// cadastro dos parceiros e os nomes das espécies, do app.
function popupContent(title: string, subtitle: string, opts: { action?: { label: string; onClick: () => void }; listTitle?: string; list?: NearbySpecies[]; emptyText?: string; countLabel?: (n: number) => string } = {}): HTMLElement {
  const box = document.createElement("div");
  box.style.minWidth = "180px";
  const h = document.createElement("strong");
  h.textContent = title;
  h.style.cssText = "display:block;font-family:'Playfair Display',Georgia,serif;color:#101B4C;font-size:14px";
  const p = document.createElement("span");
  p.textContent = subtitle;
  p.style.cssText = "display:block;font-size:11px;color:#5E6670;margin-top:2px";
  box.append(h, p);
  if (opts.listTitle) {
    const lt = document.createElement("span");
    lt.textContent = opts.listTitle;
    lt.style.cssText = "display:block;margin-top:8px;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#3F8A2E";
    box.append(lt);
    if (opts.list && opts.list.length > 0) {
      const ul = document.createElement("ul");
      ul.style.cssText = "margin:4px 0 0;padding:0;list-style:none;font-size:12px;color:#1F2937";
      for (const s of opts.list.slice(0, 6)) {
        const li = document.createElement("li");
        li.style.cssText = "display:flex;justify-content:space-between;gap:12px;padding:1px 0";
        const n = document.createElement("span");
        n.textContent = s.name;
        const c = document.createElement("span");
        c.textContent = opts.countLabel ? opts.countLabel(s.count) : String(s.count);
        c.style.cssText = "color:#5E6670;white-space:nowrap";
        li.append(n, c);
        ul.append(li);
      }
      box.append(ul);
    } else if (opts.emptyText) {
      const e = document.createElement("span");
      e.textContent = opts.emptyText;
      e.style.cssText = "display:block;font-size:11px;color:#5E6670;margin-top:2px";
      box.append(e);
    }
  }
  if (opts.action) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = opts.action.label;
    b.style.cssText = "margin-top:8px;background:#101B4C;color:#fff;border:0;padding:6px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;cursor:pointer";
    b.addEventListener("click", opts.action.onClick);
    box.append(b);
  }
  return box;
}

// O catálogo é recarregado a cada minuto (App.tsx) com arrays novos de mesmo
// conteúdo — a chave por conteúdo evita redesenhar e reenquadrar o mapa
// (perdendo o zoom do usuário) quando nada mudou de fato.
const contentKey = (items: { id: string; latitude?: number; longitude?: number; location?: string }[]) =>
  items.map(i => `${i.id}:${i.latitude ?? ""}:${i.longitude ?? ""}:${i.location ?? ""}`).join("|");

type Placed = { lat: number; lng: number; approximate: boolean };

export default function PantanalMap({ pousadas: pousadasProp, atracoes: atracoesProp, species, onSelectPousada, sightingPoints = [], linkedSpecies = [] }: Props) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pousadas = useMemo(() => pousadasProp, [contentKey(pousadasProp)]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const atracoes = useMemo(() => atracoesProp, [contentKey(atracoesProp)]);
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [filter, setFilter] = useState("all");
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

  // Opções do filtro: espécies do site + espécies vistas no app (sem repetir).
  const filterOptions = useMemo(() => {
    const opts = speciesAreas.map(s => ({ id: s.id, name: s.name }));
    const seen = (name: string) => opts.some(o => sameSpecies(o.name, name));
    for (const name of [...sightingPoints.map(p => p.speciesName), ...linkedSpecies.map(s => s.name)]) {
      if (!seen(name)) opts.push({ id: `app:${normalize(name)}`, name });
    }
    return opts.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [speciesAreas, sightingPoints, linkedSpecies]);
  const filterName = filter === "all" || filter === "parceiros" ? null : filterOptions.find(o => o.id === filter)?.name || null;

  // Posição de cada parceiro (exata ou aproximada pela cidade), espalhando
  // quem cai no mesmo lugar.
  const placed = useMemo(() => {
    const perPlace = new Map<string, number>();
    let missing = 0;
    const place = (lat: number | undefined, lng: number | undefined, location: string | undefined): Placed | null => {
      const exact = typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng);
      const base = exact ? { lat: lat as number, lng: lng as number } : approximatePosition(location);
      if (!base) { missing++; return null; }
      const key = `${base.lat.toFixed(3)},${base.lng.toFixed(3)}`;
      const n = perPlace.get(key) || 0;
      perPlace.set(key, n + 1);
      return { ...spread(base.lat, base.lng, n), approximate: !exact };
    };
    const ps = pousadas.map(p => ({ p, pos: place(p.latitude, p.longitude, p.location) })).filter((x): x is { p: Pousada; pos: Placed } => !!x.pos);
    const as = atracoes.map(a => ({ a, pos: place(a.latitude, a.longitude, a.location) })).filter((x): x is { a: Atracao; pos: Placed } => !!x.pos);
    return { pousadas: ps, atracoes: as, missing };
  }, [pousadas, atracoes]);

  // Animais avistados perto de cada pousada (raio + vínculo pelo ID).
  const nearby = useMemo(
    () => speciesNearPousadas(placed.pousadas.map(({ p, pos }) => ({ id: p.id, lat: pos.lat, lng: pos.lng, exact: !pos.approximate })), sightingPoints, linkedSpecies),
    [placed, sightingPoints, linkedSpecies]
  );

  // Ranking "onde ver" da espécie filtrada.
  const ranking = useMemo(() => {
    if (!filterName) return [];
    return placed.pousadas
      .map(({ p }) => ({ p, count: countFor(nearby[p.id], filterName, sameSpecies) }))
      .filter(r => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [filterName, placed, nearby]);

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
    // O enquadramento segue as pousadas/atrações (e as áreas da espécie
    // filtrada). Pontos do app sozinhos não puxam o zoom — um registro de
    // teste longe do Pantanal não pode afastar o mapa inteiro.
    const bounds: L.LatLngTuple[] = [];
    const countLabel = (n: number) => t("species.monthSightings", { n });

    const showPartners = filter !== "species-only";
    if (showPartners) {
      for (const { p, pos } of placed.pousadas) {
        const list = nearby[p.id] || [];
        const badge = filterName ? countFor(list, filterName, sameSpecies) : 0;
        if (filterName && !badge) continue; // filtrando espécie: só onde ela foi vista
        bounds.push([pos.lat, pos.lng]);
        L.marker([pos.lat, pos.lng], { icon: pin(COLORS.pousada, pos.approximate, badge || undefined), title: p.name, keyboard: true, zIndexOffset: badge ? 1000 + badge : 0 })
          .bindPopup(popupContent(p.name, p.location, {
            listTitle: t("map.nearbyTitle"),
            list: list,
            emptyText: t("map.noNearby"),
            countLabel,
            action: { label: t("map.viewLodge"), onClick: () => onSelectRef.current(p) },
          }))
          .addTo(layer);
      }
      if (!filterName) {
        for (const { a, pos } of placed.atracoes) {
          bounds.push([pos.lat, pos.lng]);
          L.marker([pos.lat, pos.lng], { icon: pin(COLORS.atracao, pos.approximate), title: a.name, keyboard: true })
            .bindPopup(popupContent(a.name, a.location, { action: { label: t("map.viewAttraction"), onClick: () => navigate(`/atracoes/${a.id}`) } }))
            .addTo(layer);
        }
      }
    }

    // Áreas de referência onde a espécie costuma ser vista.
    if (filter !== "parceiros") {
      const byArea = new Map<string, { area: SightingArea; names: string[] }>();
      for (const s of speciesAreas) {
        if (filterName && !sameSpecies(s.name, filterName)) continue;
        for (const area of s.areas) {
          const entry = byArea.get(area.name) || { area, names: [] };
          entry.names.push(s.name);
          byArea.set(area.name, entry);
        }
      }
      for (const { area, names } of byArea.values()) {
        if (filterName) bounds.push([area.lat, area.lng]);
        L.circle([area.lat, area.lng], { radius: 14000, color: COLORS.species, weight: 1, fillOpacity: 0.15 })
          .bindPopup(popupContent(area.name, names.join(", ")))
          .addTo(layer);
      }

      // Avistamentos reais do app: círculo maior onde houve mais registros.
      for (const pnt of sightingPoints) {
        if (filterName && !sameSpecies(pnt.speciesName, filterName)) continue;
        L.circleMarker([pnt.lat, pnt.lng], { radius: Math.min(16, 5 + Math.sqrt(pnt.count) * 2), color: "#fff", weight: 1.5, fillColor: COLORS.app, fillOpacity: 0.8 })
          .bindPopup(popupContent(pnt.speciesName, countLabel(pnt.count)))
          .addTo(layer);
      }
    }

    if (bounds.length > 0) map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 9 });
    else map.setView([-16.9, -56.6], 6);
  }, [placed, nearby, speciesAreas, filter, filterName, t, sightingPoints]);

  const withSightings = placed.pousadas.filter(({ p }) => (nearby[p.id] || []).length > 0);

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
          <select value={filter} onChange={e => setFilter(e.target.value)} className="px-3 py-1.5 text-xs border border-editorial-border bg-white rounded-full cursor-pointer max-w-[220px]">
            <option value="all">{t("map.allSpecies")}</option>
            <option value="parceiros">{t("map.legend.pousada")} / {t("map.legend.atracao")}</option>
            {filterOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      {offline && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 mb-2">{t("map.offline")}</p>}
      <div ref={containerRef} className="h-[420px] md:h-[520px] border border-editorial-border relative z-0" role="region" aria-label={t("map.title")} />

      {/* "Tal animal é mais visto perto de tal pousada" */}
      {filterName ? (
        <div className="mt-4 border border-editorial-border bg-editorial-bg/60 p-4">
          <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-editorial-primary mb-2">{t("map.whereToSee", { name: filterName })}</h3>
          {ranking.length > 0 ? (
            <ol className="space-y-1.5 text-sm">
              {ranking.map(({ p, count }, i) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <button type="button" onClick={() => onSelectRef.current(p)} className="text-left hover:text-editorial-primary hover:underline cursor-pointer">
                    <span className="font-bold text-editorial-accent mr-2">{i + 1}º</span>{p.name}
                    <span className="text-editorial-muted text-xs"> · {p.location}</span>
                  </button>
                  <span className="text-xs text-editorial-muted whitespace-nowrap">{t("species.monthSightings", { n: count })}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-editorial-muted">{t("map.noRanking")}</p>
          )}
        </div>
      ) : withSightings.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-editorial-primary mb-2">{t("map.bestNear")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {withSightings.map(({ p }) => (
              <button key={p.id} type="button" onClick={() => onSelectRef.current(p)} className="text-left border border-editorial-border bg-white p-3 hover:border-editorial-primary transition cursor-pointer">
                <span className="block font-serif font-bold text-editorial-primary">{p.name}</span>
                <span className="flex flex-wrap gap-1.5 mt-2">
                  {(nearby[p.id] || []).slice(0, 4).map(s => (
                    <span key={s.name} className="text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-full px-2 py-0.5">{s.name} · {s.count}</span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-[11px] text-editorial-muted mt-2">
        {t("map.nearbyNote", { km: NEARBY_RADIUS_KM })}
        {placed.missing > 0 && !filterName ? ` ${t("map.missing", { n: placed.missing })}` : ""}
      </p>
    </div>
  );
}
