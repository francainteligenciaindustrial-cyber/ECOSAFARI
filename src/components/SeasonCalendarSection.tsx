import React from "react";
import { useI18n } from "../i18n/I18nProvider";
import { navigate } from "../lib/router";
import { nextBestMonth, SeasonLevel } from "../data/wildSpecies";
import { bookingUrl } from "./SpeciesSeasonCalendar";
import PictureImg from "./PictureImg";
import { PawPrint } from "lucide-react";

interface SpeciesRow {
  id: string;
  name: string;
  image: string;
  season?: SeasonLevel[];
  bestPousadaId: string;
  monthlyCounts?: number[];
  seasonFromApp?: boolean;
}

const CELL: Record<SeasonLevel, string> = {
  2: "bg-editorial-primary text-white",
  1: "bg-editorial-primary/25 text-editorial-primary",
  0: "bg-editorial-secondary text-editorial-muted",
};

// Tabela "espécie × mês" da home: uma olhada mostra que a seca concentra os
// avistamentos. Clicar num mês reserva a pousada indicada para aquela
// espécie com as datas preenchidas (ver bookingUrl).
export default function SeasonCalendarSection({ species, onOpenSpecies }: { species: SpeciesRow[]; onOpenSpecies: (id: string) => void }) {
  const { t, locale } = useI18n();
  const rows = species.filter((s): s is SpeciesRow & { season: SeasonLevel[] } => !!s.season);
  if (rows.length === 0) return null;

  const monthLabels = Array.from({ length: 12 }, (_, i) =>
    new Date(2026, i, 1).toLocaleDateString(locale, { month: "short" }).replace(".", "")
  );
  const levelName = (l: SeasonLevel) => (l === 2 ? t("species.peak") : l === 1 ? t("species.good") : t("species.low"));
  const now = new Date();
  const onca = rows.find(r => r.id === "onca" || /on[cç]a|jaguar/i.test(r.name));
  const oncaBest = onca ? nextBestMonth(onca.season) : null;
  const appTotal = rows.filter(r => r.seasonFromApp).reduce((acc, r) => acc + (r.monthlyCounts || []).reduce((a, b) => a + b, 0), 0);

  return (
    <section className="bg-editorial-bg py-20 border-t border-editorial-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-10 max-w-3xl mx-auto">
          <span className="text-[10px] uppercase tracking-[0.3em] text-editorial-primary font-bold">{t("species.calendarKicker")}</span>
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-editorial-primary mt-1 tracking-tight">{t("species.calendarTitle")}</h2>
          <p className="text-editorial-muted text-xs mt-2 leading-relaxed">{t("species.calendarSubtitle")}</p>
        </div>

        <div className="overflow-x-auto border border-editorial-border bg-white">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-editorial-muted">
                <th scope="col" className="text-left font-bold px-4 py-3">{t("map.speciesFilter")}</th>
                {monthLabels.map((m, i) => (
                  <th key={i} scope="col" className={`font-bold py-3 w-12 ${i === now.getMonth() ? "text-editorial-primary" : ""}`}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id} className="border-t border-editorial-border">
                  <th scope="row" className="text-left font-normal px-4 py-2">
                    {(() => {
                      const inner = (
                        <>
                          {s.image ? (
                            <PictureImg src={s.image} alt="" className="w-8 h-8 rounded-full object-cover border border-editorial-border" />
                          ) : (
                            <span aria-hidden="true" className="w-8 h-8 rounded-full border border-editorial-border bg-editorial-secondary flex items-center justify-center text-editorial-muted"><PawPrint className="h-4 w-4" /></span>
                          )}
                          <span>
                            <span className="font-serif font-bold text-sm text-editorial-text block">{s.name}</span>
                            <span className={`text-[9px] uppercase tracking-widest font-bold ${s.seasonFromApp ? "text-emerald-700" : "text-editorial-muted"}`}>
                              {s.seasonFromApp ? t("species.appDataSpecies") : t("species.referenceBadge")}
                            </span>
                          </span>
                        </>
                      );
                      // Espécie que só existe no app não tem ficha na vitrine.
                      return s.id.startsWith("app:") ? (
                        <span className="flex items-center gap-2">{inner}</span>
                      ) : (
                        <button type="button" onClick={() => onOpenSpecies(s.id)} className="flex items-center gap-2 cursor-pointer hover:text-editorial-primary transition text-left">{inner}</button>
                      );
                    })()}
                  </th>
                  {s.season.map((level, i) => {
                    // Mês que já passou neste ano: a reserva vai para o ano que vem.
                    const year = i < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
                    const count = s.monthlyCounts?.[i];
                    const label = `${s.name} — ${monthLabels[i]}: ${levelName(level)}${count ? ` · ${t("species.monthSightings", { n: count })}` : ""}`;
                    const action = t("species.bookMonth", { month: monthLabels[i] });
                    return (
                      <td key={i} className="p-1">
                        {s.bestPousadaId && level > 0 ? (
                          <button
                            type="button"
                            onClick={() => navigate(bookingUrl(s.bestPousadaId, year, i + 1))}
                            aria-label={`${label}. ${action}`}
                            title={`${label} · ${action}`}
                            className={`flex items-center justify-center w-full h-7 rounded-sm cursor-pointer hover:ring-2 hover:ring-arara-blue transition text-[10px] font-bold ${CELL[level]}`}
                          >
                            {count ? count : ""}
                          </button>
                        ) : (
                          <span role="img" aria-label={label} title={label} className={`flex items-center justify-center w-full h-7 rounded-sm text-[10px] font-bold ${CELL[level]}`}>
                            {count ? count : ""}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-[11px] text-editorial-muted">
          <div className="flex items-center gap-4">
            {([2, 1, 0] as SeasonLevel[]).map(l => (
              <span key={l} className="flex items-center gap-1.5">
                <span aria-hidden="true" className={`inline-block w-3 h-3 rounded-sm border border-editorial-border ${CELL[l]}`} /> {levelName(l)}
              </span>
            ))}
          </div>
          <p>{t("species.pickMonth")}</p>
        </div>
        {appTotal > 0 && <p className="text-[11px] text-emerald-700 mt-2">{t("species.appData", { n: appTotal })}</p>}

        {/* Atalho: próximo mês de pico da onça, a espécie mais procurada. */}
        {onca && oncaBest && onca.bestPousadaId && (
          <div className="text-center mt-8">
            <button
              type="button"
              onClick={() => navigate(bookingUrl(onca.bestPousadaId, oncaBest.year, oncaBest.month))}
              className="bg-editorial-primary hover:opacity-90 text-white text-[11px] uppercase tracking-widest font-bold px-6 py-3 cursor-pointer transition"
            >
              {onca.name}: {t("species.bookMonth", { month: new Date(oncaBest.year, oncaBest.month - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" }) })}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
