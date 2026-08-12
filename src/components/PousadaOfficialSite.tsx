import React, { useState, useEffect } from "react";
import { MapPin, Star, Check, Compass, MessageSquare, LoaderCircle, ArrowLeft, Instagram, ExternalLink, Users, PlayCircle, Quote, Sparkles } from "lucide-react";
import { Pousada, Review } from "../types";
import { slugify } from "../lib/slug";
import { navigate } from "../lib/router";
import LanguageSwitcher from "./LanguageSwitcher";
import PictureImg from "./PictureImg";
import PousadaHighlights, { hasPousadaHighlights } from "./PousadaHighlights";

const AGENCY_WHATSAPP_NUMBER = "5565999868334";

interface PousadaOfficialSiteProps {
  slug: string;
}

export default function PousadaOfficialSite({ slug }: PousadaOfficialSiteProps) {
  const [pousada, setPousada] = useState<Pousada | null | undefined>(undefined); // undefined = loading
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    fetch("/api/pousadas")
      .then(res => res.json())
      .then((all: Pousada[]) => {
        const found = all.find(p => slugify(p.name) === slug);
        setPousada(found || null);
      })
      .catch(() => setPousada(null));
  }, [slug]);

  useEffect(() => {
    if (!pousada?.id) return;
    fetch("/api/reviews")
      .then(res => res.json())
      .then((all: Review[]) => setReviews(all.filter(r => r.pousadaId === pousada.id)))
      .catch(() => {});
  }, [pousada?.id]);

  if (pousada === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-editorial-bg">
        <LoaderCircle className="h-8 w-8 text-editorial-primary animate-spin" />
      </div>
    );
  }

  if (pousada === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-editorial-bg text-center px-6">
        <h1 className="text-2xl font-serif font-bold text-editorial-primary">Site não encontrado</h1>
        <p className="text-editorial-muted text-sm">Não encontramos essa pousada.</p>
        <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="inline-flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-editorial-primary hover:opacity-80 transition cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Voltar ao catálogo EcoSafari
        </a>
      </div>
    );
  }

  const whatsappMessage = `Olá! Encontrei o site da ${pousada.name} e gostaria de mais informações.`;
  const whatsappLink = `https://wa.me/${AGENCY_WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage)}`;

  // Independent gallery for this page — falls back to the shared "images"
  // (used by the catalog's detail view) when the admin hasn't configured
  // official-site-specific photos yet, so no pousada goes from having a
  // gallery to having none just because this field is new.
  const galleryImages = pousada.officialSiteImages && pousada.officialSiteImages.length > 0
    ? pousada.officialSiteImages
    : pousada.images;

  return (
    <div className="bg-editorial-bg font-sans text-editorial-text">

      {/* Minimal site header — no EcoSafari nav, feels like its own domain */}
      <header className="h-16 flex items-center justify-between px-6 md:px-10 border-b border-editorial-border bg-white/70 backdrop-blur-sm sticky top-0 z-20">
        <span className="font-serif italic font-bold text-lg text-editorial-primary">{pousada.name}</span>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          {pousada.officialSiteUrl && (
            <a
              href={pousada.officialSiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-editorial-muted hover:text-editorial-primary transition"
              title={pousada.officialSiteUrl.includes("instagram.com") ? "Instagram" : "Redes sociais"}
            >
              {pousada.officialSiteUrl.includes("instagram.com") ? <Instagram className="h-4.5 w-4.5" /> : <ExternalLink className="h-4.5 w-4.5" />}
            </a>
          )}
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] uppercase tracking-widest font-bold px-4 py-2 rounded-md transition"
          >
            <MessageSquare className="h-3.5 w-3.5" /> Fale Conosco
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative h-[65vh] min-h-[420px] flex items-end">
        <PictureImg
          src={pousada.images[0]}
          alt={pousada.name}
          referrerPolicy="no-referrer"
          loading="eager"
          fetchPriority="high"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="relative z-10 max-w-5xl mx-auto px-6 md:px-10 pb-10 w-full">
          <span className="flex items-center gap-1.5 text-white/90 text-xs font-bold uppercase tracking-widest mb-3">
            <MapPin className="h-3.5 w-3.5" /> {pousada.location}
          </span>
          <h1 className="text-4xl md:text-6xl font-serif font-bold text-white tracking-tight max-w-3xl">{pousada.name}</h1>
          <div className="flex items-center gap-2 mt-4 text-white">
            <Star className={`h-4 w-4 ${pousada.rating > 0 ? "fill-amber-400 text-amber-400" : "text-white/60"}`} />
            <span className="font-bold text-sm">{pousada.rating > 0 ? `${pousada.rating} / 5.0` : "Novo, sem avaliações ainda"}</span>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="max-w-4xl mx-auto px-6 md:px-10 py-16">
        <span className="text-editorial-primary text-[11px] uppercase tracking-[0.2em] font-bold block mb-2">Sobre Nós</span>
        <p className="text-editorial-text text-lg font-light leading-relaxed whitespace-pre-line">
          {pousada.longDescription || pousada.description}
        </p>
      </section>

      {/* Gallery */}
      {galleryImages.length > 1 && (
        <section className="max-w-6xl mx-auto px-6 md:px-10 pb-16">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {galleryImages.slice(0, 6).map((img, idx) => (
              <div key={idx} className="aspect-square overflow-hidden border border-editorial-border">
                <PictureImg src={img} alt={`${pousada.name} ${idx + 1}`} referrerPolicy="no-referrer" className="w-full h-full object-cover hover:scale-105 transition duration-500" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Emotional bridge — the feeling of the place, not a feature list */}
      <section className="bg-editorial-primary py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <Quote className="h-7 w-7 text-white/40 mx-auto mb-6" />
          <p className="text-white text-2xl md:text-3xl font-serif italic leading-snug">
            Mais que um pesqueiro: um lugar pra pescar em paz, rir em família e voltar sempre que bater a saudade.
          </p>
        </div>
      </section>

      {/* Featured experiences (photo + pitch, alternating sides) */}
      {hasPousadaHighlights(pousada.id) && (
        <section className="max-w-5xl mx-auto px-6 md:px-10 py-16">
          <PousadaHighlights pousadaId={pousada.id} />
        </section>
      )}

      {/* Meet the team/family behind the place */}
      {pousada.teamPhotoUrl && (
        <section className="bg-editorial-secondary border-y border-editorial-border py-16">
          <div className="max-w-5xl mx-auto px-6 md:px-10 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
            <div className="aspect-[4/3] overflow-hidden border border-editorial-border order-2 md:order-1">
              <PictureImg
                src={pousada.teamPhotoUrl}
                alt={pousada.teamSectionTitle || "Quem vai te receber"}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="order-1 md:order-2">
              <span className="text-editorial-primary text-[11px] uppercase tracking-[0.2em] font-bold block mb-2">Quem vai te receber</span>
              <h2 className="text-2xl md:text-3xl font-serif font-bold text-editorial-primary mb-4">
                {pousada.teamSectionTitle || "Quem vai te receber"}
              </h2>
              <p className="text-editorial-text text-base font-light leading-relaxed whitespace-pre-line">
                {pousada.teamSectionText}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Quick highlights strip */}
      <section className="max-w-5xl mx-auto px-6 md:px-10 pb-16">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border border-editorial-border divide-y sm:divide-y-0 sm:divide-x divide-editorial-border">
          {[
            { Icon: Star, value: pousada.rating > 0 ? `${pousada.rating} / 5.0` : "Novo", label: "Avaliação" },
            { Icon: Users, value: `${pousada.capacity}`, label: "Hóspedes" },
            { Icon: Check, value: `${(pousada.features || []).length}`, label: "Comodidades" },
            { Icon: Compass, value: `${(pousada.activities || []).length}`, label: "Atividades" },
          ].map((stat, idx) => (
            <div key={idx} className="flex flex-col items-center justify-center text-center py-6 px-2">
              <stat.Icon className="h-4 w-4 text-editorial-primary mb-2" />
              <span className="text-xl font-serif font-bold text-editorial-primary">{stat.value}</span>
              <span className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted mt-1">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Welcome video from the family */}
      {pousada.videoUrl && (
        <section className="max-w-4xl mx-auto px-6 md:px-10 pb-16">
          <span className="text-editorial-primary text-[11px] uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-1.5 mb-2">
            <PlayCircle className="h-3.5 w-3.5" /> Um recado da família
          </span>
          <h2 className="text-2xl md:text-3xl font-serif font-bold text-editorial-primary mb-6 text-center">Antes de vir, dá um oi pra gente</h2>
          <div className="aspect-video border border-editorial-border overflow-hidden bg-black">
            <video src={pousada.videoUrl} controls className="w-full h-full object-cover" />
          </div>
        </section>
      )}

      {/* Guest testimonials */}
      {reviews.length > 0 && (
        <section className="bg-editorial-secondary border-y border-editorial-border py-16">
          <div className="max-w-5xl mx-auto px-6 md:px-10">
            <span className="text-editorial-primary text-[11px] uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-1.5 mb-2">
              <Sparkles className="h-3.5 w-3.5" /> Quem já veio conta
            </span>
            <h2 className="text-2xl md:text-3xl font-serif font-bold text-editorial-primary mb-10 text-center">O que os hóspedes dizem</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {reviews.slice(0, 3).map((review) => (
                <div key={review.id} className="bg-white border border-editorial-border p-6 relative">
                  <Quote className="h-5 w-5 text-editorial-primary/30 mb-3" />
                  <p className="text-sm text-editorial-text leading-relaxed mb-5">{review.comment}</p>
                  <div className="flex items-center gap-3">
                    {review.photoUrl ? (
                      <img src={review.photoUrl} alt={review.userName} referrerPolicy="no-referrer" className="w-9 h-9 rounded-full object-cover border border-editorial-border" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-editorial-secondary border border-editorial-border flex items-center justify-center text-editorial-primary font-serif font-bold text-sm">
                        {review.userName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-bold text-editorial-text">{review.userName}</p>
                      <div className="flex items-center gap-0.5 mt-0.5">
                        {Array.from({ length: review.rating }).map((_, i) => (
                          <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Structure & Activities */}
      <section className="bg-editorial-secondary py-16 border-y border-editorial-border">
        <div className="max-w-5xl mx-auto px-6 md:px-10 grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <h2 className="text-xl font-serif font-bold text-editorial-primary mb-4">Estrutura & Comodidades</h2>
            <div className="space-y-2">
              {(pousada.features || []).map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-editorial-text">
                  <Check className="h-4 w-4 text-editorial-primary flex-shrink-0" /> {f}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-xl font-serif font-bold text-editorial-primary mb-4">Atividades</h2>
            <div className="space-y-2">
              {(pousada.activities || []).map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-editorial-text">
                  <Compass className="h-4 w-4 text-editorial-primary flex-shrink-0" /> {a}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Experiences */}
      {pousada.experiences?.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 md:px-10 py-16">
          <h2 className="text-2xl font-serif font-bold text-editorial-primary mb-8 text-center">Experiências Oferecidas</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {pousada.experiences.map((exp, idx) => (
              <div key={idx} className="border border-editorial-border p-6 bg-white">
                <h3 className="font-serif font-bold text-editorial-primary text-lg mb-2">{exp.title}</h3>
                <p className="text-editorial-muted text-sm mb-4">{exp.description}</p>
                <span className="text-editorial-primary font-bold">R$ {exp.price.toLocaleString('pt-BR')} <span className="text-editorial-muted text-xs font-normal">/pessoa</span></span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Contact CTA */}
      <section className="bg-editorial-primary text-white py-16 text-center px-6">
        <h2 className="text-2xl md:text-3xl font-serif font-bold mb-3">Venha nos visitar</h2>
        <p className="text-white/80 text-sm mb-8 max-w-lg mx-auto">Diárias a partir de R$ {pousada.pricePerNight.toLocaleString('pt-BR')} · Capacidade para {pousada.capacity} hóspedes</p>
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-white text-editorial-primary hover:bg-white/90 font-bold px-8 py-3.5 text-xs uppercase tracking-widest transition"
        >
          <MessageSquare className="h-4 w-4" /> Fale Conosco no WhatsApp
        </a>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-editorial-muted text-[10px] uppercase tracking-widest font-bold">
        <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="hover:text-editorial-primary transition cursor-pointer">
          Listado no catálogo EcoSafari Brasil →
        </a>
      </footer>
    </div>
  );
}
