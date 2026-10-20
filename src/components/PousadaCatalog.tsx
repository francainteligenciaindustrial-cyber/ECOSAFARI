import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from "react";
import { Star, MapPin, Compass, PlayCircle, Eye, ChevronRight, MessageCircle, ChevronLeft, X, Smartphone, BadgeCheck, UtensilsCrossed, User, Lock, LoaderCircle, Search } from "lucide-react";
import { Pousada, Review, Species, Sighting, PublicBookingSummary, Atracao, Guide } from "../types";
import PictureImg from "./PictureImg";
import { navigate } from "../lib/router";
import LanguageFlag from "./LanguageFlag";
import { adminFetch } from "../lib/adminFetch";
import { useTouristSession } from "../lib/useTouristSession";
import { isCompletePousadaProfile } from "../lib/pousadaCompleteness";
import { extractLocationRegions, SortOption } from "../lib/catalogFilters";
import { useToast } from "../lib/ToastProvider";
import ErrorBoundary from "./ErrorBoundary";
import { SkeletonPousadaGrid } from "./Skeleton";
import { useI18n } from "../i18n/I18nProvider";
import { WILD_SPECIES, findWildSpecies, SeasonLevel } from "../data/wildSpecies";
import SpeciesSeasonCalendar from "./SpeciesSeasonCalendar";
import SeasonCalendarSection from "./SeasonCalendarSection";
import PacotesSection from "./PacotesSection";
import { useSightingStats, matchSpeciesStats, unmatchedSpeciesStats, publishablePoints } from "../lib/useSightingStats";
import { seasonFromMonthly } from "../lib/sightingStats";

// Code-split — see App.tsx for why (same component, lazy-loaded separately
// here since this page embeds it directly too).
const MobileSimulator = lazy(() => import("./MobileSimulator"));
// Leaflet (~150 KB) só baixa quando o mapa entra na tela.
const PantanalMap = lazy(() => import("./PantanalMap"));

// Conteúdo educativo de fallback (enquanto o admin não cadastra espécies
// reais) vem de src/data/wildSpecies.ts — já traduzido e com o calendário de
// melhor época. Sem pousada própria: cada espécie é ligada a uma pousada
// real na hora de renderizar (ver displaySpecies).
interface DisplaySpecies {
  id: string;
  name: string;
  scientificName: string;
  category: string;
  description: string;
  details: string;
  sightings: string;
  image: string;
  bestPousadaId: string;
  bestPousadaName: string;
  season?: SeasonLevel[];
  // Avistamentos aprovados no app EcoSafari Go (Jan..Dez), quando há.
  monthlyCounts?: number[];
  sightingsTotal?: number;
  seasonFromApp?: boolean;
}

interface PousadaCatalogProps {
  pousadas: Pousada[];
  reviews: Review[];
  species?: Species[];
  sightings?: Sighting[];
  bookings?: PublicBookingSummary[];
  onAddSighting?: (sighting: Sighting) => void;
  onRefreshData?: () => void;
  onSelectPousada: (pousada: Pousada) => void;
  onSelectVideo: (pousada: Pousada) => void;
  onAddReview: (newReview: any) => void;
  onOpenBotWithPousada: (pousada: Pousada) => void;
}

export default function PousadaCatalog({
  pousadas,
  reviews,
  species = [],
  sightings = [],
  bookings = [],
  onAddSighting = () => {},
  onRefreshData = () => {},
  onSelectPousada,
  onSelectVideo,
  onAddReview,
  onOpenBotWithPousada
}: PousadaCatalogProps) {
  const { t, lang, formatMoney } = useI18n();
  // Binds each fallback species to a real partner pousada (round-robin) so
  // "Onde avistar esta espécie" always names a lodge that actually exists —
  // and that the "Conhecer Pousada Ideal" button actually opens — instead of
  // a fixed fake name from demo data. Espécies do banco ganham o calendário
  // de melhor época quando o nome casa com uma de src/data/wildSpecies.ts.
  const baseSpecies: DisplaySpecies[] = useMemo(() => species.length > 0
    ? species.map(s => ({ ...s, season: findWildSpecies(s.name)?.season }))
    : WILD_SPECIES.map((s, idx) => {
        const realPousada = pousadas.length > 0 ? pousadas[idx % pousadas.length] : null;
        const text = s.text[lang];
        return {
          id: s.id,
          name: text.name,
          scientificName: s.scientificName,
          category: text.category,
          description: text.description,
          details: text.details,
          sightings: s.sightingRate,
          image: s.image,
          season: s.season,
          bestPousadaId: realPousada?.id || "",
          bestPousadaName: realPousada?.name || t("species.partnerFallback"),
        };
      }), [species, pousadas, lang, t]);

  // Dados reais do app EcoSafari Go: com amostra suficiente, o calendário
  // passa a refletir os avistamentos aprovados, e a pousada indicada vira a
  // que mais registrou a espécie (vínculo feito pelo ID da pousada no app).
  const sightingStats = useSightingStats();
  const displaySpecies: DisplaySpecies[] = useMemo(() => baseSpecies.map(s => {
    const real = matchSpeciesStats(sightingStats, s);
    if (!real) return s;
    const realSeason = seasonFromMonthly(real.monthly, real.total);
    const top = real.topPousadaId ? pousadas.find(p => p.id === real.topPousadaId) : undefined;
    return {
      ...s,
      season: realSeason || s.season,
      seasonFromApp: !!realSeason,
      monthlyCounts: real.monthly,
      sightingsTotal: real.total,
      ...(top ? { bestPousadaId: top.id, bestPousadaName: top.name } : {}),
    };
  }), [baseSpecies, sightingStats, pousadas]);

  // Espécies registradas no app que ainda não estão na vitrine: entram no
  // calendário com os registros atuais.
  const extraCalendarRows = useMemo(() => unmatchedSpeciesStats(sightingStats, baseSpecies).map(s => {
    const top = s.topPousadaId ? pousadas.find(p => p.id === s.topPousadaId) : undefined;
    return {
      id: `app:${s.key}`,
      name: s.name,
      // Foto do conteúdo educativo quando a espécie é conhecida (ex.: jacaré).
      image: findWildSpecies(s.name)?.image || (s.scientificName ? WILD_SPECIES.find(w => w.scientificName.toLowerCase() === s.scientificName!.toLowerCase())?.image : undefined) || "",
      season: seasonFromMonthly(s.monthly, s.total) || undefined,
      bestPousadaId: top?.id || "",
      monthlyCounts: s.monthly,
      seasonFromApp: true,
    };
  }), [sightingStats, baseSpecies, pousadas]);
  const mapPoints = useMemo(() => publishablePoints(sightingStats, baseSpecies), [sightingStats, baseSpecies]);
  const { checking: checkingTourist, isTourist, profile: touristProfile } = useTouristSession();
  const { showToast } = useToast();
  const [filterLocation, setFilterLocation] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("relevance");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [ratingInput, setRatingInput] = useState(5);
  const [commentInput, setCommentInput] = useState("");
  const [photoUrlInput, setPhotoUrlInput] = useState("");
  const [selectedPousadaForReview, setSelectedPousadaForReview] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Atrações (Paradas Legais / Restaurantes) and Guias — fetched locally
  // instead of threading through App.tsx's central fetchData, since this is
  // the only place on the public site that browses them (their own detail
  // pages at /atracoes/:id and /guias/:id fetch independently too).
  const [atracoes, setAtracoes] = useState<Atracao[]>([]);
  const [guiasPublicos, setGuiasPublicos] = useState<Omit<Guide, "email" | "phone">[]>([]);
  useEffect(() => {
    fetch("/api/atracoes").then(res => res.json()).then(setAtracoes).catch(() => {});
    fetch("/api/guides/public").then(res => res.json()).then(setGuiasPublicos).catch(() => {});
  }, []);

  // Wildlife Showcase species details and carousel navigation
  const [selectedSpecies, setSelectedSpecies] = useState<DisplaySpecies | null>(null);
  const speciesCarouselRef = useRef<HTMLDivElement>(null);

  const scrollSpeciesLeft = () => {
    if (speciesCarouselRef.current) {
      speciesCarouselRef.current.scrollBy({ left: -360, behavior: "smooth" });
    }
  };

  const scrollSpeciesRight = () => {
    if (speciesCarouselRef.current) {
      speciesCarouselRef.current.scrollBy({ left: 360, behavior: "smooth" });
    }
  };

  const faqs = ([1, 2, 3, 4] as const).map(n => ({
    question: t(`faq.q${n}`),
    answer: t(`faq.a${n}`),
  }));

  // Set default selected pousada for review once pousadas load. O e-mail
  // pós-estadia linka /?avaliar=<pousadaId>#avaliacoes — já chega com a
  // pousada certa escolhida e rola até o formulário.
  useEffect(() => {
    if (pousadas.length === 0 || selectedPousadaForReview) return;
    const fromEmail = new URLSearchParams(window.location.search).get("avaliar");
    const target = fromEmail && pousadas.some(p => p.id === fromEmail) ? fromEmail : pousadas[0]?.id || "";
    setSelectedPousadaForReview(target);
    if (fromEmail) setTimeout(() => document.getElementById("avaliacoes")?.scrollIntoView({ behavior: "smooth" }), 300);
  }, [pousadas, selectedPousadaForReview]);

  const completePousadas = useMemo(() => pousadas.filter(isCompletePousadaProfile), [pousadas]);

  // Regiões (estado/cidade/bioma) extraídas do texto livre que o admin
  // digitou em cada pousada.location (ex: "Pantanal Norte, Mato Grosso") —
  // dinâmico, cresce sozinho conforme mais pousadas de outras regiões entram
  // no catálogo, sem precisar editar código nem mexer no formulário do admin.
  const uniqueLocations = extractLocationRegions(completePousadas);

  // Grade do catálogo: busca/filtro/ordenação/paginação rodam no SERVIDOR
  // (GET /api/pousadas?page=...) em vez de carregar tudo pro navegador e
  // filtrar em JS — o array `pousadas` (prop, carregado inteiro por
  // App.tsx) continua existindo só pra alimentar o carrossel de espécies e
  // o seletor "qual pousada você visitou" da avaliação mais abaixo, que
  // precisam mesmo da lista inteira.
  const CATALOG_PAGE_SIZE = 12;
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogItems, setCatalogItems] = useState<Pousada[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(true);

  // Debounce da busca — evita disparar uma requisição a cada tecla digitada.
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Qualquer mudança de filtro/ordenação volta pra primeira página — senão
  // dá pra ficar "preso" numa página 3 que não existe mais pro filtro novo.
  useEffect(() => {
    setCatalogPage(1);
  }, [debouncedSearch, filterLocation, priceMin, priceMax, sortBy]);

  useEffect(() => {
    setCatalogLoading(true);
    const params = new URLSearchParams({ page: String(catalogPage), pageSize: String(CATALOG_PAGE_SIZE), sortBy });
    if (filterLocation !== "all") params.set("location", filterLocation);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (priceMin !== "") params.set("priceMin", priceMin);
    if (priceMax !== "") params.set("priceMax", priceMax);

    let cancelled = false;
    fetch(`/api/pousadas?${params.toString()}`)
      .then(res => res.json())
      .then((body: { items: Pousada[]; total: number }) => {
        if (cancelled) return;
        setCatalogItems(body.items || []);
        setCatalogTotal(body.total || 0);
      })
      .catch(() => {
        if (!cancelled) {
          setCatalogItems([]);
          setCatalogTotal(0);
        }
      })
      .finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [catalogPage, debouncedSearch, filterLocation, priceMin, priceMax, sortBy]);

  const catalogTotalPages = Math.max(1, Math.ceil(catalogTotal / CATALOG_PAGE_SIZE));
  const hasActiveFilters = searchQuery.trim() !== "" || priceMin !== "" || priceMax !== "" || sortBy !== "relevance" || filterLocation !== "all";

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim() || submittingReview) return;

    setSubmittingReview(true);
    setReviewError("");
    try {
      const response = await adminFetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pousadaId: selectedPousadaForReview,
          rating: ratingInput,
          comment: commentInput,
          photoUrl: photoUrlInput.trim() || undefined
        })
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setReviewError(body.error || t("reviews.error"));
        return;
      }
      onAddReview(body);

      setCommentInput("");
      setPhotoUrlInput("");
      setRatingInput(5);
      setReviewSuccess(true);
      setTimeout(() => setReviewSuccess(false), 4000);
    } catch (err) {
      console.error(err);
      setReviewError(t("reviews.error"));
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div id="landing-page" className="bg-editorial-bg min-h-screen text-editorial-text font-sans">
      
      {/* Hero Section */}
      <section className="relative h-[550px] flex items-center justify-center bg-editorial-primary text-white overflow-hidden">
        {/* Ambient video-like image background with darker overlay */}
        <div className="absolute inset-0 opacity-25 bg-[url('/hero-pantanal-fauna.webp')] bg-cover bg-center"></div>
        
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-editorial-primary/45"></div>
        
        <div className="relative max-w-5xl mx-auto px-6 text-center z-10 flex flex-col items-center">
          <span className="text-[11px] uppercase tracking-[0.3em] font-bold text-[#F6EEDC]/80 mb-4">
            {t("catalog.hero.kicker")}
          </span>
          <span aria-hidden="true" className="block w-14 h-[3px] bg-arara-yellow -mt-2 mb-6" />
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-serif tracking-tight mb-5 sm:mb-6 max-w-4xl text-balance leading-tight">
            {t("catalog.hero.title1")} <span className="italic font-normal opacity-90">{t("catalog.hero.titleEm")}</span> {t("catalog.hero.title2")}
          </h1>
          <p className="text-sm md:text-base text-[#F6EEDC] mb-8 max-w-2xl text-balance font-light leading-relaxed tracking-wide">
            {t("catalog.hero.subtitle")}
          </p>
          <div className="flex flex-wrap gap-3 sm:gap-4 justify-center text-[10px] sm:text-[11px] uppercase tracking-[0.15em] sm:tracking-[0.2em] font-semibold">
            <a href="#catalogo" className="bg-arara-yellow text-arara-black hover:bg-arara-orange px-4 sm:px-6 py-2.5 sm:py-3 rounded-none transition duration-200 shadow-sm flex items-center gap-2">
              <Compass className="h-4 w-4" /> {t("catalog.hero.cta")}
            </a>
            <a href="#mapa" className="border border-[#F6EEDC]/60 text-[#FBF8F1] hover:bg-white/10 px-4 sm:px-6 py-2.5 sm:py-3 rounded-none transition duration-200 flex items-center gap-2">
              <MapPin className="h-4 w-4" /> {t("catalog.hero.ctaMap")}
            </a>
          </div>
        </div>
      </section>

      {/* Catalog Filters and Section */}
      <ErrorBoundary variant="section" sectionLabel="o catálogo de pousadas">
      <section id="catalogo" className="max-w-7xl mx-auto px-6 py-16 scroll-mt-10">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-6 gap-6">
          <div>
            <span className="text-[10px] uppercase tracking-[0.3em] text-editorial-primary font-bold">{t("catalog.kicker")}</span>
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-editorial-primary mt-1 tracking-tight">{t("catalog.title")}</h2>
            <p className="text-editorial-muted text-xs mt-2 max-w-xl">{t("catalog.subtitle")}</p>
          </div>

          {/* Location Filters — biomas mostrados como atalhos rápidos
              (chips) quando são poucos; a partir de um certo número vira um
              dropdown "Região" pra não estourar a linha (estado/cidade
              tendem a crescer conforme mais pousadas entram no catálogo). */}
          {uniqueLocations.length <= 6 ? (
            <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest font-bold">
              <button
                onClick={() => setFilterLocation("all")}
                className={`px-4 py-2 rounded-full transition duration-200 border cursor-pointer ${
                  filterLocation === "all"
                    ? "bg-editorial-primary text-[#FBF8F1] border-editorial-primary shadow-sm"
                    : "bg-white text-editorial-text hover:bg-editorial-secondary border-editorial-border"
                }`}
              >
                {t("catalog.allRegions")}
              </button>
              {uniqueLocations.map((loc, idx) => (
                <button
                  key={idx}
                  onClick={() => setFilterLocation(loc)}
                  className={`px-4 py-2 rounded-full transition duration-200 border cursor-pointer ${
                    filterLocation === loc
                      ? "bg-editorial-primary text-[#FBF8F1] border-editorial-primary shadow-sm"
                      : "bg-white text-editorial-text hover:bg-editorial-secondary border-editorial-border"
                  }`}
                >
                  {loc}
                </button>
              ))}
            </div>
          ) : (
            <select
              value={filterLocation}
              onChange={e => setFilterLocation(e.target.value)}
              aria-label={t("catalog.filterRegion")}
              className="px-4 py-2.5 text-[10px] uppercase tracking-widest font-bold border border-editorial-border bg-white rounded-full focus:outline-none focus:ring-1 focus:ring-editorial-primary cursor-pointer"
            >
              <option value="all">{t("catalog.allRegions")}</option>
              {uniqueLocations.map((loc, idx) => (
                <option key={idx} value={loc}>{loc}</option>
              ))}
            </select>
          )}
        </div>

        {/* Search / price range / sort — o coração de uma plataforma de
            busca de hospedagem, faltava até então (só existia o filtro de
            bioma). */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-12 border-b border-editorial-border pb-6">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-editorial-muted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t("catalog.search")}
              aria-label={t("catalog.searchLabel")}
              className="w-full pl-9 pr-3 py-2.5 text-xs border border-editorial-border bg-white rounded-full focus:outline-none focus:ring-1 focus:ring-editorial-primary"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <input
              type="number" min={0} inputMode="numeric" placeholder={t("catalog.priceMin")}
              aria-label={t("catalog.priceMinLabel")}
              value={priceMin} onChange={e => setPriceMin(e.target.value)}
              className="w-24 px-3 py-2.5 border border-editorial-border bg-white rounded-full focus:outline-none focus:ring-1 focus:ring-editorial-primary"
            />
            <span className="text-editorial-muted">–</span>
            <input
              type="number" min={0} inputMode="numeric" placeholder={t("catalog.priceMax")}
              aria-label={t("catalog.priceMaxLabel")}
              value={priceMax} onChange={e => setPriceMax(e.target.value)}
              className="w-24 px-3 py-2.5 border border-editorial-border bg-white rounded-full focus:outline-none focus:ring-1 focus:ring-editorial-primary"
            />
          </div>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortOption)}
            aria-label={t("catalog.sortBy")}
            className="px-4 py-2.5 text-xs uppercase tracking-widest font-bold border border-editorial-border bg-white rounded-full focus:outline-none focus:ring-1 focus:ring-editorial-primary cursor-pointer"
          >
            <option value="relevance">{t("catalog.sort.relevance")}</option>
            <option value="price-asc">{t("catalog.sort.priceAsc")}</option>
            <option value="price-desc">{t("catalog.sort.priceDesc")}</option>
            <option value="rating-desc">{t("catalog.sort.rating")}</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => { setSearchQuery(""); setPriceMin(""); setPriceMax(""); setSortBy("relevance"); setFilterLocation("all"); }}
              className="text-editorial-muted hover:text-editorial-primary text-[10px] uppercase tracking-widest font-bold transition cursor-pointer whitespace-nowrap"
            >
              {t("catalog.clearFilters")}
            </button>
          )}
        </div>

        {/* Celular: 2 colunas com cartão compacto (foto, nome, local, preço);
            a partir do tablet, o cartão completo.
            Catalog Grid — skeleton só na primeira carga (nada na tela
            ainda); uma nova busca/filtro com resultado já visível só
            escurece um pouco em vez de trocar tudo por skeleton de novo. */}
        {catalogLoading && catalogItems.length === 0 ? (
          <SkeletonPousadaGrid />
        ) : (
        <div className={`grid grid-cols-2 gap-3 sm:gap-6 md:gap-8 transition-opacity duration-200 ${catalogLoading ? "opacity-50" : "opacity-100"}`}>
          {catalogItems.map((pousada) => (
            <div
              key={pousada.id}
              onClick={() => onSelectPousada(pousada)}
              className="bg-white border border-editorial-border overflow-hidden hover:shadow-sm transition duration-300 flex flex-col group h-full cursor-pointer"
            >
              {/* Image Container with Tag */}
              <div className="relative h-32 sm:h-48 md:h-64 overflow-hidden">
                <PictureImg
                  src={(pousada.images && pousada.images[0]) || "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=800&q=80"}
                  alt={pousada.name || "Pousada"}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-102 transition duration-500"
                />
                <div className="hidden sm:flex absolute top-4 left-4 bg-editorial-primary/95 text-[#FBF8F1] px-3 py-1 text-[9px] uppercase tracking-wider font-bold items-center gap-1 shadow-sm">
                  <MapPin className="h-3 w-3" /> {pousada.location || t("catalog.locationUnknown")}
                </div>
                <div className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-[#FBF8F1] text-editorial-text px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[9px] sm:text-[10px] font-bold flex items-center gap-1 shadow-sm border border-editorial-border">
                  {pousada.rating > 0 ? (
                    <><Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" /> {pousada.rating}</>
                  ) : (
                    <><Star className="h-3.5 w-3.5 text-editorial-muted" /> {t("common.new")}</>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-3 sm:p-6 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2 flex-wrap">
                    <h3 className="text-sm sm:text-xl md:text-2xl leading-tight font-serif text-editorial-primary group-hover:text-editorial-primary/80 transition font-bold">
                      {pousada.name || t("catalog.partnerFallback")}
                    </h3>
                    {pousada.verified && (
                      <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold uppercase tracking-wide px-1 sm:px-2 py-0.5 rounded-full" title={t("catalog.verifiedTitle")}>
                        <BadgeCheck className="h-3 w-3" /> <span className="hidden sm:inline">{t("common.verified")}</span>
                      </span>
                    )}
                  </div>
                  <p className="sm:hidden flex items-start gap-1 text-editorial-muted text-[10px] leading-snug mb-2 line-clamp-2">
                    <MapPin className="h-3 w-3 flex-shrink-0 mt-px" /> {pousada.location || t("catalog.locationUnknown")}
                  </p>
                  <p className="hidden sm:block text-editorial-muted text-xs leading-relaxed mb-4 line-clamp-2">
                    {pousada.description || t("catalog.noDescription")}
                  </p>
                  {!!pousada.viewCount && pousada.viewCount > 0 && (
                    <p className="hidden sm:flex items-center gap-1.5 text-editorial-muted text-[10px] font-semibold mb-4 -mt-2">
                      <Eye className="h-3 w-3" /> {t(pousada.viewCount === 1 ? "catalog.views.one" : "catalog.views.other", { n: pousada.viewCount })}
                    </p>
                  )}

                  {/* Key Features Tags */}
                  <div className="hidden sm:flex flex-wrap gap-1.5 mb-6">
                    {(pousada.features || []).slice(0, 3).map((f, i) => (
                      <span key={i} className="bg-editorial-secondary text-editorial-muted px-2 py-0.5 text-[9px] uppercase tracking-wider font-bold border border-editorial-border">
                        {f}
                      </span>
                    ))}
                    {pousada.features && pousada.features.length > 3 && (
                      <span className="text-editorial-muted text-[9px] px-1 py-0.5 font-bold uppercase tracking-wider">
                        {t("catalog.moreFeatures", { n: pousada.features.length - 3 })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer and CTA Actions */}
                <div className="border-t border-editorial-border pt-2 sm:pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 mt-auto">
                  <div>
                    <span className="block text-editorial-muted text-[9px] uppercase font-bold tracking-widest">{t("catalog.from")}</span>
                    <span className="text-base sm:text-xl font-serif font-bold text-editorial-primary">{formatMoney(pousada.pricePerNight)}</span>
                    <span className="text-editorial-muted text-[10px] sm:text-xs">{t("common.perNight")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button aria-label={t("catalog.videoCta")}
                      onClick={(e) => { e.stopPropagation(); onSelectVideo(pousada); }}
                      className="hidden sm:flex bg-editorial-beige hover:bg-editorial-border/60 text-editorial-primary p-2.5 rounded-none border border-editorial-border transition items-center gap-1 cursor-pointer"
                      title={t("catalog.videoCta")}
                    >
                      <PlayCircle className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelectPousada(pousada); }}
                      className="w-full sm:w-auto justify-center bg-editorial-primary hover:bg-editorial-primary/90 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-none text-[10px] sm:text-xs uppercase tracking-wider font-bold transition flex items-center gap-1 shadow-sm cursor-pointer"
                    >
                      {t("common.details")} <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}

        {/* Empty state — a freshly launched site (or a location filter with
            no matches yet) shouldn't just render a blank grid, which reads
            as broken rather than "nothing here yet". */}
        {!catalogLoading && catalogItems.length === 0 && (
          <div className="text-center py-20 border border-dashed border-editorial-border bg-white/40">
            <Compass className="h-8 w-8 text-editorial-muted mx-auto mb-3" />
            <p className="text-editorial-text font-serif text-lg font-bold mb-1">
              {pousadas.length === 0 ? t("catalog.empty.soonTitle") : t("catalog.empty.filterTitle")}
            </p>
            <p className="text-editorial-muted text-sm max-w-md mx-auto">
              {pousadas.length === 0 ? t("catalog.empty.soonText") : t("catalog.empty.filterText")}
            </p>
          </div>
        )}

        {/* Paginação — a grade é buscada/ordenada/paginada no servidor
            (GET /api/pousadas?page=), então "próxima página" é sempre uma
            nova requisição, não um corte de um array já carregado. */}
        {catalogTotalPages > 1 && (
          <div className="flex items-center justify-between gap-3 mt-8 pt-6 border-t border-editorial-border text-[11px] uppercase tracking-widest font-bold text-editorial-muted">
            <span>{t("catalog.pagination", { page: catalogPage, pages: catalogTotalPages, total: catalogTotal, unit: t(catalogTotal === 1 ? "catalog.unit.one" : "catalog.unit.other") })}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={catalogPage <= 1 || catalogLoading}
                onClick={() => { setCatalogPage(p => Math.max(1, p - 1)); document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                className="flex items-center gap-1 border border-editorial-border rounded-full px-4 py-2 hover:bg-editorial-secondary disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> {t("common.previous")}
              </button>
              <button
                type="button"
                disabled={catalogPage >= catalogTotalPages || catalogLoading}
                onClick={() => { setCatalogPage(p => Math.min(catalogTotalPages, p + 1)); document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                className="flex items-center gap-1 border border-editorial-border rounded-full px-4 py-2 hover:bg-editorial-secondary disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
              >
                {t("common.next")} <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>
      </ErrorBoundary>

      <ErrorBoundary variant="section" sectionLabel="os pacotes">
        <PacotesSection />
      </ErrorBoundary>

      {/* Atrações Parceiras & Nossos Guias — public discovery for the other
          two partner types in the ecossistema, each with its own profile
          page at /atracoes/:id and /guias/:id (see AtracaoDetailsView and
          GuiaDetailsView). Only rendered once there's something to show. */}
      {(atracoes.length > 0 || guiasPublicos.length > 0) && (
        <ErrorBoundary variant="section" sectionLabel="atrações e guias">
        <section className="max-w-7xl mx-auto px-6 py-16 border-t border-editorial-border space-y-16">
          {atracoes.length > 0 && (
            <div>
              <div className="text-center mb-10">
                <span className="text-editorial-primary text-[11px] uppercase tracking-[0.2em] font-bold">{t("catalog.ecosystem")}</span>
                <h2 className="text-3xl md:text-4xl font-serif font-bold text-editorial-text mt-2">{t("catalog.attractions.title")}</h2>
                <p className="text-editorial-muted text-sm mt-2 max-w-xl mx-auto">{t("catalog.attractions.subtitle")}</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                {atracoes.map(atracao => (
                  <div
                    key={atracao.id}
                    onClick={() => navigate(`/atracoes/${atracao.id}`)}
                    className="group bg-white border border-editorial-border overflow-hidden cursor-pointer hover:shadow-lg transition"
                  >
                    <div className="h-28 sm:h-44 bg-zinc-200 overflow-hidden relative">
                      {atracao.images[0] ? (
                        <img src={atracao.images[0]} alt={atracao.name} referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-editorial-muted"><UtensilsCrossed className="h-8 w-8" /></div>
                      )}
                      <span className="absolute top-3 left-3 bg-white/95 text-editorial-primary text-[9px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full">
                        {atracao.type === "restaurante" ? t("catalog.attraction.restaurant") : t("catalog.attraction.stop")}
                      </span>
                      {atracao.verified && (
                        <span className="absolute top-3 right-3 flex items-center gap-1 bg-emerald-500/90 text-white text-[9px] uppercase tracking-widest font-bold px-2 py-1 rounded-full"><BadgeCheck className="h-3 w-3" /></span>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-serif font-bold text-editorial-text group-hover:text-editorial-primary transition">{atracao.name}</h3>
                      <div className="flex items-center gap-3 mt-1.5 text-editorial-muted text-xs">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {atracao.location}</span>
                        {atracao.rating > 0 ? (
                          <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-500 text-amber-500" /> {atracao.rating}</span>
                        ) : (
                          <span className="flex items-center gap-1"><Star className="h-3 w-3" /> {t("common.new")}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {guiasPublicos.length > 0 && (
            <div>
              <div className="text-center mb-10">
                <span className="text-editorial-primary text-[11px] uppercase tracking-[0.2em] font-bold">{t("catalog.ecosystem")}</span>
                <h2 className="text-3xl md:text-4xl font-serif font-bold text-editorial-text mt-2">{t("catalog.guides.title")}</h2>
                <p className="text-editorial-muted text-sm mt-2 max-w-xl mx-auto">{t("catalog.guides.subtitle")}</p>
              </div>
              {/* flex-wrap + justify-center (not a plain grid) so an odd
                  leftover card on the last row centers itself instead of
                  sitting flush-left — justify-content applies per wrapped
                  line, so this works for any guide count without special-
                  casing odd/even. */}
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-6 sm:gap-6">
                {guiasPublicos.map(guia => (
                  <div
                    key={guia.id}
                    onClick={() => navigate(`/guias/${guia.id}`)}
                    className="group text-center cursor-pointer w-[calc(33.333%-11px)] sm:w-[calc(33.333%-16px)] lg:w-[calc(25%-18px)]"
                  >
                    <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-editorial-border mx-auto mb-3 bg-editorial-secondary flex items-center justify-center group-hover:border-editorial-primary transition">
                      {guia.photoUrl ? (
                        <img src={guia.photoUrl} alt={guia.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : (
                        <User className="h-8 w-8 text-editorial-muted" />
                      )}
                    </div>
                    {guia.languages && guia.languages.length > 0 && (
                      <div className="flex items-center justify-center gap-1 mb-1" title={guia.languages.map(l => l.language).join(", ")}>
                        {guia.languages.map((l, i) => <LanguageFlag key={i} language={l.language} className="w-5 h-3.5" />)}
                      </div>
                    )}
                    <h3 className="font-serif font-bold text-editorial-text text-sm group-hover:text-editorial-primary transition">{guia.name}</h3>
                    <p className="text-editorial-muted text-[11px] mt-0.5 flex items-center justify-center gap-1">
                      {guia.rating ? <><Star className="h-3 w-3 fill-amber-500 text-amber-500" /> {guia.rating}</> : <><Star className="h-3 w-3" /> {t("common.new")}</>}
                    </p>
                    {guia.bio && (
                      <p className="hidden sm:block text-editorial-muted text-[11px] mt-1 line-clamp-2 leading-snug">{guia.bio}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        </ErrorBoundary>
      )}

      {/* Wildlife Species Showcase (O que avistar) Section */}
      <ErrorBoundary variant="section" sectionLabel="a vitrine de espécies">
      <section className="arara-stripes bg-[#0A1133] text-[#FBF8F1] py-14 md:py-24 border-t border-editorial-border/10 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-editorial-primary/10 rounded-full blur-[150px] pointer-events-none"></div>

        <div className="relative max-w-7xl mx-auto px-6 z-10">
          
          {/* Section Header */}
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <span className="text-[10px] uppercase tracking-[0.3em] text-amber-500 font-bold mb-3 block">
              {t("species.kicker")}
            </span>
            <h2 className="text-3xl md:text-5xl font-serif font-bold text-white tracking-tight leading-tight">
              {t("species.title")}
            </h2>
            <p className="text-zinc-400 text-xs md:text-sm mt-4 font-light leading-relaxed max-w-2xl mx-auto">
              {t("species.subtitle")}
            </p>
          </div>

          {/* Carousel Viewport Wrapper */}
          <div className="relative group/carousel">
            
            {/* Left Button — sits in the gutter created by the scroll
                container's px-16 padding below, clear of card content at
                every breakpoint (it used to sit partly on top of the first/
                last card's text). */}
            <button
              onClick={scrollSpeciesLeft}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-11 h-11 md:w-12 md:h-12 rounded-full border border-amber-500/30 bg-[#0A1133]/85 hover:bg-amber-500 hover:text-[#0A1133] hover:border-amber-500 text-amber-500 hidden md:flex items-center justify-center transition-all duration-300 focus:outline-none backdrop-blur-sm shadow-lg cursor-pointer"
              aria-label={t("common.previous")}
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            {/* Right Button */}
            <button
              onClick={scrollSpeciesRight}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-11 h-11 md:w-12 md:h-12 rounded-full border border-amber-500/30 bg-[#0A1133]/85 hover:bg-amber-500 hover:text-[#0A1133] hover:border-amber-500 text-amber-500 hidden md:flex items-center justify-center transition-all duration-300 focus:outline-none backdrop-blur-sm shadow-lg cursor-pointer"
              aria-label={t("common.next")}
            >
              <ChevronRight className="h-6 w-6" />
            </button>

            {/* Horizontal Scroll container */}
            <div
              ref={speciesCarouselRef}
              className="flex gap-3 md:gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-6 md:pb-8 -mx-6 px-6 md:mx-0 md:px-16"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {displaySpecies.map((specie) => (
                <div
                  key={specie.id}
                  className="bg-[#1A201C]/90 border border-white/5 w-[46%] min-w-[150px] sm:w-[290px] md:w-[350px] flex-shrink-0 flex flex-col justify-between snap-start hover:border-amber-500/25 transition-all duration-500 group rounded-none"
                >
                  {/* Image container */}
                  <div className="relative h-32 sm:h-60 md:h-64 overflow-hidden">
                    <PictureImg
                      src={specie.image}
                      alt={specie.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-700"
                    />
                  </div>

                  {/* Body Content */}
                  <div className="p-3 sm:p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <span className="text-amber-500 text-[8px] sm:text-[9px] uppercase tracking-[0.15em] sm:tracking-[0.2em] font-bold mb-1 sm:mb-2 block">
                        {specie.category}
                      </span>
                      <h3 className="text-base sm:text-xl md:text-2xl leading-tight font-serif font-bold text-white mb-1.5 sm:mb-3">
                        {specie.name}
                      </h3>
                      <p className="text-zinc-300/85 text-[11px] sm:text-xs leading-snug sm:leading-relaxed font-light line-clamp-3 mb-2 sm:mb-4">
                        {specie.description}
                      </p>
                    </div>

                    <div>
                      <hr className="border-white/10 my-2 sm:my-4" />
                      
                      {/* Card Footer info */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">
                        <span className="text-zinc-400">
                          {specie.sightings}
                        </span>
                        <button
                          onClick={() => setSelectedSpecies(specie)}
                          className="text-amber-500 hover:text-amber-400 transition flex items-center gap-1 cursor-pointer font-bold uppercase tracking-wider"
                        >
                          {t("species.cta")} <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>

        </div>
      </section>
      </ErrorBoundary>

      <ErrorBoundary variant="section" sectionLabel="o calendário de melhor época">
        <SeasonCalendarSection
          species={[...displaySpecies, ...extraCalendarRows]}
          onOpenSpecies={id => setSelectedSpecies(displaySpecies.find(s => s.id === id) || null)}
        />
      </ErrorBoundary>

      <ErrorBoundary variant="section" sectionLabel="o mapa">
        <section id="mapa" className="bg-white py-20 border-t border-editorial-border scroll-mt-10">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-10">
              <span className="text-[10px] uppercase tracking-[0.3em] text-editorial-primary font-bold">{t("map.kicker")}</span>
              <h2 className="text-3xl md:text-4xl font-serif font-bold text-editorial-primary mt-1 tracking-tight">{t("map.title")}</h2>
              <p className="text-editorial-muted text-xs mt-2">{t("map.subtitle")}</p>
            </div>
            <Suspense fallback={<div className="h-[520px] flex items-center justify-center border border-editorial-border text-editorial-muted text-xs">{t("map.loading")}</div>}>
              <PantanalMap pousadas={completePousadas} atracoes={atracoes} species={displaySpecies} onSelectPousada={onSelectPousada} sightingPoints={mapPoints} />
            </Suspense>
          </div>
        </section>
      </ErrorBoundary>

      {/* App Promotion & Interactive Simulator Section */}
      <section className="bg-gradient-to-br from-[#0e120f] via-[#161d18] to-[#0e120f] text-white py-14 md:py-20 border-t border-white/5 relative overflow-hidden">
        {/* Background ambient light */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full filter blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/5 rounded-full filter blur-[120px] pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
          
          {/* Left Column: Advertising Copy */}
          <div className="lg:col-span-7 flex flex-col justify-center text-left">
            <h2 className="text-3xl md:text-5xl font-serif font-bold tracking-tight mb-6 text-balance text-white">
              {t("promo.title")} <br className="hidden md:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-amber-400 to-emerald-400">
                EcoSafari Go
              </span>
            </h2>
            <p className="text-zinc-300 text-xs md:text-sm leading-relaxed mb-8 font-light max-w-xl">
              {t("promo.text")}
            </p>

            {/* Feature list */}
            <div className="grid grid-cols-3 gap-2 sm:gap-6 mb-8 sm:mb-10 max-w-2xl">
              <div className="bg-[#1A201C]/60 border border-white/5 p-2.5 sm:p-4 rounded-none">
                <span className="text-base sm:text-lg mb-1 sm:mb-2 block">📸</span>
                <h4 className="font-serif font-semibold text-white text-[11px] sm:text-xs leading-tight mb-1">{t("promo.feed.title")}</h4>
                <p className="text-zinc-400 text-[9px] sm:text-[10px] leading-snug sm:leading-relaxed">
                  {t("promo.feed.text")}
                </p>
              </div>
              <div className="bg-[#1A201C]/60 border border-white/5 p-2.5 sm:p-4 rounded-none">
                <span className="text-base sm:text-lg mb-1 sm:mb-2 block">🛰️</span>
                <h4 className="font-serif font-semibold text-white text-[11px] sm:text-xs leading-tight mb-1">{t("promo.checkin.title")}</h4>
                <p className="text-zinc-400 text-[9px] sm:text-[10px] leading-snug sm:leading-relaxed">
                  {t("promo.checkin.text")}
                </p>
              </div>
              <div className="bg-[#1A201C]/60 border border-white/5 p-2.5 sm:p-4 rounded-none">
                <span className="text-base sm:text-lg mb-1 sm:mb-2 block">🚨</span>
                <h4 className="font-serif font-semibold text-white text-[11px] sm:text-xs leading-tight mb-1">{t("promo.alerts.title")}</h4>
                <p className="text-zinc-400 text-[9px] sm:text-[10px] leading-snug sm:leading-relaxed">
                  {t("promo.alerts.text")}
                </p>
              </div>
            </div>

            {/* App Store / Google Play Badges & Action */}
            <div className="flex flex-wrap items-center gap-4">
              <a 
                href="#download-ios"
                onClick={(e) => {
                  e.preventDefault();
                  showToast(t("promo.iosToast"), "info");
                }}
                className="flex items-center gap-3 bg-black hover:bg-zinc-900 border border-white/10 px-5 py-2.5 rounded-xl transition shadow-lg group shrink-0"
              >
                <svg viewBox="0 0 384 512" className="h-6 w-6 fill-white flex-shrink-0" aria-hidden="true">
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                </svg>
                <div className="text-left">
                  <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest block leading-none">Download on the</span>
                  <span className="text-xs text-white font-bold block mt-0.5">App Store</span>
                </div>
              </a>

              <a 
                href="#download-android"
                onClick={(e) => {
                  e.preventDefault();
                  showToast(t("promo.androidToast"), "info");
                }}
                className="flex items-center gap-3 bg-black hover:bg-zinc-900 border border-white/10 px-5 py-2.5 rounded-xl transition shadow-lg group shrink-0"
              >
                <svg viewBox="0 0 512 512" className="h-6 w-6 flex-shrink-0" aria-hidden="true">
                  <path fill="#00D4FF" d="M39 5C34 8 30 13 30 20v472c0 7 4 12 9 15l236-256z"/>
                  <path fill="#00F076" d="M39 5l236 251L39 507c-3-2-6-5-8-8l228-243L31 13c2-3 5-6 8-8z"/>
                  <path fill="#FFBC00" d="M275 233l72-40c11-6 17-16 17-27s-6-21-17-27l-72-40-78 67z"/>
                  <path fill="#FF3A44" d="M275 233l-78 67 150-87-72-40z"/>
                </svg>
                <div className="text-left">
                  <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest block leading-none">Get it on</span>
                  <span className="text-xs text-white font-bold block mt-0.5">Google Play</span>
                </div>
              </a>
            </div>
          </div>

          {/* Right Column: Live Interactive Smartphone Mockup */}
          <div className="lg:col-span-5 flex justify-center relative">
            {/* Background glowing aura */}
            <div className="absolute inset-0 bg-emerald-500/10 rounded-full filter blur-[80px] pointer-events-none scale-75"></div>

            <div className="relative mx-auto w-[280px] h-[560px] sm:w-[320px] sm:h-[640px] bg-black border-[10px] border-zinc-800 rounded-[40px] shadow-2xl overflow-hidden flex flex-col shrink-0 ring-1 ring-zinc-700/40 transform lg:rotate-2 hover:rotate-0 transition-all duration-500">
              {/* Notch */}
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 h-4 w-28 bg-zinc-800 rounded-b-lg z-30 flex justify-center items-center">
                <div className="w-10 h-0.5 bg-zinc-900 rounded-full mb-1"></div>
              </div>

              {/* Status Bar */}
              <div className="h-8 bg-zinc-950 text-[9px] font-bold px-5 pt-1.5 flex justify-between items-center z-20 shrink-0 text-white select-none font-sans">
                <span>15:14</span>
                <div className="flex items-center gap-1.5 text-[8px]">
                  <span>📶</span>
                  <span>4G</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Smartphone Inner Live Content */}
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div></div>}>
                <MobileSimulator
                  sightings={sightings}
                  pousadas={pousadas}
                  bookings={bookings}
                  onAddSighting={onAddSighting}
                  onRefreshData={onRefreshData}
                  standalone={true}
                />
              </Suspense>
            </div>

            {/* Float badge */}
            <div className="absolute -bottom-4 bg-emerald-500 text-black text-[9px] font-bold uppercase tracking-widest px-4 py-1.5 shadow-xl rotate-1">
              {t("promo.badge")}
            </div>
          </div>

        </div>
      </section>

      {/* Species Detail Modal */}
      {selectedSpecies && (
        <div role="dialog" aria-modal="true" aria-label={selectedSpecies.name} className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 md:p-6 z-50 animate-fadeIn">
          <div className="bg-[#0A1133] text-[#FBF8F1] border border-white/10 w-full max-w-4xl max-h-[90vh] md:max-h-[85vh] overflow-y-auto flex flex-col md:flex-row relative">
            
            {/* Close Button */}
            <button
              onClick={() => setSelectedSpecies(null)}
              className="absolute top-4 right-4 z-30 bg-black/60 hover:bg-amber-500 hover:text-[#0A1133] border border-white/10 text-[#FBF8F1] p-2 rounded-full transition cursor-pointer"
              aria-label={t("common.close")}
            >
              <X className="h-5 w-5" />
            </button>

            {/* Left: Image Side */}
            <div className="w-full md:w-1/2 relative h-64 md:h-auto min-h-[300px]">
              <PictureImg
                src={selectedSpecies.image}
                alt={selectedSpecies.name}
                referrerPolicy="no-referrer"
                loading="eager"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
              
              {/* Overlay names */}
              <div className="absolute bottom-6 left-6 right-6">
                <span className="text-amber-500 text-[10px] uppercase tracking-[0.2em] font-bold block mb-1">
                  {selectedSpecies.category}
                </span>
                <h3 className="text-3xl md:text-4xl font-serif font-bold text-white mb-2 leading-none">
                  {selectedSpecies.name}
                </h3>
                <span className="text-zinc-300 font-mono text-xs italic block">
                  {selectedSpecies.scientificName}
                </span>
              </div>
            </div>

            {/* Right: Content Side */}
            <div className="w-full md:w-1/2 p-6 md:p-10 flex flex-col justify-between">
              <div>
                <span className="text-emerald-500 text-[9px] uppercase tracking-[0.2em] font-bold block mb-2">
                  ✓ {selectedSpecies.sightings}
                </span>
                
                <h4 className="text-xs uppercase font-bold tracking-widest text-zinc-400 mb-2">
                  {t("species.naturalHistory")}
                </h4>
                <p className="text-zinc-300 text-xs md:text-sm leading-relaxed font-light mb-6">
                  {selectedSpecies.details}
                </p>

                {selectedSpecies.season && (
                  <div className="mb-6">
                    <SpeciesSeasonCalendar season={selectedSpecies.season} pousadaId={selectedSpecies.bestPousadaId} variant="dark" monthlyCounts={selectedSpecies.monthlyCounts} fromApp={selectedSpecies.seasonFromApp} />
                  </div>
                )}

                {/* Best Lodge Card */}
                <div className="bg-[#1A201C] border border-white/5 p-4 rounded-none mb-6">
                  <span className="text-amber-500 text-[9px] font-bold uppercase tracking-widest block mb-1">
                    {t("species.whereToSee")}
                  </span>
                  <div className="flex justify-between items-center">
                    <div>
                      <h5 className="font-serif text-base font-semibold text-white">
                        {selectedSpecies.bestPousadaName}
                      </h5>
                      <span className="text-xs text-zinc-400">
                        {t("species.bestLodgeNote")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-white/10">
                <button
                  onClick={() => {
                    const matchedP = pousadas.find(p => String(p.id) === String(selectedSpecies.bestPousadaId)) || pousadas[0];
                    if (matchedP) {
                      onSelectPousada(matchedP);
                      setSelectedSpecies(null);
                    }
                  }}
                  className="flex-1 bg-white hover:bg-amber-500 hover:text-[#0A1133] text-[#0A1133] font-bold uppercase tracking-widest text-xs py-3.5 px-4 transition-all duration-300 text-center cursor-pointer"
                >
                  {t("species.visitLodge")}
                </button>
                <button
                  onClick={() => {
                    const matchedP = pousadas.find(p => String(p.id) === String(selectedSpecies.bestPousadaId)) || pousadas[0];
                    if (matchedP) {
                      onOpenBotWithPousada(matchedP);
                    }
                    setSelectedSpecies(null);
                  }}
                  className="flex-1 bg-transparent hover:bg-white/5 border border-white/20 text-[#FBF8F1] font-bold uppercase tracking-widest text-xs py-3.5 px-4 transition text-center cursor-pointer"
                >
                  {t("species.requestGuide")}
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* Reviews Section */}
      <ErrorBoundary variant="section" sectionLabel="as avaliações">
      <section id="avaliacoes" className="bg-editorial-primary text-white py-14 md:py-20 border-t border-editorial-border scroll-mt-10">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Write a review column */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            <span className="text-[#F6EEDC] font-bold uppercase text-[9px] tracking-[0.3em] mb-2 inline-block">{t("reviews.kicker")}</span>
            <h2 className="text-3xl md:text-4xl font-serif font-bold tracking-tight mb-4 text-balance">{t("reviews.title")}</h2>
            <p className="text-[#F6EEDC]/80 text-xs leading-relaxed mb-6 font-light">
              {t("reviews.text")}
            </p>

            {/* Avaliar exige perfil de turista — sem ele, mostramos um
                convite pra criar um em vez do formulário. */}
            {checkingTourist ? (
              <div className="bg-white p-6 flex justify-center border border-editorial-border">
                <LoaderCircle className="h-5 w-5 text-editorial-primary animate-spin" />
              </div>
            ) : !isTourist ? (
              <div className="bg-white text-editorial-text p-6 rounded-none shadow-sm border border-editorial-border text-center space-y-3">
                <Lock className="h-6 w-6 text-editorial-muted mx-auto" />
                <h3 className="font-serif font-bold text-editorial-primary text-lg">{t("reviews.createTitle")}</h3>
                <p className="text-editorial-muted text-xs leading-relaxed">{t("reviews.createText")}</p>
                <button
                  type="button"
                  onClick={() => navigate("/turista")}
                  className="w-full bg-editorial-primary hover:bg-editorial-primary/90 text-white text-[11px] font-bold uppercase tracking-widest py-3 rounded-none transition duration-200 cursor-pointer"
                >
                  {t("reviews.createCta")}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitReview} className="bg-white text-editorial-text p-6 rounded-none shadow-sm border border-editorial-border space-y-4">
                {reviewSuccess && (
                  <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 p-3 rounded-none text-xs text-center font-bold">
                    {t("reviews.success")}
                  </div>
                )}
                {touristProfile && (
                  <p className="text-editorial-muted text-[11px]">{t("reviews.as")} <span className="font-semibold text-editorial-text">{touristProfile.name}</span></p>
                )}

                <div>
                  <label htmlFor="review-pousada" className="block text-editorial-primary text-[10px] uppercase tracking-wider font-bold mb-1">{t("reviews.whichLodge")}</label>
                  <select
                    id="review-pousada"
                    value={selectedPousadaForReview}
                    onChange={e => setSelectedPousadaForReview(e.target.value)}
                    className="w-full bg-editorial-secondary text-editorial-text text-xs border border-editorial-border rounded-none p-2 focus:outline-none focus:border-editorial-primary"
                  >
                    {pousadas.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <span id="review-rating-label" className="block text-editorial-primary text-[10px] uppercase tracking-wider font-bold mb-1">{t("reviews.yourRating")}</span>
                  <div className="flex items-center gap-1 mt-1" role="radiogroup" aria-labelledby="review-rating-label">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button aria-label={t("reviews.ratingLabel", { n: star })} role="radio" aria-checked={ratingInput === star}
                        type="button"
                        key={star}
                        onClick={() => setRatingInput(star)}
                        className="p-1 focus:outline-none"
                      >
                        <Star className={`h-4.5 w-4.5 ${star <= ratingInput ? "text-amber-500 fill-amber-500" : "text-[#E5E2D9]"}`} />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="review-comment" className="block text-editorial-primary text-[10px] uppercase tracking-wider font-bold mb-1">{t("reviews.yourReview")}</label>
                  <textarea
                    id="review-comment"
                    value={commentInput}
                    onChange={e => setCommentInput(e.target.value)}
                    required
                    rows={3}
                    placeholder={t("reviews.placeholder")}
                    className="w-full bg-editorial-secondary text-editorial-text text-xs border border-editorial-border rounded-none p-2 focus:outline-none focus:border-editorial-primary resize-none"
                  ></textarea>
                </div>

                <div>
                  <label htmlFor="review-photo" className="block text-editorial-primary text-[10px] uppercase tracking-wider font-bold mb-1">{t("reviews.photoLabel")}</label>
                  <input
                    id="review-photo"
                    type="url"
                    value={photoUrlInput}
                    onChange={e => setPhotoUrlInput(e.target.value)}
                    placeholder={t("reviews.photoPlaceholder")}
                    className="w-full bg-editorial-secondary text-editorial-text text-xs border border-editorial-border rounded-none p-2 focus:outline-none focus:border-editorial-primary"
                  />
                  <p className="text-editorial-muted text-[9px] mt-1">{t("reviews.photoHint")}</p>
                </div>

                {reviewError && <p className="text-red-600 text-xs font-medium">{reviewError}</p>}

                <button
                  type="submit"
                  className="w-full bg-editorial-primary hover:bg-editorial-primary/90 text-white text-[11px] font-bold uppercase tracking-widest py-3 rounded-none transition duration-200 cursor-pointer"
                  disabled={submittingReview}
                >
                  {submittingReview ? t("reviews.sending") : t("reviews.submit")}
                </button>
              </form>
            )}
          </div>

          {/* List of reviews column */}
          <div className="lg:col-span-7 flex lg:block gap-3 overflow-x-auto snap-x snap-mandatory -mx-6 px-6 pb-2 lg:mx-0 lg:px-0 lg:pb-0 lg:space-y-6 lg:max-h-[600px] lg:overflow-x-visible lg:overflow-y-auto lg:pr-4 scrollbar-thin">
            {reviews.length === 0 && (
              <div className="w-full text-center py-16 border border-dashed border-editorial-border">
                <Star className="h-7 w-7 text-editorial-muted mx-auto mb-3" />
                <p className="text-editorial-text font-serif font-bold mb-1">{t("reviews.emptyTitle")}</p>
                <p className="text-editorial-muted text-xs max-w-xs mx-auto">{t("reviews.emptyText")}</p>
              </div>
            )}
            {reviews.map((review) => {
              // Cada avaliação é de exatamente um alvo (pousada, atração ou
              // guia) — resolve qual é e pra onde a avaliação "pertence",
              // pra nunca mostrar um comentário sem dizer quem está sendo
              // avaliado nem misturar avaliações de gente diferente sem rótulo.
              const matchedP = review.pousadaId ? pousadas.find(p => p.id === review.pousadaId) : undefined;
              const matchedA = review.atracaoId ? atracoes.find(a => a.id === review.atracaoId) : undefined;
              const matchedG = review.guideId ? guiasPublicos.find(g => g.id === review.guideId) : undefined;

              const targetLabel = matchedP ? t("reviews.target.pousada", { name: matchedP.name }) : matchedA ? t("reviews.target.atracao", { name: matchedA.name }) : matchedG ? t("reviews.target.guia", { name: matchedG.name }) : null;
              const handleOpenTarget = () => {
                if (matchedP) onSelectPousada(matchedP);
                else if (matchedA) navigate(`/atracoes/${matchedA.id}`);
                else if (matchedG) navigate(`/guias/${matchedG.id}`);
              };

              return (
                <div key={review.id} className="bg-white text-editorial-text border border-editorial-border p-4 sm:p-6 rounded-none shadow-sm transition min-w-[85%] sm:min-w-[60%] lg:min-w-0 snap-start flex-shrink-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 border-b border-editorial-border pb-3">
                    <div className="flex items-center gap-3">
                      {review.photoUrl ? (
                        <img
                          src={review.photoUrl}
                          alt={review.userName}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full object-cover border border-editorial-border flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-editorial-secondary border border-editorial-border flex items-center justify-center text-editorial-primary font-serif font-bold text-sm flex-shrink-0">
                          {review.userName?.charAt(0).toUpperCase() || "?"}
                        </div>
                      )}
                      <div>
                        <h4 className="font-serif text-base font-semibold text-editorial-primary">{review.userName}</h4>
                        {targetLabel && (
                          <button
                            onClick={handleOpenTarget}
                            className="text-[9px] text-editorial-muted hover:text-editorial-primary font-bold uppercase tracking-widest mt-0.5 block transition cursor-pointer"
                            title={t("reviews.viewProfile")}
                          >
                            {t("reviews.reviewed", { target: targetLabel })}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`h-4 w-4 ${i < review.rating ? "text-amber-500 fill-amber-500" : "text-[#E5E2D9]"}`} />
                      ))}
                    </div>
                  </div>
                  <p className="text-editorial-muted text-xs leading-relaxed italic font-serif">
                    "{review.comment}"
                  </p>
                  <span className="text-editorial-muted text-[9px] font-mono block mt-4 text-right">{review.date}</span>
                </div>
              );
            })}
          </div>

        </div>
      </section>
      </ErrorBoundary>

      {/* FAQ Section */}
      <section id="faq" className="bg-white py-20 border-t border-editorial-border">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="text-[10px] uppercase tracking-[0.3em] text-editorial-primary font-bold">{t("faq.kicker")}</span>
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-editorial-primary mt-1 tracking-tight">{t("faq.title")}</h2>
            <p className="text-editorial-muted text-xs mt-2">{t("faq.subtitle")}</p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div key={index} className="border-b border-editorial-border pb-4">
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-answer-${index}`}
                    className="w-full flex justify-between items-center text-left py-4 focus:outline-none group cursor-pointer"
                  >
                    <span className="font-serif font-bold text-base md:text-lg text-editorial-primary group-hover:text-editorial-primary/80 transition duration-150">
                      {faq.question}
                    </span>
                    <span className="text-editorial-primary font-bold text-lg ml-4">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  <div
                    id={`faq-answer-${index}`}
                    hidden={!isOpen}
                    className={`overflow-hidden transition-all duration-300 ${
                      isOpen ? "max-h-[500px] opacity-100 mt-2" : "max-h-0 opacity-0"
                    }`}
                  >
                    <p className="text-editorial-muted text-xs md:text-sm leading-relaxed font-light whitespace-pre-line pb-2">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

    </div>
  );
}
