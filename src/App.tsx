import React, { useState, useEffect, Suspense, lazy } from "react";
import { Compass, ShieldAlert, Monitor, CheckCircle, Smartphone, HelpCircle, Mail, MessageSquare, Instagram, LogOut, User, Menu, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import PousadaCatalog from "./components/PousadaCatalog";
import PousadaDetailsView from "./components/PousadaDetailsView";
import VideoPlayerView from "./components/VideoPlayerView";
import WhatsAppChatbot from "./components/WhatsAppChatbot";
import WhatsAppGateView from "./components/WhatsAppGateView";
import PousadaOfficialSite from "./components/PousadaOfficialSite";
import AtracaoDetailsView from "./components/AtracaoDetailsView";
import GuiaDetailsView from "./components/GuiaDetailsView";
import LanguageSwitcher from "./components/LanguageSwitcher";
import CookieConsentBanner from "./components/CookieConsentBanner";
import TouristProfileWidget from "./components/TouristProfileWidget";
import ErrorBoundary from "./components/ErrorBoundary";
import { getSupabaseClient } from "./lib/supabaseClient";
import { isAdminUser, isTouristUser, isPartnerUser } from "./lib/authRoles";
import { useRoute, navigate } from "./lib/router";
import { Pousada, Sighting, Review, Species, PublicBookingSummary } from "./types";

// Code-split: AdminDashboard (~2000 lines) is dead weight in the bundle for
// the ~99% of visitors who never touch /admin, and MobileSimulator is a
// sizeable embedded widget too. React.lazy() puts each in its own chunk,
// fetched only when actually rendered, instead of shipping in the single
// main bundle every visitor downloads today.
const AdminDashboard = lazy(() => import("./components/AdminDashboard"));
const MobileSimulator = lazy(() => import("./components/MobileSimulator"));

// Same reasoning for the standalone institutional/utility pages below — a
// given visitor only ever lands on one of these at a time (if any), so there
// is no reason to ship all seven in the main bundle up front.
const PartnerSignupPage = lazy(() => import("./components/PartnerSignupPage"));
const AboutPage = lazy(() => import("./components/AboutPage"));
const PrivacyPolicyPage = lazy(() => import("./components/PrivacyPolicyPage"));
const TermsPage = lazy(() => import("./components/TermsPage"));
const FaqPage = lazy(() => import("./components/FaqPage"));
const CandidateStatusPage = lazy(() => import("./components/CandidateStatusPage"));
const PaymentConfirmationPage = lazy(() => import("./components/PaymentConfirmationPage"));
const PartnerPortalPage = lazy(() => import("./components/PartnerPortalPage"));
const PartnerOAuthConsentPage = lazy(() => import("./components/PartnerOAuthConsentPage"));
const TuristaAuthPage = lazy(() => import("./components/TuristaAuthPage"));
const AuthPage = lazy(() => import("./components/AuthPage"));

function LazyFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-editorial-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

// Institutional identity for the footer (CNPJ/address) — required for a
// public booking/payment site to look legitimate and for LGPD's
// data-controller disclosure. Configurable via env var instead of hardcoded
// in source, so filling in the real values on launch is a Vercel dashboard
// change, not a code change/redeploy for a developer to make.
const COMPANY_CNPJ = (import.meta.env.VITE_COMPANY_CNPJ as string | undefined) || "00.000.000/0001-00 (definir antes do lançamento)";
const COMPANY_ADDRESS = (import.meta.env.VITE_COMPANY_ADDRESS as string | undefined) || "Endereço a definir — Cidade/UF";

// Standalone public routes that render their own full page (no shared header/footer chrome).
const STANDALONE_ROUTES: Record<string, React.ComponentType> = {
  "/seja-parceiro": PartnerSignupPage,
  "/sobre": AboutPage,
  "/privacidade": PrivacyPolicyPage,
  "/termos": TermsPage,
  "/faq": FaqPage,
  "/status-candidatura": CandidateStatusPage,
  "/pagamento-confirmado": PaymentConfirmationPage,
  "/parceiro": PartnerPortalPage,
  // Matches the Supabase OAuth Server config exactly: Site URL =
  // .../parceiro, Authorization Path = /oauth/consent.
  "/parceiro/oauth/consent": PartnerOAuthConsentPage,
  "/turista": TuristaAuthPage,
};

export default function App() {
  const path = useRoute();
  const [currentModule, setCurrentModule] = useState<"portal" | "admin">("portal");
  const [isMobileNative, setIsMobileNative] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const StandalonePage = STANDALONE_ROUTES[path];
  const pousadaRouteMatch = path.match(/^\/pousadas\/(.+)$/);
  const officialSiteMatch = path.match(/^\/site\/(.+)$/);
  const atracaoRouteMatch = path.match(/^\/atracoes\/(.+)$/);
  const guiaRouteMatch = path.match(/^\/guias\/(.+)$/);

  // Supabase Auth: the "Gestão" tab is only shown to authenticated users whose
  // account has app_metadata.isAdmin === true (concedido via a votação dos 3
  // admins-chefe — ver ADMIN GOVERNANCE em server.ts). Convive com qualquer
  // outro papel que a mesma conta já tenha (turista, parceiro).
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Usados só pra decidir o que o cabeçalho mostra no lugar do antigo
  // cadeado/"Portal do Parceiro": turista já tem seu próprio widget de
  // avatar (TouristProfileWidget), então aqui só precisamos saber se existe
  // uma sessão de parceiro pra oferecer "Meu Painel" em vez de "Entrar".
  const [isTouristSession, setIsTouristSession] = useState(false);
  const [isPartnerSession, setIsPartnerSession] = useState(false);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;

    getSupabaseClient().then((client) => {
      setSupabase(client);

      client.auth.getSession().then(({ data }) => {
        setIsAdmin(isAdminUser(data.session?.user));
        setIsTouristSession(isTouristUser(data.session?.user));
        setIsPartnerSession(isPartnerUser(data.session?.user));
      });

      const { data } = client.auth.onAuthStateChange((_event, newSession) => {
        setIsAdmin(isAdminUser(newSession?.user));
        setIsTouristSession(isTouristUser(newSession?.user));
        setIsPartnerSession(isPartnerUser(newSession?.user));
      });
      subscription = data.subscription;
    });

    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    // If admin access is revoked/logged out while viewing Gestão, bounce back to the Portal.
    if (currentModule === "admin" && !isAdmin) {
      setCurrentModule("portal");
    }
  }, [isAdmin, currentModule]);

  const handleAdminLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setCurrentModule("portal");
  };
  
  useEffect(() => {
    // Detect Capacitor environment, user agent, or query/hash tags
    const isCap = (window as any).Capacitor !== undefined || 
                  navigator.userAgent.includes("Capacitor") ||
                  window.location.search.includes("platform=mobile") ||
                  window.location.hash.includes("mobile") ||
                  window.location.pathname.startsWith("/mobile");
    if (isCap) {
      setIsMobileNative(true);
    }
  }, []);
  
  // Inside the Portal module we can have four views: "catalog", "details", "video", "whatsapp-gate"
  const [portalView, setPortalView] = useState<"catalog" | "details" | "video" | "whatsapp-gate">("catalog");
  const [selectedPousada, setSelectedPousada] = useState<Pousada | null>(null);

  // States fetched from Full-Stack Express Backend
  const [pousadas, setPousadas] = useState<Pousada[]>([]);
  const [confirmedBookings, setConfirmedBookings] = useState<PublicBookingSummary[]>([]);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [species, setSpecies] = useState<Species[]>([]);
  const [loading, setLoading] = useState(true);

  // Load and refresh state function. Notifications, full booking records
  // (with customer name/email/phone) and guides (with personal email/phone)
  // are NOT fetched here — those are admin-only, fetched separately with
  // auth inside AdminDashboard. The mobile check-in demo only gets a
  // PII-free booking summary.
  const fetchData = async () => {
    try {
      const [pRes, bRes, sRes, rRes, spRes] = await Promise.all([
        fetch("/api/pousadas"),
        fetch("/api/bookings/public-confirmed"),
        fetch("/api/sightings"),
        fetch("/api/reviews"),
        fetch("/api/species")
      ]);

      const [pData, bData, sData, rData, spData] = await Promise.all([
        pRes.json(),
        bRes.json(),
        sRes.json(),
        rRes.json(),
        spRes.json()
      ]);

      setPousadas(pData);
      setConfirmedBookings(bData);
      setSightings(sData);
      setReviews(rData);
      setSpecies(spData);
    } catch (err) {
      console.error("Erro ao carregar dados do servidor Express:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Standalone info/partner pages are self-contained and don't need the portal's data.
    if (StandalonePage || officialSiteMatch || atracaoRouteMatch || guiaRouteMatch) return;
    fetchData();
    // Refreshes the public catalog periodically so new pousadas/reviews/
    // sightings show up without a manual reload. This runs in every visitor's
    // browser, not just the admin's, so it was previously polling 5 endpoints
    // every 6 seconds for the entire audience — a much longer interval plus
    // skipping the fetch while the tab is in the background keeps the site
    // reactive without hammering the backend as traffic grows.
    const interval = setInterval(() => {
      if (!document.hidden) fetchData();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Deep-link support: visiting /pousadas/:id directly opens that pousada's
  // details once the catalog has loaded, so the URL is shareable.
  useEffect(() => {
    if (!pousadaRouteMatch || pousadas.length === 0) return;
    const found = pousadas.find(p => p.id === pousadaRouteMatch[1]);
    if (found) {
      setSelectedPousada(found);
      setPortalView("details");
      setCurrentModule("portal");
    }
  }, [path, pousadas]);

  // Deep-link support: visiting /fale-conosco directly opens the WhatsApp gate.
  useEffect(() => {
    if (path === "/fale-conosco") {
      setPortalView("whatsapp-gate");
      setCurrentModule("portal");
    }
  }, [path]);

  const handleSelectPousada = (pousada: Pousada) => {
    setSelectedPousada(pousada);
    setPortalView("details");
    navigate(`/pousadas/${pousada.id}`);
  };

  const handleSelectVideo = (pousada: Pousada) => {
    setSelectedPousada(pousada);
    setPortalView("video");
  };

  // Opens the dedicated video-gate screen (its own URL) that hands off to the
  // real agency WhatsApp once the clip finishes.
  const openWhatsAppGate = (pousada?: Pousada) => {
    if (pousada) setSelectedPousada(pousada);
    setPortalView("whatsapp-gate");
    navigate("/fale-conosco");
  };

  const handleOpenBotWithPousada = (pousada: Pousada) => {
    openWhatsAppGate(pousada);
  };

  if (StandalonePage) {
    return (
      <Suspense fallback={<LazyFallback />}>
        <StandalonePage />
      </Suspense>
    );
  }

  if (officialSiteMatch) {
    return <PousadaOfficialSite slug={officialSiteMatch[1]} />;
  }

  if (atracaoRouteMatch) {
    return <AtracaoDetailsView id={atracaoRouteMatch[1]} />;
  }

  if (guiaRouteMatch) {
    return <GuiaDetailsView id={guiaRouteMatch[1]} />;
  }

  // /entrar precisa ficar fora de STANDALONE_ROUTES (que só suporta
  // componentes sem props) porque o login de Gestão bem-sucedido precisa
  // chamar de volta pro setCurrentModule/navigate daqui.
  if (path === "/entrar") {
    return (
      <Suspense fallback={<LazyFallback />}>
        <AuthPage
          onAdminAuthenticated={() => {
            setCurrentModule("admin");
            navigate("/");
          }}
        />
      </Suspense>
    );
  }

  if (isMobileNative) {
    if (loading) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-zinc-950 text-white">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-zinc-400 text-xs uppercase tracking-widest font-bold animate-pulse">Carregando EcoSafari Go...</p>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans select-none">
        <Suspense fallback={<LazyFallback />}>
          <MobileSimulator
            sightings={sightings}
            pousadas={pousadas}
            bookings={confirmedBookings}
            onAddSighting={(newS) => {
              setSightings(prev => [newS, ...prev]);
            }}
            onRefreshData={fetchData}
            standalone={true}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-editorial-bg flex flex-col font-sans text-editorial-text">
      
      {/* Top Demo Header & Nav (Editorial Aesthetic) */}
      <header className="h-20 bg-editorial-bg border-b border-editorial-border flex items-center justify-between px-6 md:px-10 z-30 select-none">
        
        {/* Brand logo */}
        <div className="flex items-center gap-3">
          <div className="bg-editorial-primary p-2 rounded-lg text-white shadow-sm flex items-center justify-center">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-serif italic tracking-tighter font-bold text-editorial-primary flex items-center gap-1">
              EcoSafari<span className="text-zinc-400 not-italic">.</span>
            </h1>
          </div>
        </div>

        {/* Global Module Navigation Switches styled as elegant editorial tabs
            — escondido no mobile (vira o menu hambúrguer abaixo), porque
            espremido entre a logo e os ícones da direita ficava sem espaço
            de verdade numa tela estreita. */}
        <div className="hidden md:flex items-center gap-6 md:gap-8 text-[11px] uppercase tracking-[0.2em] font-semibold text-editorial-muted">
          <button
            onClick={() => {
              setCurrentModule("portal");
              setPortalView("catalog");
              navigate("/");
            }}
            className={`transition duration-200 pb-1 border-b-2 flex items-center gap-1.5 cursor-pointer ${
              currentModule === "portal"
                ? "text-editorial-text border-editorial-primary"
                : "border-transparent hover:text-editorial-text"
            }`}
          >
            Portal
          </button>
          {isAdmin && (
            <button
              onClick={() => setCurrentModule("admin")}
              className={`transition duration-200 pb-1 border-b-2 flex items-center gap-1.5 cursor-pointer ${
                currentModule === "admin"
                  ? "text-editorial-text border-editorial-primary"
                  : "border-transparent hover:text-editorial-text"
              }`}
            >
              Gestão
            </button>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Subtle site-wide translation switcher */}
          <div className="hidden sm:block">
            <LanguageSwitcher />
          </div>

          {/* Tourist account menu — Coins, favoritos, histórico */}
          <TouristProfileWidget />

          {/* Hambúrguer — só mobile, abre o painel com Portal/Gestão e o
              seletor de idioma que ficam escondidos nessa largura. */}
          <button
            onClick={() => setShowMobileMenu(v => !v)}
            className="md:hidden text-editorial-muted hover:text-editorial-text transition cursor-pointer"
            aria-label={showMobileMenu ? "Fechar menu" : "Abrir menu"}
            aria-expanded={showMobileMenu}
          >
            {showMobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* Ponto único de entrada: admin logado vê "Sair"; parceiro
              logado (sem ser admin) vê um atalho pro próprio painel; todo
              o resto vê "Entrar", que leva pra /entrar (Turista/Parceiros/
              Gestão numa tela só). Quem já é turista não precisa de nenhum
              dos dois — o avatar do TouristProfileWidget já cobre isso. */}
          {isAdmin ? (
            <button
              onClick={handleAdminLogout}
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-editorial-muted hover:text-editorial-text transition cursor-pointer"
              title="Sair do modo administrador"
              aria-label="Sair do modo administrador"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Sair</span>
            </button>
          ) : isTouristSession ? null : isPartnerSession ? (
            <button
              onClick={() => navigate("/parceiro")}
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-editorial-muted hover:text-editorial-text transition cursor-pointer"
              title="Meu painel de parceiro"
              aria-label="Meu painel de parceiro"
            >
              <User className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Meu Painel</span>
            </button>
          ) : (
            <button
              onClick={() => navigate("/entrar")}
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-editorial-muted hover:text-editorial-text transition cursor-pointer"
              title="Entrar"
              aria-label="Entrar"
            >
              <User className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Entrar</span>
            </button>
          )}
        </div>
      </header>

      {/* Painel mobile — Portal/Gestão + idioma, escondidos do cabeçalho
          nessa largura. */}
      {showMobileMenu && (
        <div className="md:hidden bg-white border-b border-editorial-border px-6 py-4 flex flex-col gap-3 animate-fadeIn">
          <button
            onClick={() => {
              setCurrentModule("portal");
              setPortalView("catalog");
              navigate("/");
              setShowMobileMenu(false);
            }}
            className={`text-left text-xs uppercase tracking-widest font-bold cursor-pointer ${currentModule === "portal" ? "text-editorial-primary" : "text-editorial-muted"}`}
          >
            Portal
          </button>
          {isAdmin && (
            <button
              onClick={() => { setCurrentModule("admin"); setShowMobileMenu(false); }}
              className={`text-left text-xs uppercase tracking-widest font-bold cursor-pointer ${currentModule === "admin" ? "text-editorial-primary" : "text-editorial-muted"}`}
            >
              Gestão
            </button>
          )}
          <div className="pt-2 border-t border-editorial-border">
            <LanguageSwitcher />
          </div>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <main className="flex-1 bg-editorial-secondary">
        {loading ? (
          <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3 bg-editorial-bg">
            <div className="w-10 h-10 border-2 border-editorial-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-editorial-muted text-xs uppercase tracking-widest font-bold animate-pulse">Carregando ecossistema EcoSafari...</p>
          </div>
        ) : (
          <>
            {/* 1. CUSTOMER PORTAL */}
            {currentModule === "portal" && (
              <ErrorBoundary variant="section" sectionLabel="esta página">
              <>                 {portalView === "catalog" && (
                  <PousadaCatalog
                    pousadas={pousadas}
                    reviews={reviews}
                    species={species}
                    sightings={sightings}
                    bookings={confirmedBookings}
                    onAddSighting={(newS) => {
                      setSightings(prev => [newS, ...prev]);
                    }}
                    onRefreshData={fetchData}
                    onSelectPousada={handleSelectPousada}
                    onSelectVideo={handleSelectVideo}
                    onAddReview={(newR) => {
                      setReviews(prev => [newR, ...prev]);
                      fetchData(); // reload avg calculations
                    }}
                    onOpenBotWithPousada={handleOpenBotWithPousada}
                  />
                )}
                {portalView === "details" && selectedPousada && (
                  <PousadaDetailsView
                    pousada={selectedPousada}
                    onBack={() => { setPortalView("catalog"); navigate("/"); }}
                    onOpenBot={handleOpenBotWithPousada}
                  />
                )}
                {portalView === "video" && (
                  <VideoPlayerView
                    pousada={selectedPousada}
                    onBack={() => setPortalView("catalog")}
                    onOpenBot={handleOpenBotWithPousada}
                  />
                )}
                {portalView === "whatsapp-gate" && (
                  <WhatsAppGateView
                    pousada={selectedPousada}
                    onBack={() => { setPortalView("catalog"); navigate("/"); }}
                  />
                )}

                {/* WhatsApp float trigger is visible everywhere except the gate screen itself */}
                {portalView !== "whatsapp-gate" && (
                  <WhatsAppChatbot onOpen={() => openWhatsAppGate()} />
                )}
              </>
              </ErrorBoundary>
            )}

            {/* 2. ADMIN PANEL (restricted to authenticated admins) */}
            {currentModule === "admin" && isAdmin && (
              <ErrorBoundary variant="section" sectionLabel="o painel de Gestão">
              <Suspense fallback={<LazyFallback />}>
                <AdminDashboard
                  pousadas={pousadas}
                  species={species}
                  onRefreshData={fetchData}
                />
              </Suspense>
              </ErrorBoundary>
            )}
          </>
        )}
      </main>

      {/* Footer (Editorial Aesthetic style) */}
      <footer className="bg-editorial-primary text-[#FDFCF8] border-t border-editorial-border py-12 px-6 md:px-10 text-[10px] uppercase tracking-widest font-sans">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          
          {/* Logo and Status */}
          <div className="flex flex-col items-center md:items-start gap-4">
            <span className="font-serif font-bold text-lg tracking-normal capitalize text-white">
              EcoSafari Brasil
            </span>
          </div>

          {/* Contact Direct Links as requested */}
          <div className="flex flex-col sm:flex-row items-center gap-6 text-xs font-semibold">
            {/* Email */}
            <a
              href="mailto:francainteligenciaindustrial@gmail.com?subject=Suporte%20EcoSafari&body=Olá%20equipe%20EcoSafari,%20gostaria%20de%20solicitar%20suporte%20para%20as%20expedições%20e%20reservas."
              className="flex items-center gap-2 hover:text-emerald-400 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Mail className="h-4 w-4" />
              <span>FRANCAINTELIGENCIAINDUSTRIAL@GMAIL.COM</span>
            </a>

            {/* WhatsApp */}
            <a
              href="https://wa.me/5565999868334?text=Olá%20equipe%20EcoSafari,%20gostaria%20de%20solicitar%20suporte%20para%20as%20expedições%20e%20reservas."
              className="flex items-center gap-2 hover:text-emerald-400 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageSquare className="h-4 w-4" />
              <span>WHATSAPP</span>
            </a>

            {/* Instagram */}
            <a
              href="https://instagram.com/ecosafari"
              className="flex items-center gap-2 hover:text-emerald-400 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Instagram className="h-4 w-4" />
              <span>@ECOSAFARI</span>
            </a>
          </div>

          {/* Copyright */}
          <div className="text-center md:text-right text-[9px] text-[#FDFCF8]/60 font-bold">
            <span className="block mb-1">© 2026 EcoSafari Brasil • WildStay Systems</span>
            <span className="text-editorial-dark-muted font-normal italic font-serif tracking-normal capitalize text-xs block mt-1">
              Conservação e Turismo Sustentável
            </span>
          </div>

        </div>

        {/* Institutional links */}
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-8 pt-6 border-t border-white/10 text-[9px] text-[#FDFCF8]/70 font-bold">
          <a href="/sobre" onClick={(e) => { e.preventDefault(); navigate("/sobre"); }} className="hover:text-emerald-400 transition-colors cursor-pointer">Sobre Nós</a>
          <a href="/faq" onClick={(e) => { e.preventDefault(); navigate("/faq"); }} className="hover:text-emerald-400 transition-colors cursor-pointer">Perguntas Frequentes</a>
          <a href="/privacidade" onClick={(e) => { e.preventDefault(); navigate("/privacidade"); }} className="hover:text-emerald-400 transition-colors cursor-pointer">Política de Privacidade</a>
          <a href="/termos" onClick={(e) => { e.preventDefault(); navigate("/termos"); }} className="hover:text-emerald-400 transition-colors cursor-pointer">Termos de Uso e Cancelamento</a>
          <a href="/status-candidatura" onClick={(e) => { e.preventDefault(); navigate("/status-candidatura"); }} className="hover:text-emerald-400 transition-colors cursor-pointer">Status da Candidatura</a>
        </div>

        {/* Institutional identity — required for a public booking/payment
            site to look legitimate (and for LGPD's data-controller
            disclosure). Values come from VITE_COMPANY_CNPJ/VITE_COMPANY_ADDRESS
            (see .env.example) — set them before launch. */}
        <div className="max-w-7xl mx-auto text-center mt-6 pt-6 border-t border-white/10 text-[9px] text-[#FDFCF8]/50 font-normal normal-case tracking-normal">
          EcoSafari Brasil • CNPJ: {COMPANY_CNPJ} • {COMPANY_ADDRESS}
        </div>
      </footer>

      <CookieConsentBanner />
    </div>
  );
}
