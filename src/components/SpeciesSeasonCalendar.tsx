import React, { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";
import { navigate } from "../lib/router";
import type { SeasonLevel } from "../data/wildSpecies";

// Ocupação mensal (0–1) da pousada nos próximos 12 meses — vem de
// GET /api/pousadas/:id/ocupacao. Cache por pousada: a mesma pousada aparece
// em várias espécies e não precisa ser buscada de novo a cada modal aberto.
type Ocupacao = { month: string; occupancy: number }[];
const ocupacaoCache = new Map<string, Promise<Ocupacao>>();

export function fetchOcupacao(pousadaId: string): Promise<Ocupacao> {
  if (!ocupacaoCache.has(pousadaId)) {
    ocupacaoCache.set(
      pousadaId,
      fetch(`/api/pousadas/${encodeURIComponent(pousadaId)}/ocupacao`)
        .then(res => (res.ok ? res.json() : []))
        .catch(() => [])
    );
  }
  return ocupacaoCache.get(pousadaId)!;
}

const pad = (n: number) => String(n).padStart(2, "0");

// Datas sugeridas ao clicar num mês: 3 noites a partir do dia 1 (ou de daqui
// a uma semana, se for o mês atual). O servidor ainda confere a
// disponibilidade de verdade e sugere outras datas se estiver cheio.
export function suggestedStay(year: number, month: number, nights = 3): { checkIn: string; checkOut: string } {
  const now = new Date();
  let start = new Date(year, month - 1, 1, 12);
  const minStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 12);
  if (start < minStart) start = minStart;
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + nights, 12);
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { checkIn: iso(start), checkOut: iso(end) };
}

export function bookingUrl(pousadaId: string, year: number, month: number): string {
  const { checkIn, checkOut } = suggestedStay(year, month);
  return `/reservar/${encodeURIComponent(pousadaId)}?checkin=${checkIn}&checkout=${checkOut}`;
}

const LEVEL_STYLES: Record<"dark" | "light", Record<SeasonLevel, string>> = {
  dark: { 2: "bg-amber-500 text-[#0A1133]", 1: "bg-amber-500/30 text-amber-100", 0: "bg-white/5 text-zinc-500" },
  light: { 2: "bg-editorial-primary text-white", 1: "bg-editorial-primary/20 text-editorial-primary", 0: "bg-editorial-secondary text-editorial-muted" },
};

interface Props {
  season: SeasonLevel[];
  pousadaId?: string;
  variant?: "dark" | "light";
  // Avistamentos aprovados no app por mês (Jan..Dez) e se a época veio deles.
  monthlyCounts?: number[];
  fromApp?: boolean;
}

// Próximos 12 meses (a partir do atual), cada um colorido pela chance de
// avistar a espécie e com uma barrinha de ocupação da pousada indicada.
// Clicar num mês abre a reserva com as datas já preenchidas.
export default function SpeciesSeasonCalendar({ season, pousadaId, variant = "light", monthlyCounts, fromApp }: Props) {
  const { t, locale } = useI18n();
  const [ocupacao, setOcupacao] = useState<Ocupacao>([]);

  useEffect(() => {
    if (!pousadaId) return;
    let cancelled = false;
    fetchOcupacao(pousadaId).then(o => { if (!cancelled) setOcupacao(o); });
    return () => { cancelled = true; };
  }, [pousadaId]);

  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      key,
      label: d.toLocaleDateString(locale, { month: "short" }).replace(".", ""),
      longLabel: d.toLocaleDateString(locale, { month: "long", year: "numeric" }),
      level: season[d.getMonth()] ?? 0,
      occupancy: ocupacao.find(o => o.month === key)?.occupancy ?? null,
    };
  });

  const dark = variant === "dark";
  const levelName = (l: SeasonLevel) => (l === 2 ? t("species.peak") : l === 1 ? t("species.good") : t("species.low"));

  return (
    <div>
      <h4 className={`text-xs uppercase font-bold tracking-widest mb-2 flex items-center gap-1.5 ${dark ? "text-zinc-400" : "text-editorial-muted"}`}>
        <CalendarDays className="h-3.5 w-3.5" /> {t("species.seasonTitle")}
      </h4>
      <ol className="grid grid-cols-6 gap-1.5">
        {months.map(m => {
          const busy = m.occupancy !== null && m.occupancy >= 0.85;
          const count = monthlyCounts?.[m.month - 1];
          const label = `${m.longLabel}: ${levelName(m.level as SeasonLevel)}${count ? ` · ${t("species.monthSightings", { n: count })}` : ""}${busy ? ` · ${t("species.busy")}` : ""}`;
          const content = (
            <>
              <span className="block text-[10px] font-bold uppercase leading-none">{m.label}</span>
              {m.occupancy !== null && (
                <span aria-hidden="true" className={`block h-1 mt-1.5 rounded-full overflow-hidden ${dark ? "bg-black/30" : "bg-white/60"}`}>
                  <span className={`block h-full ${busy ? "bg-red-500" : dark ? "bg-emerald-400" : "bg-emerald-600"}`} style={{ width: `${Math.round(m.occupancy * 100)}%` }} />
                </span>
              )}
            </>
          );
          const cls = `w-full px-1 py-2 text-center rounded-sm ${LEVEL_STYLES[variant][m.level as SeasonLevel]}`;
          return (
            <li key={m.key}>
              {pousadaId ? (
                <button
                  type="button"
                  title={`${label} — ${t("species.bookMonth", { month: m.longLabel })}`}
                  aria-label={`${label}. ${t("species.bookMonth", { month: m.longLabel })}`}
                  onClick={() => navigate(bookingUrl(pousadaId, m.year, m.month))}
                  className={`${cls} cursor-pointer hover:ring-2 ${dark ? "hover:ring-white/60" : "hover:ring-editorial-primary"} transition`}
                >
                  {content}
                </button>
              ) : (
                <div className={cls} title={label} aria-label={label}>{content}</div>
              )}
            </li>
          );
        })}
      </ol>
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] ${dark ? "text-zinc-400" : "text-editorial-muted"}`}>
        {([2, 1, 0] as SeasonLevel[]).map(l => (
          <span key={l} className="flex items-center gap-1">
            <span aria-hidden="true" className={`inline-block w-2.5 h-2.5 rounded-sm ${LEVEL_STYLES[variant][l].split(" ")[0]}`} /> {levelName(l)}
          </span>
        ))}
        {pousadaId && ocupacao.length > 0 && <span>· {t("species.occupancyLegend")}</span>}
      </div>
      {monthlyCounts && (
        <p className={`text-[10px] mt-1 ${dark ? "text-emerald-400" : "text-emerald-700"}`}>
          {fromApp ? t("species.appData", { n: monthlyCounts.reduce((a, b) => a + b, 0) }) : t("species.referenceData")}
        </p>
      )}
      {pousadaId && <p className={`text-[10px] mt-1 ${dark ? "text-zinc-500" : "text-editorial-muted"}`}>{t("species.pickMonth")}</p>}
    </div>
  );
}
