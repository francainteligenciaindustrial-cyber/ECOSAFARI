import React, { useEffect, useState } from "react";
import { Package, Check, Moon } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";
import { navigate } from "../lib/router";
import PictureImg from "./PictureImg";
import type { PacotePublico } from "../types";

// Pacotes combinados (pousada + guia + atração) montados pelo admin em
// Gestão → Pacotes. Pagos num único checkout do Stripe, com um item por
// componente — ver POST /api/turista/bookings com pacoteId.
export default function PacotesSection() {
  const { t, formatMoney } = useI18n();
  const [pacotes, setPacotes] = useState<PacotePublico[]>([]);

  useEffect(() => {
    fetch("/api/pacotes")
      .then(res => (res.ok ? res.json() : []))
      .then(data => setPacotes(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  if (pacotes.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-6 py-16 border-t border-editorial-border">
      <div className="text-center mb-10">
        <span className="text-editorial-primary text-[11px] uppercase tracking-[0.2em] font-bold">{t("pkg.kicker")}</span>
        <h2 className="text-3xl md:text-4xl font-serif font-bold text-editorial-text mt-2">{t("pkg.title")}</h2>
        <p className="text-editorial-muted text-sm mt-2 max-w-xl mx-auto">{t("pkg.subtitle")}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pacotes.map(p => {
          const href = `/reservar/${encodeURIComponent(p.pousadaId)}?pacote=${encodeURIComponent(p.id)}`;
          return (
            <article key={p.id} className="bg-white border border-editorial-border flex flex-col">
              <div className="h-44 bg-editorial-secondary overflow-hidden relative">
                {p.imageUrl ? (
                  <PictureImg src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-editorial-muted"><Package className="h-8 w-8" /></div>
                )}
                <span className="absolute top-3 left-3 bg-white/95 text-editorial-primary text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Moon className="h-3 w-3" /> {t("pkg.nights", { n: p.nights })}
                </span>
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="font-serif font-bold text-lg text-editorial-primary">{p.name}</h3>
                {p.description && <p className="text-editorial-muted text-xs mt-1 leading-relaxed line-clamp-3">{p.description}</p>}
                <p className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted mt-4 mb-1.5">{t("pkg.includes")}</p>
                <ul className="space-y-1 text-xs text-editorial-text mb-5">
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 flex-shrink-0" /> {t("pkg.lodging", { name: p.pousadaName })}</li>
                  {p.guideName && <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 flex-shrink-0" /> {t("pkg.guide", { name: p.guideName })}</li>}
                  {p.atracaoNames.map(name => (
                    <li key={name} className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 flex-shrink-0" /> {t("pkg.attraction", { name })}</li>
                  ))}
                </ul>
                <div className="mt-auto flex items-center justify-between gap-3 border-t border-editorial-border pt-4">
                  <span className="font-serif font-bold text-editorial-primary">{t("pkg.fromPerPerson", { price: formatMoney(p.pricePerPerson) })}</span>
                  <a
                    href={href}
                    onClick={e => { e.preventDefault(); navigate(href); }}
                    className="bg-editorial-primary hover:opacity-90 text-white text-[10px] uppercase tracking-widest font-bold px-4 py-2.5 transition"
                  >
                    {t("pkg.book")}
                  </a>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
