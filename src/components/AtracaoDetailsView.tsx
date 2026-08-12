import React, { useState, useEffect } from "react";
import { Compass, MapPin, Star, BadgeCheck, MessageSquare, LoaderCircle, ArrowLeft, Clock } from "lucide-react";
import { Atracao } from "../types";
import { navigate } from "../lib/router";
import ReviewsSection from "./ReviewsSection";
import TopReviewQuote from "./TopReviewQuote";

const AGENCY_WHATSAPP_NUMBER = "5565999868334";
const TYPE_LABELS: Record<Atracao["type"], string> = { parada_legal: "Parada Legal", restaurante: "Restaurante" };

// Public profile page for an Atração (Parada Legal / Restaurante) — the
// counterpart to /pousadas/:id and /site/:slug for the other partner type,
// so every kind of parceiro cadastrado no sistema has an actual page a
// visitor can land on, not just an admin-only record.
export default function AtracaoDetailsView({ id }: { id: string }) {
  const [atracao, setAtracao] = useState<Atracao | null | undefined>(undefined);

  useEffect(() => {
    fetch(`/api/atracoes/${id}`)
      .then(res => res.ok ? res.json() : null)
      .then(setAtracao)
      .catch(() => setAtracao(null));
  }, [id]);

  if (atracao === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-editorial-bg">
        <LoaderCircle className="h-8 w-8 text-editorial-primary animate-spin" />
      </div>
    );
  }

  if (atracao === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-editorial-bg text-center px-6">
        <h1 className="text-2xl font-serif font-bold text-editorial-primary">Atração não encontrada</h1>
        <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="inline-flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-editorial-primary hover:opacity-80 transition cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Voltar ao catálogo EcoSafari
        </a>
      </div>
    );
  }

  const whatsappMessage = `Olá! Encontrei ${atracao.name} na EcoSafari e gostaria de mais informações.`;
  const whatsappLink = `https://wa.me/${AGENCY_WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage)}`;

  return (
    <div className="bg-editorial-bg font-sans text-editorial-text min-h-screen">
      <header className="h-16 flex items-center justify-between px-6 md:px-10 border-b border-editorial-border bg-white/70 backdrop-blur-sm sticky top-0 z-20">
        <a href="/" onClick={e => { e.preventDefault(); navigate("/"); }} className="flex items-center gap-2 cursor-pointer">
          <div className="bg-editorial-primary p-1.5 rounded-lg text-white flex items-center justify-center"><Compass className="h-4 w-4" /></div>
          <span className="font-serif italic font-bold text-editorial-primary">EcoSafari<span className="text-zinc-400 not-italic">.</span></span>
        </a>
        <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="hidden sm:flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] uppercase tracking-widest font-bold px-4 py-2 rounded-md transition">
          <MessageSquare className="h-3.5 w-3.5" /> Fale Conosco
        </a>
      </header>

      <section className="relative h-[360px] md:h-[420px] flex items-end bg-zinc-200">
        {atracao.images[0] && (
          <img src={atracao.images[0]} alt={atracao.name} referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="relative z-10 max-w-4xl mx-auto px-6 md:px-10 pb-8 w-full">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-white/95 text-editorial-primary text-[9px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full">{TYPE_LABELS[atracao.type]}</span>
            {atracao.verified && (
              <span className="flex items-center gap-1 bg-emerald-500/90 text-white text-[9px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full"><BadgeCheck className="h-3 w-3" /> Verificada</span>
            )}
          </div>
          <h1 className="text-3xl md:text-5xl font-serif font-bold text-white tracking-tight">{atracao.name}</h1>
          <div className="flex items-center gap-4 mt-2 text-white/90 text-xs flex-wrap">
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {atracao.location}</span>
            {atracao.rating > 0 ? (
              <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {atracao.rating} / 5.0</span>
            ) : (
              <span className="flex items-center gap-1 text-white/70"><Star className="h-3.5 w-3.5" /> Novo, sem avaliações ainda</span>
            )}
            {atracao.availability && (
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {atracao.availability}</span>
            )}
          </div>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-6 md:px-10 py-12 space-y-12">
        <div>
          <h2 className="text-xl font-serif font-bold text-editorial-primary mb-3">Sobre</h2>
          <p className="text-editorial-muted leading-relaxed whitespace-pre-line text-sm font-light mb-4">{atracao.description}</p>
          <TopReviewQuote targetType="atracao" targetId={atracao.id} />
        </div>

        {atracao.images.length > 1 && (
          <div>
            <h2 className="text-xl font-serif font-bold text-editorial-primary mb-4">Galeria</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {atracao.images.slice(1, 7).map((img, idx) => (
                <div key={idx} className="aspect-square overflow-hidden border border-editorial-border">
                  <img src={img} alt={`${atracao.name} ${idx + 2}`} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {atracao.type === "restaurante" && atracao.menu && atracao.menu.length > 0 && (
          <div>
            <h2 className="text-xl font-serif font-bold text-editorial-primary mb-4">Cardápio</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {atracao.menu.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between border border-editorial-border bg-white px-4 py-3">
                  <span className="text-sm text-editorial-text">{item.item}</span>
                  <span className="text-sm font-bold text-editorial-primary">R$ {item.price.toLocaleString('pt-BR')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-xl font-serif font-bold text-editorial-primary mb-4">Avaliações</h2>
          <ReviewsSection targetType="atracao" targetId={atracao.id} />
        </div>
      </div>

      <section className="bg-editorial-primary text-white py-14 text-center px-6">
        <h2 className="text-2xl font-serif font-bold mb-3">Interessado?</h2>
        <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-white text-editorial-primary hover:bg-white/90 font-bold px-8 py-3.5 text-xs uppercase tracking-widest transition">
          <MessageSquare className="h-4 w-4" /> Fale Conosco no WhatsApp
        </a>
      </section>

      <footer className="py-8 text-center text-editorial-muted text-[10px] uppercase tracking-widest font-bold">
        <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="hover:text-editorial-primary transition cursor-pointer">Listado no catálogo EcoSafari Brasil →</a>
      </footer>
    </div>
  );
}
