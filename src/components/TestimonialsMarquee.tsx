import React, { useMemo } from "react";
import { Star } from "lucide-react";
import type { Review } from "../types";

export interface Depoimento { review: Review; alvo?: string | null }
export const MIN_DEPOIMENTOS = 3;

// Faixa de depoimentos que corre devagar para a esquerda (estilo Resend).
// Só avaliações reais (nota 4+ e com texto). A lista é repetida para o
// loop não ter emenda; para no hover; sem animação para quem prefere menos
// movimento (vira rolagem horizontal).
export default function TestimonialsMarquee({ itens, kicker, title }: { itens: Depoimento[]; kicker: string; title: string }) {
  const bons = useMemo(
    () => itens.filter(d => (d.review.rating || 0) >= 4 && String(d.review.comment || "").trim().length >= 20),
    [itens]
  );
  // Com poucos depoimentos o mesmo card se repete e parece falso: a faixa
  // só aparece a partir de 3 avaliações diferentes.
  if (bons.length < MIN_DEPOIMENTOS) return null;

  // Pelo menos ~8 cards por volta, para preencher telas largas.
  const volta: Depoimento[] = [];
  while (volta.length < Math.max(8, bons.length)) volta.push(...bons);
  const duracao = Math.max(40, volta.length * 9); // segundos por volta: lento

  return (
    <section aria-label={title} className="bg-[#070B0A] text-white py-16 md:py-20 overflow-hidden">
      <div className="text-center px-6 mb-10">
        <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-[#2EE59D]">{kicker}</span>
        <h2 className="text-3xl md:text-4xl font-serif font-bold mt-2 tracking-tight">{title}</h2>
      </div>
      <div className="marquee-mask group relative">
        <ul className="marquee-track flex w-max group-hover:[animation-play-state:paused]" style={{ animationDuration: `${duracao}s` }}>
          {[...volta, ...volta].map((d, i) => {
            const r = d.review;
            const foto = r.images?.[0] || r.photoUrl;
            return (
              <li key={`${r.id}-${i}`} aria-hidden={i >= volta.length || undefined} className="w-[300px] sm:w-[380px] mr-5 flex-shrink-0 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.01] p-6 flex flex-col justify-between">
                <div>
                  <div className="flex gap-0.5 mb-3" aria-label={`Nota ${r.rating} de 5`}>
                    {Array.from({ length: 5 }).map((_, k) => <Star key={k} className={`h-3.5 w-3.5 ${k < r.rating ? "fill-[#2EE59D] text-[#2EE59D]" : "text-white/20"}`} />)}
                  </div>
                  <p className="text-[14px] leading-relaxed text-white/80 line-clamp-5">“{r.comment}”</p>
                </div>
                <div className="flex items-center gap-3 mt-5">
                  {foto ? (
                    <img src={foto} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-10 h-10 rounded-full object-cover border border-white/15" />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center font-bold text-sm">{(r.userName || "?").charAt(0).toUpperCase()}</span>
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white truncate">{r.userName}</span>
                    {d.alvo && <span className="block text-xs text-white/50 truncate">{d.alvo}</span>}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
