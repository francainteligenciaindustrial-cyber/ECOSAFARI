import React from "react";

interface Highlight {
  image: string;
  title: string;
  description: string;
}

// Hand-curated "featured experience" rows (photo + title + short pitch) for
// specific pousadas — keyed by pousada id since this exact content (photos
// and copy) was requested for Pesqueiro Vagalume specifically, not built as
// a generic admin-editable field. Shared between PousadaDetailsView (visão
// detalhada) and PousadaOfficialSite (/site/:slug) so both stay in sync
// automatically instead of duplicating the same markup twice.
const HIGHLIGHTS_BY_POUSADA_ID: Record<string, Highlight[]> = {
  p_1784944422389: [
    {
      image: "/pousadas/vagalume-bodyboard.png",
      title: "Bodyboard",
      description: "Aqui no Pesqueiro Vagalume você tem a oportunidade de dar um passeio de bodyboard puxado pelo barco — diversão garantida pra toda a família nas águas do rio."
    },
    {
      image: "/pousadas/vagalume-pesca-dourado-dia.png",
      title: "Pesca Esportiva",
      description: "Aqui no Pesqueiro Vagalume você vive a emoção da pesca esportiva, com boas chances de fisgar um dourado — nosso lago próprio e o rio ao lado garantem pescaria tranquila o ano todo."
    }
  ]
};

// Lets callers skip rendering their wrapping <section> (padding, borders,
// etc.) entirely for a pousada with no curated highlights, instead of this
// component returning null inside a now-empty section shell.
export function hasPousadaHighlights(pousadaId: string): boolean {
  return (HIGHLIGHTS_BY_POUSADA_ID[pousadaId]?.length ?? 0) > 0;
}

export default function PousadaHighlights({ pousadaId }: { pousadaId: string }) {
  const highlights = HIGHLIGHTS_BY_POUSADA_ID[pousadaId];
  if (!highlights || highlights.length === 0) return null;

  return (
    <div className="space-y-10">
      {highlights.map((h, idx) => {
        const imageFirst = idx % 2 === 0;
        return (
          <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className={`aspect-[4/3] overflow-hidden border border-editorial-border ${imageFirst ? "md:order-1" : "md:order-2"}`}>
              <img
                src={h.image}
                alt={h.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className={imageFirst ? "md:order-2" : "md:order-1"}>
              <h3 className="text-2xl font-serif font-bold text-editorial-primary mb-3">{h.title}</h3>
              <p className="text-editorial-text text-base font-light leading-relaxed">{h.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
