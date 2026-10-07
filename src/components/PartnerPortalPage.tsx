import React, { useState, useEffect } from "react";
import { Compass, LogOut, LoaderCircle, Lock, Save, Check, ArrowLeft, ShieldCheck, Trash2, Eye, Share2, Copy, Facebook, UserRound, Info, ConciergeBell, BedDouble, Images, UtensilsCrossed, CalendarDays, Package, Award, Users, Globe } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabaseClient";
import { adminFetch } from "../lib/adminFetch";
import { PartnerProfileResponse, Pousada, PartnerType } from "../types";
import { navigate } from "../lib/router";
import ImageListEditor from "./ImageListEditor";
import ImageUploadButton from "./ImageUploadButton";
import TagInput from "./TagInput";
import ExperienceListEditor, { ExperienceDraft } from "./ExperienceListEditor";
import RoomsEditor, { RoomDraft } from "./RoomsEditor";
import ToggleSwitch from "./ToggleSwitch";
import LanguagesEditor from "./LanguagesEditor";
import LanguageFlag from "./LanguageFlag";
import PousadaRecompensasManager from "./PousadaRecompensasManager";
import PousadaProdutosManager from "./PousadaProdutosManager";
import PartnerBookingsCalendar from "./PartnerBookingsCalendar";
import PousadaReservasAgenda from "./PousadaReservasAgenda";
import GestorPousadaPanel from "./GestorPousadaPanel";
import PousadaGestoresManager from "./PousadaGestoresManager";
import GuideAvailabilityCalendar from "./GuideAvailabilityCalendar";
import PartnerLoginPanel from "./PartnerLoginPanel";
import PousadaOfficialSite from "./PousadaOfficialSite";
import ErrorBoundary from "./ErrorBoundary";

// Agrupa os campos do formulário em cartões com título em vez de uma pilha
// só de inputs soltos — mesma ideia visual usada no resto do admin, só
// aplicada aqui pra cortar a sensação de "parede de campos" do formulário de
// perfil do parceiro.
function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-editorial-border rounded-lg p-4 space-y-4">
      <h3 className="text-[10px] uppercase tracking-[0.15em] font-bold text-editorial-primary">{title}</h3>
      {children}
    </div>
  );
}

// Cardápio (Pousada.menu) vem do servidor como uma lista só, com "category"
// em cada item — separa por categoria pra alimentar os 4 ExperienceListEditor
// da aba Bar/Restaurantes (o inverso de juntar tudo de volta acontece em
// handleSave). item/price -> title/price porque é o shape que
// ExperienceListEditor já espera (mesmo componente usado em Experiências).
function menuByCategory(menu: Pousada["menu"] | undefined, category: string): ExperienceDraft[] {
  return (menu || [])
    .filter(m => (m.category || "prato") === category)
    .map(m => ({ title: m.item, price: m.price }));
}

type PousadaTab = "gestor" | "agenda" | "sobre" | "servicos" | "acomodacoes" | "galeria" | "redes" | "bar" | "produtos" | "recompensas" | "gestores" | "editar-site";

const POUSADA_TABS: { id: PousadaTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "agenda", label: "Agenda de Reservas", icon: CalendarDays },
  { id: "sobre", label: "Sobre", icon: Info },
  { id: "servicos", label: "Serviços", icon: ConciergeBell },
  { id: "acomodacoes", label: "Acomodações", icon: BedDouble },
  { id: "galeria", label: "Galeria de Fotos", icon: Images },
  { id: "redes", label: "Redes Sociais", icon: Share2 },
  { id: "bar", label: "Bar/Restaurantes", icon: UtensilsCrossed },
  { id: "produtos", label: "Produtos", icon: Package },
  { id: "recompensas", label: "Recompensas", icon: Award },
  { id: "gestores", label: "Gestores", icon: Users },
  { id: "editar-site", label: "Editar Site", icon: Globe },
];

// Abas que editam campos da pousada e por isso usam o formulário com
// "Salvar Alterações"; as outras têm o próprio fluxo de gravação.
const FORM_TABS: PousadaTab[] = ["agenda", "sobre", "servicos", "acomodacoes", "galeria", "redes", "bar", "editar-site"];

// Self-service portal for a partner (pousada/atração/guia) to edit only
// their own profile — no access to bookings, other partners, or anything
// admin-only. Auth is the same Supabase Auth used by the admin login, just
// checking app_metadata.role === "partner" instead of "admin"; the actual
// enforcement lives server-side in requirePartnerAccess (server.ts), this
// page only decides what to render.
export default function PartnerPortalPage() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isPartner, setIsPartner] = useState(false);

  const [profile, setProfile] = useState<PartnerProfileResponse | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState<any>(null);
  // Só a edição de pousada usa abas (menu lateral) — atração/guia continuam
  // num formulário único de coluna simples.
  const [pousadaTab, setPousadaTab] = useState<PousadaTab>("gestor");
  const [userInfo, setUserInfo] = useState<{ email: string; name: string; phone: string; partnerType: string }>({ email: "", name: "", phone: "", partnerType: "" });
  const [shareCopied, setShareCopied] = useState(false);

  // Dono de mais de uma pousada gerencia todas com o mesmo login — ver
  // GET /api/my-partner-properties/provisionPartnerLogin em server.ts.
  // selectedProperty null = usa a propriedade "principal" salva em
  // app_metadata (comportamento de sempre, pra quem só tem uma).
  const [properties, setProperties] = useState<{ partnerType: PartnerType; partnerId: string; name: string }[] | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<{ partnerType: PartnerType; partnerId: string } | null>(null);

  // Whether the current session came from clicking an invite/recovery link
  // rather than a normal email+senha login — Supabase fires a dedicated
  // PASSWORD_RECOVERY event for this. Without gating on it, someone clicking
  // an invite link would land with a valid session but no way to ever set an
  // actual known password (the account was created with a random one), so
  // they'd be locked out again the moment that session expires.
  const [needsNewPassword, setNeedsNewPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [settingPassword, setSettingPassword] = useState(false);
  const [setPasswordError, setSetPasswordError] = useState("");

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    getSupabaseClient().then(client => {
      setSupabase(client);
      client.auth.getSession().then(({ data }) => {
        const user = data.session?.user;
        setIsPartner(user?.app_metadata?.role === "partner");
        if (user) setUserInfo({ email: user.email || "", name: user.user_metadata?.name || "", phone: user.user_metadata?.phone || "", partnerType: user.app_metadata?.partnerType || "" });
        setCheckingSession(false);
      });
      const { data } = client.auth.onAuthStateChange((event, session) => {
        setIsPartner(session?.user?.app_metadata?.role === "partner");
        if (session?.user) setUserInfo({ email: session.user.email || "", name: session.user.user_metadata?.name || "", phone: session.user.user_metadata?.phone || "", partnerType: session.user.app_metadata?.partnerType || "" });
        if (event === "PASSWORD_RECOVERY") setNeedsNewPassword(true);
      });
      subscription = data.subscription;
    });
    return () => subscription?.unsubscribe();
  }, []);

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || settingPassword) return;
    setSetPasswordError("");
    if (newPassword.length < 8) {
      setSetPasswordError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setSetPasswordError("As senhas não coincidem.");
      return;
    }
    setSettingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setSetPasswordError(error.message || "Erro ao definir senha.");
        return;
      }
      setNeedsNewPassword(false);
      setNewPassword("");
      setNewPasswordConfirm("");
    } finally {
      setSettingPassword(false);
    }
  };

  // Lista de propriedades pra aba "Minhas Pousadas" — busca uma vez ao
  // logar, não depende de qual está selecionada no momento.
  useEffect(() => {
    if (!isPartner) return;
    fetchProperties();
  }, [isPartner]);

  // Espera a lista de propriedades: se a "principal" (app_metadata) tiver
  // sido removida, cai na primeira pousada que ainda existe.
  const fetchProperties = () =>
    adminFetch("/api/my-partner-properties")
      .then(res => (res.ok ? res.json() : { properties: [] }))
      .then(data => setProperties(data.properties || []))
      .catch(() => setProperties([]));

  const activeProperty = selectedProperty && (properties || []).some(p => p.partnerId === selectedProperty.partnerId)
    ? selectedProperty
    : properties && properties.length > 0 ? { partnerType: properties[0].partnerType, partnerId: properties[0].partnerId } : null;

  useEffect(() => {
    if (!isPartner || properties === null) return;
    setLoadingProfile(true);
    setProfileError("");
    const query = activeProperty ? `?partnerType=${activeProperty.partnerType}&partnerId=${encodeURIComponent(activeProperty.partnerId)}` : "";
    adminFetch(`/api/my-partner-profile${query}`)
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Erro ao carregar seu perfil.");
        }
        return res.json();
      })
      .then((data: PartnerProfileResponse) => {
        setProfile(data);
        if (data.partnerType === "pousada" && data.pousada) {
          setForm({
            description: data.pousada.description,
            longDescription: data.pousada.longDescription || "",
            images: [...(data.pousada.images || [])],
            features: [...(data.pousada.features || [])],
            activities: [...(data.pousada.activities || [])],
            pricePerNight: data.pousada.pricePerNight,
            capacity: data.pousada.capacity,
            experiences: (data.pousada.experiences || []).map(e => ({ title: e.title, price: e.price })) as ExperienceDraft[],
            videoUrl: data.pousada.videoUrl || "",
            officialSiteUrl: data.pousada.officialSiteUrl || "",
            officialSiteImages: [...(data.pousada.officialSiteImages || [])],
            teamPhotoUrl: data.pousada.teamPhotoUrl || "",
            teamSectionTitle: data.pousada.teamSectionTitle || "",
            teamSectionText: data.pousada.teamSectionText || "",
            rooms: [...(data.pousada.rooms || [])] as RoomDraft[],
            unavailableDates: [...(data.pousada.unavailableDates || [])],
            hasOwnWebsite: !!data.pousada.hasOwnWebsite,
            ownWebsiteUrl: data.pousada.ownWebsiteUrl || "",
            // Cardápio separado por categoria na edição — junta tudo de volta
            // num "menu" só na hora de salvar (ver handleSave). Itens antigos
            // da categoria "drink" passam a ficar em Bebidas.
            menuPratos: menuByCategory(data.pousada.menu, "prato"),
            menuSobremesas: menuByCategory(data.pousada.menu, "sobremesa"),
            menuBebidas: [...menuByCategory(data.pousada.menu, "bebida"), ...menuByCategory(data.pousada.menu, "drink")],
            menuOutros: menuByCategory(data.pousada.menu, "outro"),
            cuisineTypes: [...(data.pousada.cuisineTypes || [])],
            transportOptions: [...(data.pousada.transportOptions || [])],
            entertainmentOptions: [...(data.pousada.entertainmentOptions || [])],
            serviceNotes: data.pousada.serviceNotes || "",
            hasParking: !!data.pousada.hasParking,
            hasWifi: !!data.pousada.hasWifi,
            facebookUrl: data.pousada.facebookUrl || "",
            tiktokUrl: data.pousada.tiktokUrl || "",
            youtubeUrl: data.pousada.youtubeUrl || "",
            logoUrl: data.pousada.logoUrl || "",
            themeColorPrimary: data.pousada.themeColorPrimary || "",
            themeColorAccent: data.pousada.themeColorAccent || "",
          });
        } else if (data.partnerType === "atracao" && data.atracao) {
          setForm({
            name: data.atracao.name,
            location: data.atracao.location,
            description: data.atracao.description,
            images: [...(data.atracao.images || [])],
            menu: (data.atracao.menu || []).map(m => ({ title: m.item, price: m.price })) as ExperienceDraft[],
            availability: data.atracao.availability || "",
          });
        } else if (data.partnerType === "guia" && data.guia) {
          setForm({
            name: data.guia.name,
            email: data.guia.email,
            phone: data.guia.phone,
            bio: data.guia.bio || "",
            age: data.guia.age || "",
            birthplace: data.guia.birthplace || "",
            photoUrl: data.guia.photoUrl || "",
            languages: [...(data.guia.languages || [])],
            specialty: [...(data.guia.specialty || [])],
            interests: [...(data.guia.interests || [])],
            status: data.guia.status,
            images: [...(data.guia.images || [])],
            unavailableDates: [...(data.guia.unavailableDates || [])],
          });
        }
      })
      .catch(err => {
        setProfile(null);
        setForm(null);
        // Gestor sem nenhuma pousada (todas removidas) não é erro — cai na
        // tela "Gestor de Pousada" pra cadastrar uma nova.
        if (userInfo.partnerType === "pousada" && (properties || []).length === 0) return;
        setProfileError(err.message || "Erro ao carregar seu perfil.");
      })
      .finally(() => setLoadingProfile(false));
  }, [isPartner, activeProperty?.partnerType, activeProperty?.partnerId, properties === null]);

  // "Entrar com EcoSafari" — apps de terceiros (o aplicativo mobile
  // planejado, por exemplo) que o parceiro autorizou via a tela de
  // consentimento em /parceiro/oauth/consent. Só relevante se o Servidor
  // OAuth do Supabase estiver habilitado no projeto.
  const [grants, setGrants] = useState<{ client: { id: string; name: string; logo_uri: string }; scopes: string[]; granted_at: string }[]>([]);
  const [loadingGrants, setLoadingGrants] = useState(false);
  const [revokingClientId, setRevokingClientId] = useState<string | null>(null);

  const fetchGrants = () => {
    if (!supabase) return;
    setLoadingGrants(true);
    supabase.auth.oauth.listGrants()
      .then(({ data }) => setGrants(data || []))
      .catch(() => {})
      .finally(() => setLoadingGrants(false));
  };

  useEffect(() => {
    if (!isPartner || !supabase) return;
    fetchGrants();
  }, [isPartner, supabase]);

  const handleRevokeGrant = async (clientId: string, clientName: string) => {
    if (!supabase) return;
    if (!confirm(`Remover o acesso de "${clientName}" à sua conta?`)) return;
    setRevokingClientId(clientId);
    try {
      await supabase.auth.oauth.revokeGrant({ clientId });
      fetchGrants();
    } finally {
      setRevokingClientId(null);
    }
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setIsPartner(false);
    setProfile(null);
    setForm(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !form) return;
    setSaveError("");
    if (profile.partnerType === "pousada") {
      const semTipo = form.rooms.filter((r: RoomDraft) => !r.type.trim()).length;
      if (semTipo > 0) {
        setPousadaTab("acomodacoes");
        setSaveError(`${semTipo === 1 ? "Há 1 quarto" : `Há ${semTipo} quartos`} sem "Tipo de quarto" preenchido — preencha o tipo (ex: Suíte Casal) ou remova o quarto antes de salvar.`);
        return;
      }
    }
    setSaving(true);
    setSaved(false);
    try {
      let endpoint = "";
      let payload: any = {};
      if (profile.partnerType === "pousada") {
        endpoint = `/api/pousadas/${profile.partnerId}`;
        payload = {
          description: form.description,
          longDescription: form.longDescription,
          images: form.images.map((i: string) => i.trim()).filter(Boolean),
          features: form.features,
          activities: form.activities,
          pricePerNight: Number(form.pricePerNight),
          capacity: Number(form.capacity),
          experiences: form.experiences.filter((e: ExperienceDraft) => e.title.trim()),
          videoUrl: form.videoUrl.trim() || undefined,
          officialSiteUrl: form.officialSiteUrl.trim() || undefined,
          officialSiteImages: form.officialSiteImages.map((i: string) => i.trim()).filter(Boolean),
          teamPhotoUrl: form.teamPhotoUrl.trim() || undefined,
          teamSectionTitle: form.teamSectionTitle.trim() || undefined,
          teamSectionText: form.teamSectionText.trim() || undefined,
          rooms: form.rooms.filter((r: RoomDraft) => r.type.trim()),
          unavailableDates: form.unavailableDates,
          hasOwnWebsite: form.hasOwnWebsite,
          ownWebsiteUrl: form.ownWebsiteUrl.trim() || undefined,
          // Junta as 4 listas por categoria da aba Bar/Restaurantes de volta
          // num "menu" só (o inverso de menuByCategory, usado ao carregar).
          menu: ([
            ...form.menuPratos.map((m: ExperienceDraft) => ({ ...m, category: "prato" })),
            ...form.menuSobremesas.map((m: ExperienceDraft) => ({ ...m, category: "sobremesa" })),
            ...form.menuBebidas.map((m: ExperienceDraft) => ({ ...m, category: "bebida" })),
            ...form.menuOutros.map((m: ExperienceDraft) => ({ ...m, category: "outro" })),
          ] as (ExperienceDraft & { category: string })[])
            .filter(m => m.title.trim())
            .map(m => ({ item: m.title.trim(), price: m.price || 0, category: m.category })),
          cuisineTypes: form.cuisineTypes,
          transportOptions: form.transportOptions,
          entertainmentOptions: form.entertainmentOptions,
          serviceNotes: form.serviceNotes.trim() || undefined,
          hasParking: form.hasParking,
          hasWifi: form.hasWifi,
          facebookUrl: form.facebookUrl.trim() || undefined,
          tiktokUrl: form.tiktokUrl.trim() || undefined,
          youtubeUrl: form.youtubeUrl.trim() || undefined,
          logoUrl: form.logoUrl.trim() || undefined,
          // Sem "|| undefined" de propósito — precisa mandar string vazia
          // quando a pessoa clica em "Usar paleta padrão", senão a limpeza
          // não vai pro servidor (undefined some do payload por completo).
          themeColorPrimary: form.themeColorPrimary.trim(),
          themeColorAccent: form.themeColorAccent.trim(),
        };
      } else if (profile.partnerType === "atracao") {
        endpoint = `/api/atracoes/${profile.partnerId}`;
        payload = {
          name: form.name,
          location: form.location,
          description: form.description,
          images: form.images.map((i: string) => i.trim()).filter(Boolean),
          menu: form.menu.filter((m: ExperienceDraft) => m.title.trim()).map((m: ExperienceDraft) => ({ item: m.title.trim(), price: m.price || 0 })),
          availability: form.availability.trim() || undefined,
        };
      } else {
        endpoint = `/api/guides/${profile.partnerId}`;
        payload = {
          name: form.name,
          email: form.email,
          phone: form.phone,
          bio: form.bio,
          age: form.age === "" ? undefined : Number(form.age),
          birthplace: form.birthplace,
          photoUrl: form.photoUrl,
          languages: form.languages,
          specialty: form.specialty,
          interests: form.interests,
          status: form.status,
          images: form.images.map((i: string) => i.trim()).filter(Boolean),
          unavailableDates: form.unavailableDates,
        };
      }
      const res = await adminFetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) {
        const updated = await res.json().catch(() => null);
        if (updated && profile.partnerType === "pousada") setProfile(p => (p ? { ...p, pousada: updated } : p));
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const body = await res.json().catch(() => ({}));
        setSaveError(body.error || `Erro ao salvar (código ${res.status}).`);
      }
    } catch {
      setSaveError("Sem conexão com o servidor — suas alterações não foram salvas.");
    } finally {
      setSaving(false);
    }
  };

  // Espelha em tempo real (a cada tecla) as edições ainda não salvas sobre o
  // registro real, pro preview ao lado mostrar exatamente como a página vai
  // ficar — mesma transformação de tipos usada no payload de handleSave
  // acima, só que sem filtrar campos vazios "pela metade" (ex: uma imagem
  // ainda sendo colada) pra não sumir com a seção enquanto a pessoa digita.
  // experiences perde "description" no formulário (ExperienceDraft só tem
  // title/price) — recupera do registro original combinando pelo título.
  // Sem preview (nem a coluna de duas telas) quando a pousada já tem site
  // próprio — não existe /site/:slug nosso pra mostrar nesse caso.
  const previewPousada: Pousada | null =
    profile?.partnerType === "pousada" && profile.pousada && form && !form.hasOwnWebsite
      ? {
          ...profile.pousada,
          description: form.description,
          longDescription: form.longDescription,
          images: form.images.filter((i: string) => i.trim()),
          features: form.features,
          activities: form.activities,
          pricePerNight: Number(form.pricePerNight) || 0,
          capacity: Number(form.capacity) || 0,
          experiences: form.experiences
            .filter((e: ExperienceDraft) => e.title.trim())
            .map((e: ExperienceDraft) => ({
              title: e.title,
              price: e.price,
              description: profile.pousada!.experiences.find(orig => orig.title === e.title)?.description || "",
            })),
          videoUrl: form.videoUrl.trim() || undefined,
          officialSiteUrl: form.officialSiteUrl.trim() || undefined,
          officialSiteImages: form.officialSiteImages.filter((i: string) => i.trim()),
          teamPhotoUrl: form.teamPhotoUrl.trim() || undefined,
          teamSectionTitle: form.teamSectionTitle.trim() || undefined,
          teamSectionText: form.teamSectionText.trim() || undefined,
          rooms: form.rooms.filter((r: RoomDraft) => r.type.trim()),
          logoUrl: form.logoUrl.trim() || undefined,
          themeColorPrimary: form.themeColorPrimary.trim() || undefined,
          themeColorAccent: form.themeColorAccent.trim() || undefined,
        }
      : null;

  if (checkingSession || !supabase) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-editorial-bg">
        <LoaderCircle className="h-8 w-8 text-editorial-primary animate-spin" />
      </div>
    );
  }

  const header = (
    <header className="h-16 flex items-center justify-between px-6 md:px-10 border-b border-editorial-border bg-white">
      <a href="/" onClick={e => { e.preventDefault(); navigate("/"); }} className="flex items-center gap-2 cursor-pointer">
        <div className="bg-editorial-primary p-1.5 rounded-lg text-white flex items-center justify-center">
          <Compass className="h-4 w-4" />
        </div>
        <span className="font-serif italic font-bold text-editorial-primary">EcoSafari<span className="text-zinc-400 not-italic">.</span></span>
      </a>
      {isPartner && (
        <button onClick={handleLogout} className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-editorial-muted hover:text-editorial-text transition cursor-pointer">
          <LogOut className="h-3.5 w-3.5" /> Sair
        </button>
      )}
    </header>
  );

  if (needsNewPassword) {
    return (
      <div className="min-h-screen bg-editorial-bg font-sans">
        {header}
        <div className="flex items-center justify-center px-6 py-16">
          <div className="max-w-sm w-full bg-white border border-editorial-border rounded-lg p-8 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-4 w-4 text-editorial-primary" />
              <h1 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary">Defina sua Senha</h1>
            </div>
            <p className="text-editorial-muted text-xs mb-6">Escolha uma senha pra usar daqui pra frente no seu acesso de parceiro.</p>
            <form onSubmit={handleSetNewPassword} className="flex flex-col gap-3">
              <input
                type="password" required minLength={8} placeholder="Nova senha (mínimo 8 caracteres)" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
              />
              <input
                type="password" required minLength={8} placeholder="Confirme a nova senha" value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)}
                className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
              />
              {setPasswordError && <p className="text-red-600 text-xs font-medium">{setPasswordError}</p>}
              <button
                type="submit" disabled={settingPassword}
                className="mt-2 bg-editorial-primary text-white text-xs uppercase tracking-widest font-semibold py-2.5 rounded-md flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60 cursor-pointer"
              >
                {settingPassword ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Salvar Senha e Continuar"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (!isPartner) {
    return (
      <div className="min-h-screen bg-editorial-bg font-sans">
        {header}
        <div className="flex items-center justify-center px-6 py-16">
          <PartnerLoginPanel />
        </div>
      </div>
    );
  }

  const isPousadaGestor = userInfo.partnerType === "pousada" || profile?.partnerType === "pousada";
  const pousadaList = (properties || []).filter(p => p.partnerType === "pousada");
  const showForm = !isPousadaGestor || FORM_TABS.includes(pousadaTab);
  const openPousada = (partnerId: string) => {
    setSelectedProperty({ partnerType: "pousada", partnerId });
    setPousadaTab("agenda");
  };
  const currentTabLabel = POUSADA_TABS.find(t => t.id === pousadaTab)?.label;

  return (
    <div className="min-h-screen bg-editorial-bg font-sans">
      {header}
      <div className={`mx-auto px-4 md:px-6 py-8 ${isPousadaGestor ? "max-w-7xl" : "max-w-2xl"}`}>
        <a href="/" onClick={e => { e.preventDefault(); navigate("/"); }} className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-editorial-muted hover:text-editorial-primary transition mb-6 cursor-pointer">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao site
        </a>
        {isPousadaGestor ? (
          <div className="mb-6">
            <h1 className="text-2xl font-serif font-bold text-editorial-primary mb-1">
              {pousadaTab === "gestor" ? "Gestor de Pousada" : profile?.pousada?.name || "Minha Pousada"}
            </h1>
            <p className="text-editorial-muted text-xs">
              {pousadaTab === "gestor"
                ? `Olá${userInfo.name ? `, ${userInfo.name}` : ""}! Seus dados e todas as pousadas que você gerencia.`
                : currentTabLabel}
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-serif font-bold text-editorial-primary mb-1">Meu Perfil</h1>
            <p className="text-editorial-muted text-xs mb-8">
              {profile?.atracao?.name || profile?.guia?.name || "Edite as informações que aparecem pra quem visita a EcoSafari."}
            </p>
          </>
        )}

        <div className={isPousadaGestor ? "flex flex-col md:flex-row gap-6 items-start" : ""}>
          {isPousadaGestor && (
            <aside className="w-full md:w-60 md:flex-shrink-0 md:sticky md:top-6">
              <nav className="bg-white border border-editorial-border rounded-lg p-2 flex md:flex-col gap-1 overflow-x-auto">
                {[{ id: "gestor" as PousadaTab, label: "Gestor de Pousada", icon: UserRound }, ...(profile?.pousada && form ? POUSADA_TABS : [])].map((tab, i) => {
                  const Icon = tab.icon;
                  return (
                    <React.Fragment key={tab.id}>
                      {i === 1 && (
                        <div className="hidden md:block px-3 pt-4 pb-1 text-[9px] uppercase tracking-[0.2em] font-bold text-editorial-muted truncate" title={profile?.pousada?.name}>
                          {profile?.pousada?.name}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setPousadaTab(tab.id)}
                        aria-current={pousadaTab === tab.id ? "page" : undefined}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[11px] font-bold uppercase tracking-wider whitespace-nowrap text-left transition cursor-pointer ${
                          pousadaTab === tab.id
                            ? "bg-editorial-primary text-white"
                            : "text-editorial-muted hover:bg-editorial-secondary hover:text-editorial-text"
                        }`}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" /> {tab.label}
                      </button>
                    </React.Fragment>
                  );
                })}
              </nav>
            </aside>
          )}

          <div className="flex-1 min-w-0 w-full">
        {isPousadaGestor && pousadaTab === "gestor" && (
          <GestorPousadaPanel
            supabase={supabase}
            userInfo={userInfo}
            onUserInfoSaved={info => setUserInfo(u => ({ ...u, ...info }))}
            pousadas={pousadaList}
            activeId={profile?.partnerType === "pousada" ? profile.partnerId : null}
            onOpen={openPousada}
            onChanged={fetchProperties}
          />
        )}

        {isPousadaGestor && pousadaTab === "agenda" && profile?.partnerType === "pousada" && form && (
          <div className="mb-6">
            <ErrorBoundary variant="section" sectionLabel="a agenda de reservas">
              <PousadaReservasAgenda pousadaId={profile.partnerId} unavailableDates={form.unavailableDates} />
            </ErrorBoundary>
          </div>
        )}

        {showForm && (loadingProfile ? (
          <div className="flex items-center justify-center py-16 text-editorial-muted gap-2">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </div>
        ) : profileError ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-4 py-3 rounded-lg">{profileError}</div>
        ) : profile && form ? (
          <ErrorBoundary variant="section" sectionLabel="seu perfil">
          <div className={pousadaTab === "editar-site" && previewPousada ? "grid grid-cols-1 xl:grid-cols-2 gap-8 items-start" : ""}>
          <form onSubmit={handleSave} className="bg-white border border-editorial-border rounded-lg p-6 space-y-5">
            {profile.partnerType === "pousada" && (
              <>
                {/* Cada aba mostra só o que é dela — nada fica repetido nas
                    outras (Sobre/Preço, antes sempre visíveis, agora são a
                    própria aba "Sobre"). */}
                {pousadaTab === "agenda" && (
                  <FormSection title="Datas bloqueadas">
                    <p className="text-editorial-muted text-[11px] -mt-1">Bloqueie datas específicas (manutenção, evento fechado, reforma) — aparecem hachuradas no calendário acima. Clique em "Salvar Alterações" depois de marcar.</p>
                    <GuideAvailabilityCalendar value={form.unavailableDates} onChange={unavailableDates => setForm((p: any) => ({ ...p, unavailableDates }))} />
                  </FormSection>
                )}

                {pousadaTab === "sobre" && (
                  <FormSection title="Sobre">
                    <div className="text-xs">
                      <label className="block text-editorial-text font-semibold mb-1.5">Descrição Curta</label>
                      <input type="text" value={form.description} onChange={e => setForm((p: any) => ({ ...p, description: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                    </div>
                    <div className="text-xs">
                      <label className="block text-editorial-text font-semibold mb-1.5">Descrição Completa</label>
                      <textarea rows={4} value={form.longDescription} onChange={e => setForm((p: any) => ({ ...p, longDescription: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary resize-none" />
                    </div>
                    <p className="text-editorial-muted text-[11px]">Esse texto compõe a página da pousada no catálogo e o site oficial.</p>
                  </FormSection>
                )}

                {pousadaTab === "servicos" && (
                  <FormSection title="Serviços">
                    <div className="text-xs">
                      <label className="block text-editorial-text font-semibold mb-1.5">Estrutura & Comodidades</label>
                      <TagInput value={form.features} onChange={features => setForm((p: any) => ({ ...p, features }))} placeholder="Digite e pressione Enter" />
                    </div>
                    <div className="text-xs">
                      <label className="block text-editorial-text font-semibold mb-1.5">Atividades</label>
                      <TagInput value={form.activities} onChange={activities => setForm((p: any) => ({ ...p, activities }))} placeholder="Digite e pressione Enter" />
                    </div>
                    <div className="text-xs">
                      <label className="block text-editorial-text font-semibold mb-1.5">Experiências Pagas (passeios)</label>
                      <ExperienceListEditor value={form.experiences} onChange={experiences => setForm((p: any) => ({ ...p, experiences }))} />
                    </div>
                    <div className="flex flex-wrap gap-6">
                      <div className="text-xs bg-editorial-secondary/40 border border-editorial-border rounded-md p-3 flex items-center gap-3">
                        <label className="font-semibold text-editorial-text">Estacionamento</label>
                        <ToggleSwitch checked={!!form.hasParking} onChange={checked => setForm((p: any) => ({ ...p, hasParking: checked }))} labelOn="Sim" labelOff="Não" />
                      </div>
                      <div className="text-xs bg-editorial-secondary/40 border border-editorial-border rounded-md p-3 flex items-center gap-3">
                        <label className="font-semibold text-editorial-text">Wi-Fi</label>
                        <ToggleSwitch checked={!!form.hasWifi} onChange={checked => setForm((p: any) => ({ ...p, hasWifi: checked }))} labelOn="Sim" labelOff="Não" />
                      </div>
                    </div>
                    <div className="text-xs">
                      <label className="block text-editorial-text font-semibold mb-1.5">Tipos de Culinária</label>
                      <TagInput value={form.cuisineTypes} onChange={cuisineTypes => setForm((p: any) => ({ ...p, cuisineTypes }))} placeholder="Ex: Regional, Italiana..." />
                    </div>
                    <div className="text-xs">
                      <label className="block text-editorial-text font-semibold mb-1.5">Transporte</label>
                      <TagInput value={form.transportOptions} onChange={transportOptions => setForm((p: any) => ({ ...p, transportOptions }))} placeholder="Ex: Transfer aeroporto, Traslado local..." />
                    </div>
                    <div className="text-xs">
                      <label className="block text-editorial-text font-semibold mb-1.5">Entretenimento</label>
                      <TagInput value={form.entertainmentOptions} onChange={entertainmentOptions => setForm((p: any) => ({ ...p, entertainmentOptions }))} placeholder="Ex: Fogueira, Música ao vivo..." />
                    </div>
                    <div className="text-xs">
                      <label className="block text-editorial-text font-semibold mb-1.5">Atendimento & Necessidades Especiais</label>
                      <textarea rows={3} value={form.serviceNotes} onChange={e => setForm((p: any) => ({ ...p, serviceNotes: e.target.value }))} placeholder="Descreva o atendimento oferecido, acessibilidade, necessidades especiais atendidas..." className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary resize-none" />
                    </div>
                  </FormSection>
                )}

                {pousadaTab === "acomodacoes" && (
                  <FormSection title="Acomodações">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-xs">
                        <label className="block text-editorial-text font-semibold mb-1.5">Diária a partir de (R$)</label>
                        <input type="number" min={0} value={form.pricePerNight} onChange={e => setForm((p: any) => ({ ...p, pricePerNight: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                      </div>
                      <div className="text-xs">
                        <label className="block text-editorial-text font-semibold mb-1.5">Capacidade total (hóspedes)</label>
                        <input type="number" min={1} value={form.capacity} onChange={e => setForm((p: any) => ({ ...p, capacity: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                      </div>
                    </div>
                    <div className="text-xs">
                      <label className="block text-editorial-text font-semibold mb-1.5">Quartos</label>
                      <p className="text-editorial-muted text-[11px] mb-2">Todo quarto precisa de um "Tipo de quarto" (ex: Suíte Casal). Depois de ajustar, clique em "Salvar Alterações" lá embaixo.</p>
                      <RoomsEditor value={form.rooms} onChange={rooms => setForm((p: any) => ({ ...p, rooms }))} />
                    </div>
                  </FormSection>
                )}

                {pousadaTab === "bar" && (
                  <FormSection title="Bar/Restaurantes">
                    <p className="text-editorial-muted text-[11px] -mt-1">Opcional — só preencha se a pousada tiver bar/restaurante próprio. Cada item entra com o preço.</p>
                    <div className="text-xs">
                      <label className="block text-editorial-text font-semibold mb-1.5">Pratos</label>
                      <ExperienceListEditor value={form.menuPratos} onChange={menuPratos => setForm((p: any) => ({ ...p, menuPratos }))} />
                    </div>
                    <div className="text-xs">
                      <label className="block text-editorial-text font-semibold mb-1.5">Sobremesas</label>
                      <ExperienceListEditor value={form.menuSobremesas} onChange={menuSobremesas => setForm((p: any) => ({ ...p, menuSobremesas }))} />
                    </div>
                    <div className="text-xs">
                      <label className="block text-editorial-text font-semibold mb-1.5">Bebidas</label>
                      <ExperienceListEditor value={form.menuBebidas} onChange={menuBebidas => setForm((p: any) => ({ ...p, menuBebidas }))} />
                    </div>
                    <div className="text-xs">
                      <label className="block text-editorial-text font-semibold mb-1.5">Outros Produtos</label>
                      <ExperienceListEditor value={form.menuOutros} onChange={menuOutros => setForm((p: any) => ({ ...p, menuOutros }))} />
                    </div>
                  </FormSection>
                )}

                {pousadaTab === "galeria" && (
                  <FormSection title="Galeria de Fotos">
                    <p className="text-editorial-muted text-[11px] -mt-1">Fotos e vídeo que aparecem no catálogo e no site oficial — adicione, troque ou remova quando quiser.</p>
                    <ImageListEditor label="Fotos" value={form.images} onChange={images => setForm((p: any) => ({ ...p, images }))} />
                    <div className="text-xs border-t border-editorial-border pt-4">
                      <label className="block text-editorial-text font-semibold mb-1.5">Vídeo (link do YouTube ou Instagram)</label>
                      <input type="text" placeholder="https://youtube.com/watch?v=..." value={form.videoUrl} onChange={e => setForm((p: any) => ({ ...p, videoUrl: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                    </div>
                  </FormSection>
                )}

                {pousadaTab === "redes" && (
                  <FormSection title="Redes Sociais">
                    <div className="text-xs">
                      <label className="block text-editorial-text font-semibold mb-1.5">Instagram</label>
                      <input type="text" placeholder="https://instagram.com/..." value={form.officialSiteUrl} onChange={e => setForm((p: any) => ({ ...p, officialSiteUrl: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                    </div>
                    <div className="text-xs">
                      <label className="block text-editorial-text font-semibold mb-1.5">Facebook</label>
                      <input type="text" placeholder="https://facebook.com/..." value={form.facebookUrl} onChange={e => setForm((p: any) => ({ ...p, facebookUrl: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                    </div>
                    <div className="text-xs">
                      <label className="block text-editorial-text font-semibold mb-1.5">TikTok</label>
                      <input type="text" placeholder="https://tiktok.com/@..." value={form.tiktokUrl} onChange={e => setForm((p: any) => ({ ...p, tiktokUrl: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                    </div>
                    <div className="text-xs">
                      <label className="block text-editorial-text font-semibold mb-1.5">YouTube</label>
                      <input type="text" placeholder="https://youtube.com/@..." value={form.youtubeUrl} onChange={e => setForm((p: any) => ({ ...p, youtubeUrl: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                    </div>

                    {/* Compartilhar a página pública — não posta
                        automaticamente (exigiria autorização OAuth de cada
                        parceiro com Meta/TikTok, fora do escopo aqui), mas
                        abre o compartilhamento nativo já com o link. */}
                    <div className="text-xs border-t border-editorial-border pt-4">
                      <label className="block text-editorial-text font-semibold mb-1.5">Compartilhar a página da pousada</label>
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(`Conheça a ${profile.pousada?.name || "nossa pousada"} na EcoSafari: ${window.location.origin}/pousadas/${profile.partnerId}`)}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 border border-editorial-border text-editorial-text px-3 py-1.5 rounded-md hover:bg-editorial-secondary transition"
                        >
                          <Share2 className="h-3.5 w-3.5" /> WhatsApp
                        </a>
                        <a
                          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${window.location.origin}/pousadas/${profile.partnerId}`)}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 border border-editorial-border text-editorial-text px-3 py-1.5 rounded-md hover:bg-editorial-secondary transition"
                        >
                          <Facebook className="h-3.5 w-3.5" /> Facebook
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/pousadas/${profile.partnerId}`);
                            setShareCopied(true);
                            setTimeout(() => setShareCopied(false), 1500);
                          }}
                          className="flex items-center gap-1.5 border border-editorial-border text-editorial-text px-3 py-1.5 rounded-md hover:bg-editorial-secondary transition cursor-pointer"
                        >
                          {shareCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {shareCopied ? "Copiado!" : "Copiar link"}
                        </button>
                      </div>
                    </div>
                  </FormSection>
                )}

                {pousadaTab === "editar-site" && (
                  <FormSection title="Editar Site">
                    <div className="text-xs bg-editorial-secondary/40 border border-editorial-border rounded-md p-3">
                      <label className="block text-editorial-text font-semibold mb-1.5">Você já tem um site próprio?</label>
                      <p className="text-editorial-muted text-[11px] mb-3">
                        {form.hasOwnWebsite
                          ? "O botão \"Ver site oficial\" no catálogo vai levar direto pro seu site."
                          : "Sem site próprio, a EcoSafari monta um pra você com as fotos e informações abaixo — a pré-via ao lado atualiza conforme você edita."}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setForm((p: any) => ({ ...p, hasOwnWebsite: false }))}
                          className={`flex-1 text-[11px] font-bold uppercase tracking-widest px-3 py-2 rounded-md border transition cursor-pointer ${!form.hasOwnWebsite ? "bg-editorial-primary text-white border-editorial-primary" : "bg-white text-editorial-text border-editorial-border hover:bg-editorial-secondary"}`}
                        >
                          Não, criar um pra mim
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm((p: any) => ({ ...p, hasOwnWebsite: true }))}
                          className={`flex-1 text-[11px] font-bold uppercase tracking-widest px-3 py-2 rounded-md border transition cursor-pointer ${form.hasOwnWebsite ? "bg-editorial-primary text-white border-editorial-primary" : "bg-white text-editorial-text border-editorial-border hover:bg-editorial-secondary"}`}
                        >
                          Sim, já tenho
                        </button>
                      </div>
                    </div>

                    {form.hasOwnWebsite ? (
                      <div className="text-xs">
                        <label className="block text-editorial-text font-semibold mb-1.5">Link do seu site</label>
                        <input type="text" placeholder="https://..." value={form.ownWebsiteUrl} onChange={e => setForm((p: any) => ({ ...p, ownWebsiteUrl: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                      </div>
                    ) : (
                      <>
                        <ImageListEditor label="Galeria do Site Oficial (opcional — se vazia, usa as imagens do catálogo)" value={form.officialSiteImages} onChange={officialSiteImages => setForm((p: any) => ({ ...p, officialSiteImages }))} />
                        <div className="text-xs border-t border-editorial-border pt-4">
                          <label className="block text-editorial-text font-semibold mb-1.5">Foto da Equipe / Família</label>
                          <div className="flex items-center gap-3 mb-2">
                            {form.teamPhotoUrl && <img src={form.teamPhotoUrl} alt="Equipe" className="w-14 h-14 rounded-full object-cover border border-editorial-border" />}
                            <ImageUploadButton label={form.teamPhotoUrl ? "Trocar foto" : "Enviar foto"} onUploaded={url => setForm((p: any) => ({ ...p, teamPhotoUrl: url }))} />
                          </div>
                        </div>
                        <div className="text-xs">
                          <label className="block text-editorial-text font-semibold mb-1.5">Título da Seção da Equipe (padrão: "Quem vai te receber")</label>
                          <input type="text" value={form.teamSectionTitle} onChange={e => setForm((p: any) => ({ ...p, teamSectionTitle: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                        </div>
                        <div className="text-xs">
                          <label className="block text-editorial-text font-semibold mb-1.5">Texto de Apresentação da Equipe</label>
                          <textarea rows={3} value={form.teamSectionText} onChange={e => setForm((p: any) => ({ ...p, teamSectionText: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary resize-none" />
                        </div>

                        {/* Logo + paleta próprias — cada Site Oficial pode ter
                            sua própria identidade visual em vez de sempre
                            herdar o verde/creme padrão do EcoSafari. Vazio =
                            usa o tema padrão normalmente. */}
                        <div className="text-xs border-t border-editorial-border pt-4">
                          <label className="block text-editorial-text font-semibold mb-1.5">Logo</label>
                          <div className="flex items-center gap-3 mb-2">
                            {form.logoUrl && <img src={form.logoUrl} alt="Logo" className="w-14 h-14 rounded-full object-cover border border-editorial-border" />}
                            <ImageUploadButton label={form.logoUrl ? "Trocar logo" : "Enviar logo"} onUploaded={url => setForm((p: any) => ({ ...p, logoUrl: url }))} />
                          </div>
                        </div>
                        <div className="text-xs">
                          <label className="block text-editorial-text font-semibold mb-1.5">Paleta de Cores (opcional)</label>
                          <p className="text-editorial-muted text-[11px] mb-2">Deixe em branco pra usar a paleta padrão da EcoSafari. Combine com sua logo pra um site com a cara da sua pousada.</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-2">
                              <input type="color" value={form.themeColorPrimary || "#2D4635"} onChange={e => setForm((p: any) => ({ ...p, themeColorPrimary: e.target.value }))} className="w-9 h-9 rounded border border-editorial-border cursor-pointer flex-shrink-0" />
                              <div className="flex-1">
                                <label className="block text-editorial-text font-semibold mb-1">Cor principal</label>
                                <input type="text" placeholder="#2D4635" value={form.themeColorPrimary} onChange={e => setForm((p: any) => ({ ...p, themeColorPrimary: e.target.value }))} className="w-full border border-editorial-border rounded-md p-1.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <input type="color" value={form.themeColorAccent || "#B08D4F"} onChange={e => setForm((p: any) => ({ ...p, themeColorAccent: e.target.value }))} className="w-9 h-9 rounded border border-editorial-border cursor-pointer flex-shrink-0" />
                              <div className="flex-1">
                                <label className="block text-editorial-text font-semibold mb-1">Cor de destaque</label>
                                <input type="text" placeholder="#B08D4F" value={form.themeColorAccent} onChange={e => setForm((p: any) => ({ ...p, themeColorAccent: e.target.value }))} className="w-full border border-editorial-border rounded-md p-1.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                              </div>
                            </div>
                          </div>
                          {(form.themeColorPrimary || form.themeColorAccent) && (
                            <button
                              type="button"
                              onClick={() => setForm((p: any) => ({ ...p, themeColorPrimary: "", themeColorAccent: "" }))}
                              className="text-editorial-muted hover:text-editorial-primary text-[10px] uppercase tracking-widest font-bold mt-2 transition cursor-pointer"
                            >
                              Usar paleta padrão da EcoSafari
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </FormSection>
                )}
              </>
            )}

            {profile.partnerType === "atracao" && (
              <>
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Nome</label>
                  <input type="text" required value={form.name} onChange={e => setForm((p: any) => ({ ...p, name: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                </div>
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Localização</label>
                  <input type="text" required value={form.location} onChange={e => setForm((p: any) => ({ ...p, location: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                </div>
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Descrição</label>
                  <textarea rows={4} value={form.description} onChange={e => setForm((p: any) => ({ ...p, description: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary resize-none" />
                </div>
                <ImageListEditor label="Imagens" value={form.images} onChange={images => setForm((p: any) => ({ ...p, images }))} />
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Disponibilidade / Horário de Funcionamento</label>
                  <input type="text" value={form.availability} onChange={e => setForm((p: any) => ({ ...p, availability: e.target.value }))} placeholder="Ex: Terça a domingo, 11h às 22h" className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                </div>
                {profile.atracao?.type === "restaurante" && (
                  <div className="text-xs">
                    <label className="block text-editorial-text font-semibold mb-1.5">Cardápio</label>
                    <ExperienceListEditor value={form.menu} onChange={menu => setForm((p: any) => ({ ...p, menu }))} />
                  </div>
                )}
              </>
            )}

            {profile.partnerType === "guia" && (
              <>
                <div className="text-xs border-b border-editorial-border pb-4">
                  <label className="block text-editorial-text font-semibold mb-1.5">Foto de Perfil</label>
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-full overflow-hidden border border-editorial-border bg-editorial-secondary flex items-center justify-center flex-shrink-0">
                      {form.photoUrl ? <img src={form.photoUrl} alt="Foto de perfil" className="w-full h-full object-cover" /> : <span className="text-editorial-muted text-[9px]">Sem foto</span>}
                    </div>
                    <ImageUploadButton label={form.photoUrl ? "Trocar foto" : "Enviar foto"} onUploaded={url => setForm((p: any) => ({ ...p, photoUrl: url }))} />
                  </div>
                </div>
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Nome</label>
                  <input type="text" required value={form.name} onChange={e => setForm((p: any) => ({ ...p, name: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                </div>
                <p className="text-editorial-muted text-[10px] -mt-2">Email e telefone abaixo são de contato interno da equipe EcoSafari — nunca aparecem na sua página pública.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-xs">
                    <label className="block text-editorial-text font-semibold mb-1.5">Email</label>
                    <input type="email" required value={form.email} onChange={e => setForm((p: any) => ({ ...p, email: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                  </div>
                  <div className="text-xs">
                    <label className="block text-editorial-text font-semibold mb-1.5">Telefone</label>
                    <input type="text" required value={form.phone} onChange={e => setForm((p: any) => ({ ...p, phone: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-xs">
                    <label className="block text-editorial-text font-semibold mb-1.5">Idade</label>
                    <input type="number" min={0} value={form.age} onChange={e => setForm((p: any) => ({ ...p, age: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                  </div>
                  <div className="text-xs">
                    <label className="block text-editorial-text font-semibold mb-1.5">Origem / Naturalidade</label>
                    <input type="text" value={form.birthplace} onChange={e => setForm((p: any) => ({ ...p, birthplace: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                  </div>
                </div>
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Breve Histórico / Bio</label>
                  <textarea rows={4} value={form.bio} onChange={e => setForm((p: any) => ({ ...p, bio: e.target.value }))} className="w-full border border-editorial-border rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-editorial-primary resize-none" />
                </div>
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Idiomas Falados (com nível)</label>
                  <LanguagesEditor value={form.languages} onChange={languages => setForm((p: any) => ({ ...p, languages }))} />
                </div>
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Especialidades</label>
                  <TagInput value={form.specialty} onChange={specialty => setForm((p: any) => ({ ...p, specialty }))} placeholder="Digite e pressione Enter" />
                </div>
                <div className="text-xs">
                  <label className="block text-editorial-text font-semibold mb-1.5">Temas de Interesse</label>
                  <TagInput value={form.interests} onChange={interests => setForm((p: any) => ({ ...p, interests }))} placeholder="Digite e pressione Enter" />
                </div>
                <div className="text-xs bg-editorial-secondary/40 border border-editorial-border rounded-md p-3">
                  <label className="block text-editorial-text font-semibold mb-1.5">Disponibilidade</label>
                  <p className="text-editorial-muted text-[11px] mb-2">Ligue quando estiver disponível pra novas expedições — pode desligar e ligar de novo sempre que quiser, direto por aqui.</p>
                  <ToggleSwitch
                    checked={form.status === "disponivel"}
                    onChange={checked => setForm((p: any) => ({ ...p, status: checked ? "disponivel" : "indisponivel" }))}
                  />
                </div>
                <div className="text-xs bg-editorial-secondary/40 border border-editorial-border rounded-md p-3">
                  <label className="block text-editorial-text font-semibold mb-1.5">Agenda — datas indisponíveis</label>
                  <p className="text-editorial-muted text-[11px] mb-3">Bloqueie datas específicas (uma viagem já marcada, uma folga) sem precisar desligar a disponibilidade geral acima.</p>
                  <GuideAvailabilityCalendar value={form.unavailableDates} onChange={unavailableDates => setForm((p: any) => ({ ...p, unavailableDates }))} />
                </div>
                <ImageListEditor label="Galeria de Fotos (expedições, campo)" value={form.images} onChange={images => setForm((p: any) => ({ ...p, images }))} />
              </>
            )}

            <div className="flex items-center gap-3 pt-2 border-t border-editorial-border">
              <button
                type="submit" disabled={saving}
                className="bg-editorial-primary text-white text-xs uppercase tracking-widest font-bold px-5 py-2.5 rounded-md hover:opacity-90 transition disabled:opacity-60 cursor-pointer flex items-center gap-2"
              >
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar Alterações
              </button>
              {saved && <span className="text-emerald-700 text-xs font-semibold flex items-center gap-1"><Check className="h-4 w-4" /> Salvo!</span>}
            </div>
            {saveError && <p role="alert" className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-md">{saveError}</p>}
          </form>

          {pousadaTab === "editar-site" && previewPousada && (
            <div className="hidden xl:block xl:sticky xl:top-6">
              <div className="bg-white border border-editorial-border rounded-lg overflow-hidden shadow-sm">
                <div className="bg-editorial-secondary/50 border-b border-editorial-border px-4 py-2.5 flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-editorial-primary" />
                  <span className="text-[10px] uppercase tracking-widest font-bold text-editorial-primary">Pré-via ao vivo — como os visitantes vão ver</span>
                </div>
                {/* Isolado num boundary próprio: se algo no site oficial (galeria,
                    vídeo, depoimentos) quebrar, o formulário de edição ao lado
                    continua funcionando normalmente em vez de derrubar a
                    página inteira. */}
                <div className="h-[calc(100vh-160px)] overflow-y-auto">
                  <ErrorBoundary variant="section" sectionLabel="a pré-via">
                    <PousadaOfficialSite previewPousada={previewPousada} />
                  </ErrorBoundary>
                </div>
              </div>
            </div>
          )}
          </div>
          </ErrorBoundary>
        ) : null)}

        {/* Abas com fluxo de gravação próprio — ficam fora do <form> principal
            (PousadaProdutosManager tem um <form> interno e HTML não permite
            form aninhado). */}
        {profile?.partnerType === "pousada" && form && pousadaTab === "produtos" && (
          <ErrorBoundary variant="section" sectionLabel="o catálogo de produtos">
            <PousadaProdutosManager pousadaId={profile.partnerId} />
          </ErrorBoundary>
        )}
        {profile?.partnerType === "pousada" && form && pousadaTab === "recompensas" && (
          <ErrorBoundary variant="section" sectionLabel="as recompensas">
            <PousadaRecompensasManager pousadaId={profile.partnerId} />
          </ErrorBoundary>
        )}
        {profile?.partnerType === "pousada" && form && pousadaTab === "gestores" && (
          <ErrorBoundary variant="section" sectionLabel="os gestores">
            <PousadaGestoresManager pousadaId={profile.partnerId} pousadaName={profile.pousada?.name || ""} />
          </ErrorBoundary>
        )}

        {profile?.partnerType === "guia" && (
          <div className="mt-8">
            <ErrorBoundary variant="section" sectionLabel="a agenda de reservas">
              <PartnerBookingsCalendar partnerType="guia" partnerId={profile.partnerId} />
            </ErrorBoundary>
          </div>
        )}

        {!loadingGrants && grants.length > 0 && (
          <div className="mt-8 bg-white border border-editorial-border rounded-lg p-6">
            <h2 className="text-sm font-bold text-editorial-text mb-1">Apps Conectados</h2>
            <p className="text-editorial-muted text-xs mb-4">Aplicativos externos autorizados a entrar com sua conta EcoSafari.</p>
            <div className="space-y-2">
              {grants.map(g => (
                <div key={g.client.id} className="flex items-center justify-between gap-3 bg-editorial-secondary/40 border border-editorial-border rounded-md p-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {g.client.logo_uri ? (
                      <img src={g.client.logo_uri} alt={g.client.name} referrerPolicy="no-referrer" className="w-8 h-8 rounded object-cover border border-editorial-border flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-white border border-editorial-border flex items-center justify-center flex-shrink-0">
                        <ShieldCheck className="h-4 w-4 text-editorial-primary" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-editorial-text truncate">{g.client.name}</p>
                      <p className="text-[10px] text-editorial-muted">Conectado em {new Date(g.granted_at).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevokeGrant(g.client.id, g.client.name)}
                    disabled={revokingClientId === g.client.id}
                    className="text-red-600 hover:text-red-800 transition cursor-pointer flex-shrink-0 disabled:opacity-60"
                    title="Remover acesso"
                  >
                    {revokingClientId === g.client.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
