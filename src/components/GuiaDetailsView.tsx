import React, { useState, useEffect } from "react";
import { Compass, Star, MessageSquare, LoaderCircle, ArrowLeft, Languages, Sparkles, MapPin, User, CalendarOff } from "lucide-react";
import { Guide } from "../types";
import { navigate } from "../lib/router";
import ReviewsSection from "./ReviewsSection";
import TopReviewQuote from "./TopReviewQuote";
import LanguageFlag from "./LanguageFlag";
import { LEVEL_LABELS } from "./LanguagesEditor";

const AGENCY_WHATSAPP_NUMBER = "5565999868334";

// Public profile page for a Guia — the point of this page is exactly what
// the team asked for: a guide should have a real profile, like a social
// network or delivery-app provider page, not just a row in an admin table.
export default function GuiaDetailsView({ id }: { id: string }) {
  const [guia, setGuia] = useState<Omit<Guide, "email" | "phone"> | null | undefined>(undefined);

  useEffect(() => {
    fetch(`/api/guides/public/${id}`)
      .then(res => res.ok ? res.json() : null)
      .then(setGuia)
      .catch(() => setGuia(null));
  }, [id]);

  if (guia === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-editorial-bg">
        <LoaderCircle className="h-8 w-8 text-editorial-primary animate-spin" />
      </div>
    );
  }

  if (guia === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-editorial-bg text-center px-6">
        <h1 className="text-2xl font-serif font-bold text-editorial-primary">Guia não encontrado</h1>
        <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="inline-flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-editorial-primary hover:opacity-80 transition cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Voltar ao catálogo EcoSafari
        </a>
      </div>
    );
  }

  const todayISO = new Date().toISOString().split("T")[0];
  const upcomingUnavailable = (guia.unavailableDates || []).filter(d => d >= todayISO).sort().slice(0, 8);

  const whatsappMessage = `Olá! Vi o perfil do guia ${guia.name} na EcoSafari e gostaria de saber mais sobre expedições com ele(a).`;
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

      {/* Profile header — social-profile style: big circular photo, name, status */}
      <section className="bg-editorial-primary pt-14 pb-20 px-6 text-center">
        <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white/30 mx-auto mb-4 bg-white/10 flex items-center justify-center">
          {guia.photoUrl ? (
            <img src={guia.photoUrl} alt={guia.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
          ) : (
            <User className="h-12 w-12 text-white/60" />
          )}
        </div>
        {guia.languages.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 mb-2" title={guia.languages.map(l => l.language).join(", ")}>
            {guia.languages.map((l, i) => (
              <LanguageFlag key={i} language={l.language} className="w-6 h-4" />
            ))}
          </div>
        )}
        <h1 className="text-2xl md:text-3xl font-serif font-bold text-white">{guia.name}</h1>
        <div className="flex items-center justify-center gap-3 mt-2 text-white/80 text-xs">
          {guia.rating ? (
            <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {guia.rating} / 5.0</span>
          ) : (
            <span className="flex items-center gap-1 text-white/60"><Star className="h-3.5 w-3.5" /> Novo, sem avaliações ainda</span>
          )}
          {guia.birthplace && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {guia.birthplace}</span>}
          <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest font-bold ${guia.status === "disponivel" ? "bg-emerald-500/90" : "bg-white/20"}`}>
            {guia.status === "disponivel" ? "Disponível" : "Indisponível no momento"}
          </span>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-6 md:px-10 -mt-10 pb-12 space-y-8">
        <div className="bg-white border border-editorial-border p-6 shadow-sm">
          {guia.bio && <p className="text-editorial-text leading-relaxed text-sm font-light mb-5 whitespace-pre-line">{guia.bio}</p>}

          <div className="mb-5">
            <TopReviewQuote targetType="guia" targetId={guia.id} />
          </div>

          {guia.languages.length > 0 && (
            <div className="mb-4">
              <h3 className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted flex items-center gap-1.5 mb-2"><Languages className="h-3.5 w-3.5" /> Idiomas</h3>
              <div className="flex flex-wrap gap-1.5">
                {guia.languages.map((l, i) => (
                  <span key={i} className="bg-editorial-secondary text-editorial-primary border border-editorial-border px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5">
                    <LanguageFlag language={l.language} className="w-4 h-2.5" /> {l.language} — {LEVEL_LABELS[l.level]}
                  </span>
                ))}
              </div>
            </div>
          )}

          {guia.specialty.length > 0 && (
            <div className="mb-4">
              <h3 className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted flex items-center gap-1.5 mb-2"><Sparkles className="h-3.5 w-3.5" /> Especialidades</h3>
              <div className="flex flex-wrap gap-1.5">
                {guia.specialty.map((s, i) => <span key={i} className="bg-editorial-secondary text-editorial-primary border border-editorial-border px-2.5 py-1 rounded-full text-xs">{s}</span>)}
              </div>
            </div>
          )}

          {guia.interests && guia.interests.length > 0 && (
            <div>
              <h3 className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted mb-2">Temas de Interesse</h3>
              <div className="flex flex-wrap gap-1.5">
                {guia.interests.map((t, i) => <span key={i} className="bg-white text-editorial-muted border border-editorial-border px-2.5 py-1 rounded-full text-xs">{t}</span>)}
              </div>
            </div>
          )}

          {upcomingUnavailable.length > 0 && (
            <div className="mt-4 pt-4 border-t border-editorial-border">
              <h3 className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted flex items-center gap-1.5 mb-2"><CalendarOff className="h-3.5 w-3.5" /> Próximas indisponibilidades</h3>
              <div className="flex flex-wrap gap-1.5">
                {upcomingUnavailable.map(d => (
                  <span key={d} className="bg-red-50 text-red-700 border border-red-100 px-2.5 py-1 rounded-full text-xs">
                    {new Date(d + "T00:00:00").toLocaleDateString("pt-BR")}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {guia.images && guia.images.length > 0 && (
          <div>
            <h2 className="text-xl font-serif font-bold text-editorial-primary mb-4">Galeria</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {guia.images.map((img, idx) => (
                <div key={idx} className="aspect-square overflow-hidden border border-editorial-border">
                  <img src={img} alt={`${guia.name} ${idx + 1}`} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-xl font-serif font-bold text-editorial-primary mb-4">Avaliações</h2>
          <ReviewsSection targetType="guia" targetId={guia.id} />
        </div>
      </div>

      <section className="bg-editorial-primary text-white py-14 text-center px-6">
        <h2 className="text-2xl font-serif font-bold mb-3">Quer explorar com {guia.name.split(" ")[0]}?</h2>
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
