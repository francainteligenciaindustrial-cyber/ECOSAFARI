import React, { useState, useEffect } from "react";
import { ArrowLeft, Star, MapPin, Check, Coffee, MessageSquare, BadgeCheck, Eye, ExternalLink, X, ChevronLeft, ChevronRight, Images, Instagram, Bed, Users, UtensilsCrossed, Facebook, Youtube, Music2, Wifi, ParkingSquare, CalendarCheck } from "lucide-react";
import { navigate } from "../lib/router";
import { Pousada, Review } from "../types";
import { slugify } from "../lib/slug";
import PictureImg from "./PictureImg";
import PousadaHighlights, { hasPousadaHighlights } from "./PousadaHighlights";
import TopReviewQuote from "./TopReviewQuote";
import FavoriteButton from "./FavoriteButton";
import PousadaRecompensas from "./PousadaRecompensas";
import { useStructuredData } from "../lib/structuredData";
import { useI18n } from "../i18n/I18nProvider";

const MENU_CATEGORIES = ["prato", "sobremesa", "bebida", "drink", "outro"] as const;

interface PousadaDetailsViewProps {
  pousada: Pousada;
  onBack: () => void;
  onOpenBot: (pousada: Pousada, experience?: string, checkIn?: string, checkOut?: string) => void;
}

export default function PousadaDetailsView({ pousada, onBack, onOpenBot }: PousadaDetailsViewProps) {
  const [selectedExperience, setSelectedExperience] = useState((pousada.experiences && pousada.experiences[0]?.title) || "");
  const [viewCount, setViewCount] = useState(pousada.viewCount || 0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const { t, lang, formatMoney } = useI18n();

  const images = pousada.images && pousada.images.length > 0 ? pousada.images : [""];

  // Conta de avaliações real (não só a nota média já presente em
  // pousada.rating) — AggregateRating no schema.org só é um dado estruturado
  // válido pro Google se vier acompanhado da contagem de avaliações.
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/reviews")
      .then(res => (res.ok ? res.json() : []))
      .then((all: Review[]) => {
        if (cancelled) return;
        setReviewCount(all.filter(r => r.pousadaId === pousada.id).length);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pousada.id]);

  useStructuredData({
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: pousada.name,
    description: pousada.longDescription || pousada.description,
    image: (pousada.images || []).filter(Boolean),
    url: `${window.location.origin}/pousadas/${pousada.id}`,
    address: { "@type": "PostalAddress", addressLocality: pousada.location, addressCountry: "BR" },
    priceRange: `R$ ${pousada.pricePerNight}`,
    ...(pousada.rating > 0 && reviewCount ? {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: pousada.rating,
        reviewCount,
        bestRating: 5,
      },
    } : {}),
  });

  const showPrev = () => setLightboxIndex(i => i === null ? null : (i - 1 + images.length) % images.length);
  const showNext = () => setLightboxIndex(i => i === null ? null : (i + 1) % images.length);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") showPrev();
      if (e.key === "ArrowRight") showNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex]);

  useEffect(() => {
    fetch(`/api/pousadas/${pousada.id}/view`, { method: "POST" })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.viewCount) setViewCount(data.viewCount); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pousada.id]);

  const expPrice = (pousada.experiences || []).find(e => e.title === selectedExperience)?.price || 0;
  // Link digitado sem "https://" viraria um caminho interno do próprio site.
  const absoluteUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url.replace(/^\/+/, "")}`);
  const officialSiteHref = pousada.customDomain
    ? absoluteUrl(pousada.customDomain)
    : pousada.hasOwnWebsite && pousada.ownWebsiteUrl
      ? absoluteUrl(pousada.ownWebsiteUrl.trim())
      : pousada.sitePublicado
        ? `/site/${slugify(pousada.name)}`
        : null;

  return (
    <div id={`pousada-detail-${pousada.id}`} className="bg-editorial-bg min-h-screen py-10 text-editorial-text font-sans">
      <div className="max-w-7xl mx-auto px-6">
        
        {/* Back navigation */}
        <button
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-editorial-muted hover:text-editorial-primary transition cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> {t("details.back")}
        </button>

        {/* Title and Ratings */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2 text-[10px] text-editorial-muted font-bold uppercase tracking-widest flex-wrap">
              <span className="bg-editorial-secondary text-editorial-primary border border-editorial-border px-2 py-0.5 rounded-none">{t("details.officialPartner")}</span>
              {pousada.verified && (
                <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full" title={t("details.verifiedTitle")}>
                  <BadgeCheck className="h-3 w-3" /> {t("common.verified")}
                </span>
              )}
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {pousada.location}</span>
              {viewCount > 0 && (
                <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {t("details.views", { n: viewCount })}</span>
              )}
            </div>
            <h1 className="text-3xl md:text-5xl font-serif font-bold text-editorial-primary tracking-tight">{pousada.name}</h1>
            <div className="flex items-center gap-4 mt-2">
              {/* Site oficial: domínio próprio apontado para o site feito pela
                  EcoSafari > /site/:slug (site entregue pela equipe) > site
                  próprio da pousada. Sem nenhum, o link não aparece — o site é
                  um serviço contratado (ver PedidoSiteCard). */}
              {officialSiteHref && (
                <a
                  href={officialSiteHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-editorial-primary hover:underline cursor-pointer"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> {t("details.officialSite")}
                </a>
              )}
              {pousada.officialSiteUrl && (
                <a href={pousada.officialSiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-editorial-primary hover:underline cursor-pointer">
                  <Instagram className="h-3.5 w-3.5" /> Instagram
                </a>
              )}
              {pousada.facebookUrl && (
                <a href={pousada.facebookUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-editorial-primary hover:underline cursor-pointer">
                  <Facebook className="h-3.5 w-3.5" /> Facebook
                </a>
              )}
              {pousada.tiktokUrl && (
                <a href={pousada.tiktokUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-editorial-primary hover:underline cursor-pointer">
                  <Music2 className="h-3.5 w-3.5" /> TikTok
                </a>
              )}
              {pousada.youtubeUrl && (
                <a href={pousada.youtubeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-editorial-primary hover:underline cursor-pointer">
                  <Youtube className="h-3.5 w-3.5" /> YouTube
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 md:mt-0">
            <FavoriteButton pousadaId={pousada.id} />
            {pousada.rating > 0 ? (
              <>
                <div className="flex items-center gap-1 text-editorial-primary bg-editorial-secondary border border-editorial-border px-3 py-1.5 rounded-none font-serif text-sm font-bold">
                  <Star className="h-4 w-4 fill-amber-500 text-amber-500" /> {pousada.rating} / 5.0
                </div>
                <span className="text-xs text-editorial-muted font-medium">{t("details.basedOnReviews")}</span>
              </>
            ) : (
              <div className="flex items-center gap-1 text-editorial-muted bg-editorial-secondary border border-editorial-border px-3 py-1.5 rounded-none font-serif text-sm font-bold">
                <Star className="h-4 w-4" /> {t("details.noReviews")}
              </div>
            )}
          </div>
        </div>

        {/* Gallery: hero + full thumbnail grid of every photo, with lightbox */}
        <div className="mb-10">
          <div
            onClick={() => setLightboxIndex(0)}
            className="h-[420px] md:h-[480px] overflow-hidden rounded-none border border-editorial-border relative cursor-pointer group mb-4"
          >
            <PictureImg
              src={images[0]}
              alt={pousada.name}
              referrerPolicy="no-referrer"
              loading="eager"
              fetchPriority="high"
              className="w-full h-full object-cover group-hover:scale-102 transition duration-500"
            />
            <div className="absolute bottom-4 left-4 bg-editorial-primary/95 text-[#FBF8F1] text-[9px] uppercase tracking-widest px-3 py-1.5 rounded-none font-bold">
              {t("details.mainView")}
            </div>
            {images.length > 1 && (
              <div className="absolute bottom-4 right-4 bg-black/70 text-white text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-none font-bold flex items-center gap-1.5">
                <Images className="h-3.5 w-3.5" /> {t("details.photos", { n: images.length })}
              </div>
            )}
          </div>

          {images.length > 1 && (() => {
            // Caps the thumbnail grid at 12 tiles — past that, the grid gets
            // long and repetitive for pousadas with a big gallery. The 12th
            // tile gets a "+N" overlay for however many photos didn't get a
            // tile of their own; those aren't gone, just not duplicated in
            // the grid — clicking the 12th tile opens the lightbox at that
            // position, and Próxima/Anterior already cycles through the
            // full "images" array regardless of what the grid shows.
            const MAX_VISIBLE_THUMBS = 12;
            const thumbnails = images.slice(1);
            const visibleThumbnails = thumbnails.slice(0, MAX_VISIBLE_THUMBS);
            const hiddenCount = Math.max(0, thumbnails.length - MAX_VISIBLE_THUMBS);

            return (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {visibleThumbnails.map((img, idx) => {
                  const isLastVisible = hiddenCount > 0 && idx === MAX_VISIBLE_THUMBS - 1;
                  return (
                    <button
                      key={idx}
                      onClick={() => setLightboxIndex(idx + 1)}
                      aria-label={t("details.photoN", { n: idx + 2 })}
                      className="aspect-square overflow-hidden border border-editorial-border relative cursor-pointer group"
                    >
                      <PictureImg
                        src={img}
                        alt={`${pousada.name} ${idx + 2}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      />
                      {isLastVisible && (
                        <div className="absolute inset-0 bg-black/65 flex items-center justify-center">
                          <span className="text-white font-serif font-bold text-2xl">+{hiddenCount}</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Lightbox */}
        {lightboxIndex !== null && (
          <div role="dialog" aria-modal="true" aria-label={pousada.name} className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightboxIndex(null)}>
            <button
              onClick={() => setLightboxIndex(null)}
              className="absolute top-4 right-4 text-white/80 hover:text-white transition cursor-pointer"
              aria-label={t("common.close")}
            >
              <X className="h-7 w-7" />
            </button>

            {images.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); showPrev(); }}
                className="absolute left-2 md:left-6 text-white/80 hover:text-white transition cursor-pointer p-2"
                aria-label={t("details.prevPhoto")}
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
            )}

            <PictureImg
              src={images[lightboxIndex]}
              alt={`${pousada.name} ${lightboxIndex + 1}`}
              referrerPolicy="no-referrer"
              loading="eager"
              onClick={(e) => e.stopPropagation()}
              className="max-h-[85vh] max-w-[90vw] object-contain"
            />

            {images.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); showNext(); }}
                className="absolute right-2 md:right-6 text-white/80 hover:text-white transition cursor-pointer p-2"
                aria-label={t("details.nextPhoto")}
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            )}

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-xs font-mono">
              {lightboxIndex + 1} / {images.length}
            </div>
          </div>
        )}

        {/* Grid: Details vs Booking Widget */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Details column */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* Overview / Long description */}
            <div className="bg-white p-8 rounded-none border border-editorial-border shadow-sm">
              <h2 className="text-2xl font-serif font-bold text-editorial-primary mb-4">{t("details.about")}</h2>
              <p lang="pt-BR" className="text-editorial-muted leading-relaxed mb-4 whitespace-pre-line text-xs font-light">
                {pousada.longDescription || pousada.description}
              </p>
              {lang !== "pt" && <p className="text-[10px] italic text-editorial-muted -mt-2 mb-4">{t("details.originalLanguage")}</p>}
              <div className="mb-6">
                <TopReviewQuote targetType="pousada" targetId={pousada.id} />
              </div>

              {/* Structure list */}
              <div className="border-t border-editorial-border pt-6">
                <h3 className="font-serif font-bold text-editorial-primary text-base mb-4 flex items-center gap-2"><Coffee className="h-4.5 w-4.5 text-editorial-primary" /> {t("details.amenities")}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {(pousada.features || []).map((feat, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-editorial-muted text-xs font-medium">
                      <div className="bg-editorial-secondary text-editorial-primary border border-editorial-border p-1">
                        <Check className="h-3 w-3" />
                      </div>
                      {feat}
                    </div>
                  ))}
                </div>
              </div>

              {/* Serviços — culinária, transporte, entretenimento e um texto
                  livre de atendimento/necessidades especiais, além dos tags
                  de "features" já existentes acima. */}
              {(pousada.cuisineTypes?.length || pousada.transportOptions?.length || pousada.entertainmentOptions?.length || pousada.serviceNotes || pousada.hasParking || pousada.hasWifi) ? (
                <div className="border-t border-editorial-border pt-6 mt-6 space-y-3">
                  <h3 className="font-serif font-bold text-editorial-primary text-base flex items-center gap-2"><UtensilsCrossed className="h-4.5 w-4.5 text-editorial-primary" /> {t("details.services")}</h3>
                  {(pousada.hasParking || pousada.hasWifi) && (
                    <div className="flex items-center gap-4">
                      {pousada.hasParking && <span className="flex items-center gap-1.5 text-xs text-editorial-text"><ParkingSquare className="h-4 w-4 text-editorial-primary" /> {t("details.parking")}</span>}
                      {pousada.hasWifi && <span className="flex items-center gap-1.5 text-xs text-editorial-text"><Wifi className="h-4 w-4 text-editorial-primary" /> Wi-Fi</span>}
                    </div>
                  )}
                  {pousada.cuisineTypes && pousada.cuisineTypes.length > 0 && (
                    <p className="text-xs"><span className="text-editorial-muted font-semibold">{t("details.cuisine")}: </span>{pousada.cuisineTypes.join(", ")}</p>
                  )}
                  {pousada.transportOptions && pousada.transportOptions.length > 0 && (
                    <p className="text-xs"><span className="text-editorial-muted font-semibold">{t("details.transport")}: </span>{pousada.transportOptions.join(", ")}</p>
                  )}
                  {pousada.entertainmentOptions && pousada.entertainmentOptions.length > 0 && (
                    <p className="text-xs"><span className="text-editorial-muted font-semibold">{t("details.entertainment")}: </span>{pousada.entertainmentOptions.join(", ")}</p>
                  )}
                  {pousada.serviceNotes && (
                    <p className="text-editorial-muted text-xs whitespace-pre-line">{pousada.serviceNotes}</p>
                  )}
                </div>
              ) : null}

              {/* Rooms breakdown */}
              {pousada.rooms && pousada.rooms.length > 0 && (
                <div className="border-t border-editorial-border pt-6 mt-6">
                  <h3 className="font-serif font-bold text-editorial-primary text-base mb-4 flex items-center gap-2"><Bed className="h-4.5 w-4.5 text-editorial-primary" /> {t("details.rooms")}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {pousada.rooms.map((room, idx) => (
                      <div key={idx} className="border border-editorial-border p-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-editorial-text">{room.type}</span>
                          <span className="text-editorial-muted flex items-center gap-3">
                            <span>{room.quantity}x</span>
                            <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {t("details.upTo", { n: room.capacity })}</span>
                          </span>
                        </div>
                        {room.beds && room.beds.length > 0 && (
                          <p className="text-editorial-muted mt-1.5 pt-1.5 border-t border-editorial-border/60">
                            {room.beds.map(b => `${b.count}x ${b.bedType}`).join(" · ")}
                          </p>
                        )}
                        {(room.hasAC || room.hasTV || room.hasMinibar || room.bathroomType) && (
                          <p className="text-editorial-muted mt-1.5 pt-1.5 border-t border-editorial-border/60">
                            {[
                              room.hasAC && t("room.ac"),
                              room.hasTV && t("room.tv"),
                              room.hasMinibar && t("room.minibar"),
                              room.bathroomType && t(room.bathroomType === "comum" ? "room.bathroom.comum" : "room.bathroom.privado"),
                            ].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cardápio do bar/restaurante próprio, quando a pousada tiver
                  um — agrupado por categoria (Pratos/Bebidas/Drinks/
                  Sobremesas) pra facilitar a leitura em vez de uma lista só. */}
              {pousada.menu && pousada.menu.length > 0 && (
                <div className="border-t border-editorial-border pt-6 mt-6">
                  <h3 className="font-serif font-bold text-editorial-primary text-base mb-4 flex items-center gap-2"><UtensilsCrossed className="h-4.5 w-4.5 text-editorial-primary" /> {t("details.menu")}</h3>
                  {MENU_CATEGORIES.map(key => {
                    const items = pousada.menu!.filter(item => (item.category || "prato") === key);
                    if (items.length === 0) return null;
                    return (
                      <div key={key} className="mb-4 last:mb-0">
                        <h4 className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted mb-2">{t(`menu.${key}`)}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {items.map((item, idx) => (
                            <div key={idx} className="border border-editorial-border p-3 text-xs">
                              <div className="flex items-start justify-between gap-3">
                                <span className="text-editorial-text font-semibold">{item.item}</span>
                                <span className="font-bold text-editorial-primary whitespace-nowrap">{formatMoney(item.price)}</span>
                              </div>
                              {item.description && <p className="text-editorial-muted text-[11px] mt-1 leading-relaxed">{item.description}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <PousadaRecompensas pousadaId={pousada.id} />

            {/* Featured experiences (photo + pitch, alternating sides) */}
            {hasPousadaHighlights(pousada.id) && (
              <div className="bg-white p-8 rounded-none border border-editorial-border shadow-sm">
                <PousadaHighlights pousadaId={pousada.id} />
              </div>
            )}

            {/* Activities available */}
            <div className="bg-white p-8 rounded-none border border-editorial-border shadow-sm">
              <h2 className="text-2xl font-serif font-bold text-editorial-primary mb-4">{t("details.activities")}</h2>
              <p className="text-editorial-muted text-xs mb-6">{t("details.activitiesText")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(pousada.activities || []).map((act, idx) => (
                  <div key={idx} className="border border-editorial-border hover:border-editorial-primary hover:bg-editorial-secondary/10 p-5 rounded-none flex items-start gap-3 transition">
                    <div className="bg-editorial-secondary text-editorial-primary border border-editorial-border p-2 font-bold text-xs mt-0.5">
                      {idx + 1}
                    </div>
                    <div>
                      <h4 className="font-serif font-bold text-editorial-primary text-sm">{act}</h4>
                      <p className="text-editorial-muted text-[11px] mt-1 font-light">{t("details.activityNote")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Possibilities of safari/fauna experiences (Exclusive upgrades) */}
            <div className="bg-white p-8 rounded-none border border-editorial-border shadow-sm">
              <h2 className="text-2xl font-serif font-bold text-editorial-primary mb-2">{t("details.experiences")}</h2>
              <p className="text-editorial-muted text-xs mb-6">{t("details.experiencesText")}</p>
              
              <div className="space-y-4">
                {(pousada.experiences || []).map((exp, idx) => (
                  <div
                    key={idx}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedExperience === exp.title}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedExperience(exp.title); } }}
                    onClick={() => setSelectedExperience(exp.title)}
                    className={`border p-5 rounded-none cursor-pointer transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      selectedExperience === exp.title
                        ? "border-editorial-primary bg-editorial-secondary/40 shadow-sm"
                        : "border-editorial-border hover:border-editorial-muted bg-white"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 bg-editorial-primary"></span>
                        <h4 className="font-serif font-bold text-editorial-primary text-base">{exp.title}</h4>
                      </div>
                      <p className="text-editorial-muted text-xs mt-2 max-w-xl font-light">{exp.description}</p>
                    </div>
                    <div className="text-right border-t sm:border-t-0 pt-3 sm:pt-0 border-editorial-border font-serif">
                      <span className="block text-[9px] text-editorial-muted font-bold uppercase tracking-wider font-sans">{t("details.investment")}</span>
                      <span className="text-lg font-extrabold text-editorial-primary">{formatMoney(exp.price)}</span>
                      <span className="text-editorial-muted text-xs block font-sans">{t("common.perPerson")}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Booking / Calendar widget column */}
          <div className="lg:col-span-4">
            <div className="bg-white p-6 rounded-none border border-editorial-border shadow-sm sticky top-6 space-y-6">
              <div>
                <h3 className="font-serif font-bold text-editorial-primary text-lg mb-1">{t("details.bookTitle")}</h3>
                <p className="text-editorial-muted text-xs">{t("details.bookText")}</p>
              </div>

              {/* Price info */}
              <div className="bg-editorial-secondary p-4 border border-editorial-border rounded-none space-y-2 text-xs">
                <div className="flex justify-between text-editorial-muted">
                  <span>{t("details.nightly")}</span>
                  <span>{formatMoney(pousada.pricePerNight)}</span>
                </div>
                {selectedExperience && (
                  <div className="flex justify-between text-editorial-muted">
                    <span>{t("details.expedition", { name: selectedExperience })}</span>
                    <span>{formatMoney(expPrice)} {t("booking.perPersonShort")}</span>
                  </div>
                )}
                <div className="border-t border-editorial-border pt-2 flex justify-between font-bold text-editorial-primary text-xs mt-2 font-serif">
                  <span>{t("details.capacity")}</span>
                  <span>{t("details.guests", { n: pousada.capacity })}</span>
                </div>
              </div>

              <a
                href={`/reservar/${encodeURIComponent(pousada.id)}`}
                onClick={e => { e.preventDefault(); navigate(`/reservar/${encodeURIComponent(pousada.id)}`); }}
                className="w-full bg-editorial-primary hover:opacity-90 text-white font-bold py-3 rounded-none text-xs uppercase tracking-widest transition duration-200 flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <CalendarCheck className="h-4.5 w-4.5" /> {t("details.bookOnline")}
              </a>

              <button
                onClick={() => onOpenBot(pousada, selectedExperience)}
                className="w-full bg-white border border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-bold py-3 rounded-none text-xs transition duration-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <MessageSquare className="h-4.5 w-4.5" /> {t("details.whatsapp")}
              </button>

              <p className="text-[10px] text-editorial-muted text-center leading-normal">
                {t("details.cancelPolicy")}{" "}
                <a href="/termos" className="text-editorial-primary font-semibold hover:underline">{t("details.cancelPolicyLink")}</a>.
              </p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
