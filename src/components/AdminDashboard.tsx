import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp,
  DollarSign,
  Users,
  Building2,
  Calendar,
  Check,
  X,
  Plus,
  Trash2,
  Edit3,
  Search,
  UserCheck,
  ShieldCheck,
  Bell,
  Clock,
  Briefcase,
  Bird,
  BadgeCheck,
  Eye,
  KeyRound,
  ClipboardList,
  CalendarClock,
  History as HistoryIcon,
  Compass,
  MapPin,
  Handshake,
  PawPrint,
  Map as MapIcon,
  Lock,
  ScrollText,
  Package,
  Tag,
  Globe,
  type LucideIcon
} from "lucide-react";
import { Pousada, Guide, Booking, Notification, Species, GuideLanguage } from "../types";
import TurismoPanel from "./TurismoPanel";
import CandidaturasPanel from "./CandidaturasPanel";
import AdminUsersPanel from "./AdminUsersPanel";
import AdminAuditLogPanel from "./AdminAuditLogPanel";
import AtracoesPanel from "./AtracoesPanel";
import PartnerAccessManager from "./PartnerAccessManager";
import ReferralStatsWidget from "./ReferralStatsWidget";
import { adminFetch } from "../lib/adminFetch";
import ImageUploadButton from "./ImageUploadButton";
import TagInput from "./TagInput";
import ExperienceListEditor, { ExperienceDraft } from "./ExperienceListEditor";
import RoomsEditor, { RoomDraft } from "./RoomsEditor";
import ToggleSwitch from "./ToggleSwitch";
import LanguagesEditor, { LEVEL_LABELS } from "./LanguagesEditor";
import ImageListEditor from "./ImageListEditor";
import Pagination from "./Pagination";
import GuideAvailabilityCalendar from "./GuideAvailabilityCalendar";
import NewBookingForm from "./NewBookingForm";
import PousadaCalendarsPanel from "./PousadaCalendarsPanel";
import EcosystemAvailabilityPanel from "./EcosystemAvailabilityPanel";
import AdminConfiabilidadePanel from "./AdminConfiabilidadePanel";
import AdminLixeiraPanel from "./AdminLixeiraPanel";
import AdminYearCalendarPanel from "./AdminYearCalendarPanel";
import PacotesPanel from "./PacotesPanel";
import CoordinatesInput from "./CoordinatesInput";
import RemetenteEmailStatus from "./RemetenteEmailStatus";
import CuponsPanel from "./CuponsPanel";
import PedidosSitePanel from "./PedidosSitePanel";
import AppLodgeSelect from "./AppLodgeSelect";
import { usePagination } from "../lib/usePagination";
import AdminReservasTab from "./AdminReservasTab";
import AdminPousadasTab from "./AdminPousadasTab";
import AdminGuiasTab from "./AdminGuiasTab";
import AdminEspeciesTab from "./AdminEspeciesTab";
import AdminAgendaTab from "./AdminAgendaTab";

interface AdminDashboardProps {
  pousadas: Pousada[];
  species?: Species[];
  onRefreshData: () => void;
}

type AdminTab = "bookings" | "pousadas" | "guides" | "atracoes" | "agenda" | "history" | "species" | "turismo" | "candidaturas" | "admins" | "auditlog" | "lixeira" | "pacotes" | "cupons" | "pedidos-site";

// Drives the vertical sidebar nav — a single source of truth instead of one
// hand-written <button> per tab. Grouped into sections (rather than one flat
// list of 11) so the nav keeps reading cleanly as more partner types get
// added to the ecosystem over time — the same pattern big platforms
// (Stripe, Linear, Vercel) use once a sidebar outgrows ~6-7 flat items.
const ADMIN_TABS: { id: AdminTab; icon: LucideIcon; label: string; group: string }[] = [
  { id: "bookings", icon: ClipboardList, label: "Reservas & Confirmações", group: "Operação" },
  { id: "agenda", icon: CalendarClock, label: "Agenda Integrada", group: "Operação" },
  { id: "history", icon: HistoryIcon, label: "Histórico de Clientes", group: "Operação" },
  { id: "pacotes", icon: Package, label: "Pacotes", group: "Vendas" },
  { id: "cupons", icon: Tag, label: "Cupons", group: "Vendas" },
  { id: "pedidos-site", icon: Globe, label: "Pedidos de site", group: "Vendas" },
  { id: "pousadas", icon: Building2, label: "Pousadas", group: "Parceiros" },
  { id: "guides", icon: Compass, label: "Guias", group: "Parceiros" },
  { id: "atracoes", icon: MapPin, label: "Atrações", group: "Parceiros" },
  { id: "candidaturas", icon: Handshake, label: "Candidaturas", group: "Parceiros" },
  { id: "species", icon: PawPrint, label: "Espécies", group: "Conteúdo" },
  { id: "turismo", icon: MapIcon, label: "Turistas & Roteiros", group: "Conteúdo" },
  { id: "admins", icon: Lock, label: "Administradores", group: "Sistema" },
  { id: "auditlog", icon: ScrollText, label: "Log de Auditoria", group: "Sistema" },
  { id: "lixeira", icon: Trash2, label: "Lixeira", group: "Sistema" },
];
const ADMIN_TAB_GROUPS = ["Operação", "Vendas", "Parceiros", "Conteúdo", "Sistema"] as const;

const NOTIFICATION_ICONS: Record<Notification["type"], LucideIcon> = {
  booking_new: ClipboardList,
  payment_received: DollarSign,
  status_update: Bell,
  sighting_new: Bird,
};

// "há 2h", "há 3 dias" — short relative timestamps read better in a dense
// notification feed than a full date, and don't need a date-formatting
// library for something this simple.
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} dia${days > 1 ? "s" : ""}`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

export default function AdminDashboard({
  pousadas,
  species = [],
  onRefreshData
}: AdminDashboardProps) {
  // Notifications, full booking records (with customer name/email/phone) and
  // guides (with personal email/phone) are admin-only, fetched here with an
  // authenticated request instead of via the public App.tsx loader — guides
  // used to be fetched publicly by mistake, leaking every guide's contact
  // info to anyone opening the browser's network tab.
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);

  const fetchNotifications = async () => {
    try {
      const response = await adminFetch("/api/notifications");
      if (response.ok) setNotifications(await response.json());
    } catch (err) {
      console.error("Erro ao carregar notificações:", err);
    }
  };

  const fetchBookings = async () => {
    try {
      const response = await adminFetch("/api/bookings");
      if (response.ok) setBookings(await response.json());
    } catch (err) {
      console.error("Erro ao carregar reservas:", err);
    }
  };

  const fetchGuides = async () => {
    try {
      const response = await adminFetch("/api/guides");
      if (response.ok) setGuides(await response.json());
    } catch (err) {
      console.error("Erro ao carregar guias:", err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    fetchBookings();
    fetchGuides();
    // 15s (not the previous 6s) plus a background-tab pause is still fast
    // enough for an admin actively watching the dashboard, without doubling
    // load on every open admin tab left in a background browser tab.
    const interval = setInterval(() => {
      if (document.hidden) return;
      fetchNotifications();
      fetchBookings();
    }, 15000);
    return () => clearInterval(interval);
  }, []);
  const [activeTab, setActiveTab] = useState<AdminTab>("bookings");
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState<{ connected: boolean; email: string | null }>({ connected: false, email: null });

  // Detects rows matching the old hardcoded demo dataset's ids — a reliable
  // sign that some other deployment is still writing straight into this
  // Supabase project (see the comment on KNOWN_FAKE_IDS in server.ts).
  const [fakeDataCheck, setFakeDataCheck] = useState<{ clean: boolean; found: Record<string, string[]> } | null>(null);
  const [checkingFakeData, setCheckingFakeData] = useState(false);
  const [purgingFakeData, setPurgingFakeData] = useState(false);

  const fetchFakeDataCheck = async () => {
    setCheckingFakeData(true);
    try {
      const response = await adminFetch("/api/integrity/fake-data-check");
      if (response.ok) setFakeDataCheck(await response.json());
    } catch (err) {
      console.error("Erro ao verificar dados fake:", err);
    } finally {
      setCheckingFakeData(false);
    }
  };

  const handlePurgeFakeData = async () => {
    if (!window.confirm("Confirma apagar esses registros? Essa ação não pode ser desfeita.")) return;
    setPurgingFakeData(true);
    try {
      const response = await adminFetch("/api/integrity/purge-fake-data", { method: "POST" });
      if (response.ok) await fetchFakeDataCheck();
    } catch (err) {
      console.error("Erro ao limpar dados fake:", err);
    } finally {
      setPurgingFakeData(false);
    }
  };

  const fetchGoogleCalendarStatus = async () => {
    try {
      const response = await adminFetch("/api/auth/google/status");
      if (response.ok) {
        const data = await response.json();
        setGoogleCalendarStatus(data);
      }
    } catch (err) {
      console.error("Erro ao carregar status do Google Calendar:", err);
    }
  };

  // Runs once on mount rather than gated behind a tab — a stale/rogue
  // deployment writing fake data is worth surfacing proactively (see the
  // banner near the top of the dashboard below), not something an admin
  // should have to remember to go check manually.
  useEffect(() => {
    fetchGoogleCalendarStatus();
    fetchFakeDataCheck();
  }, []);

  // Notifications management
  const unreadNotifications = notifications.filter(n => !n.read);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const [notifReadFilter, setNotifReadFilter] = useState<"todas" | "nao_lidas" | "lidas">("todas");
  const [notifSort, setNotifSort] = useState<"recentes" | "antigas">("recentes");
  const [notifDateFilter, setNotifDateFilter] = useState(""); // yyyy-mm-dd, vazio = todas as datas
  const visibleNotifications = notifications
    .filter(n => notifReadFilter === "todas" ? true : notifReadFilter === "nao_lidas" ? !n.read : n.read)
    .filter(n => !notifDateFilter || n.timestamp.slice(0, 10) === notifDateFilter)
    .sort((a, b) => {
      const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      return notifSort === "recentes" ? diff : -diff;
    });

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) setShowNotifications(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Edit Pousada modal state
  const [editingPousadaId, setEditingPousadaId] = useState<string | null>(null);
  const [editPousadaForm, setEditPousadaForm] = useState({
    name: "",
    description: "",
    longDescription: "",
    location: "",
    pricePerNight: 0,
    capacity: 1,
    features: [] as string[],
    activities: [] as string[],
    experiences: [] as ExperienceDraft[],
    images: [] as string[],
    officialSiteImages: [] as string[],
    videoUrl: "",
    officialSiteUrl: "",
    rooms: [] as RoomDraft[],
    latitude: null as number | null,
    longitude: null as number | null,
    emailRemetente: "",
    emailRemetenteNome: "",
    emailContato: "",
    customDomain: "",
    sitePublicado: false,
    appLodgeId: ""
  });
  const [remetenteReload, setRemetenteReload] = useState(0);

  const handleEditPousadaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPousadaId) return;
    try {
      const payload = {
        name: editPousadaForm.name,
        description: editPousadaForm.description,
        longDescription: editPousadaForm.longDescription,
        location: editPousadaForm.location,
        pricePerNight: Number(editPousadaForm.pricePerNight),
        capacity: Number(editPousadaForm.capacity),
        features: editPousadaForm.features,
        activities: editPousadaForm.activities,
        experiences: editPousadaForm.experiences
          .filter(exp => exp.title.trim())
          .map(exp => ({ ...exp, title: exp.title.trim(), description: exp.description || `Expedição de ${exp.title.trim()}`, price: exp.price || 0 })),
        images: editPousadaForm.images.map(i => i.trim()).filter(Boolean),
        officialSiteImages: editPousadaForm.officialSiteImages.map(i => i.trim()).filter(Boolean),
        videoUrl: editPousadaForm.videoUrl.trim() || undefined,
        officialSiteUrl: editPousadaForm.officialSiteUrl.trim() || undefined,
        rooms: editPousadaForm.rooms.filter(r => r.type.trim()),
        latitude: editPousadaForm.latitude,
        longitude: editPousadaForm.longitude,
        // String vazia de propósito: limpar o campo volta ao remetente da plataforma.
        emailRemetente: editPousadaForm.emailRemetente.trim().toLowerCase(),
        emailRemetenteNome: editPousadaForm.emailRemetenteNome.trim(),
        emailContato: editPousadaForm.emailContato.trim().toLowerCase(),
        customDomain: editPousadaForm.customDomain.trim(),
        sitePublicado: editPousadaForm.sitePublicado,
        appLodgeId: editPousadaForm.appLodgeId
      };

      const response = await adminFetch(`/api/pousadas/${editingPousadaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {

        setEditingPousadaId(null);
        onRefreshData();
      }
    } catch (err) {
      console.error(err);
    }
  };
  const [managingGuideAccess, setManagingGuideAccess] = useState<Guide | null>(null);
  const [managingPousadaAccess, setManagingPousadaAccess] = useState<Pousada | null>(null);

  // Calculate high-fidelity dashboard metrics
  const totalRevenue = bookings
    .filter(b => b.status === "pago" || b.status === "confirmado_pousada" || b.status === "confirmado_guia" || b.status === "confirmado_total")
    .reduce((sum, b) => sum + b.totalPrice, 0);

  const pendingConfirmation = bookings.filter(b => b.status === "pago" || b.status === "confirmado_pousada" || b.status === "confirmado_guia").length;

  const activeReservationsCount = bookings.filter(b => b.status !== "cancelado").length;

  // Mark notification as read
  const handleMarkNotificationRead = async (id: string) => {
    try {
      await adminFetch(`/api/notifications/${id}/read`, { method: "POST" });
      onRefreshData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div id="admin-panel" className="bg-editorial-bg min-h-screen py-8 text-editorial-text font-sans">

      {/* Edit Pousada modal */}
      {editingPousadaId && (() => {
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <form
              onSubmit={handleEditPousadaSubmit}
              className="bg-white border border-zinc-200 rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-8 space-y-6"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
                <h3 className="font-bold text-lg text-zinc-900">Editar Pousada</h3>
                <button aria-label="Fechar"
                  type="button"
                  onClick={() => setEditingPousadaId(null)}
                  className="text-zinc-400 hover:text-zinc-700 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                <div>
                  <label className="block text-zinc-700 font-semibold mb-1.5">Nome da Pousada</label>
                  <input
                    type="text"
                    value={editPousadaForm.name}
                    onChange={e => setEditPousadaForm(prev => ({ ...prev, name: e.target.value }))}
                    required
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 font-semibold mb-1.5">Localização (Bioma/Estado)</label>
                  <input
                    type="text"
                    value={editPousadaForm.location}
                    onChange={e => setEditPousadaForm(prev => ({ ...prev, location: e.target.value }))}
                    required
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <CoordinatesInput
                key={editingPousadaId || "nova"}
                latitude={editPousadaForm.latitude}
                longitude={editPousadaForm.longitude}
                onChange={pos => setEditPousadaForm(prev => ({ ...prev, ...pos }))}
              />

              <fieldset className="border border-zinc-200 rounded-lg p-3 space-y-2 text-xs">
                <legend className="px-1 font-semibold text-zinc-700">E-mails de reserva ao hóspede</legend>
                <p className="text-[11px] text-zinc-500">
                  Padrão: saem do domínio do EcoSafari como "{editPousadaForm.name || "Pousada"} via EcoSafari", e as respostas vão para o e-mail de contato abaixo.
                </p>
                <div>
                  <label htmlFor="remetente-contato" className="block text-zinc-700 font-semibold mb-1">E-mail para respostas dos hóspedes</label>
                  <input
                    id="remetente-contato"
                    type="email"
                    placeholder="contato@pousada.com.br"
                    value={editPousadaForm.emailContato}
                    onChange={e => setEditPousadaForm(prev => ({ ...prev, emailContato: e.target.value }))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 pt-1">
                  Domínio próprio (opcional): preencha só depois de verificar o domínio da pousada no Resend (resend.com → Domains). Se não estiver verificado, o envio volta sozinho ao padrão.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="remetente-email" className="block text-zinc-700 font-semibold mb-1">Endereço</label>
                    <input
                      id="remetente-email"
                      type="email"
                      placeholder="reservas@pousadavagalume.com"
                      value={editPousadaForm.emailRemetente}
                      onChange={e => setEditPousadaForm(prev => ({ ...prev, emailRemetente: e.target.value }))}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="remetente-nome" className="block text-zinc-700 font-semibold mb-1">Nome exibido</label>
                    <input
                      id="remetente-nome"
                      type="text"
                      maxLength={80}
                      placeholder={editPousadaForm.name || "Nome da pousada"}
                      value={editPousadaForm.emailRemetenteNome}
                      onChange={e => setEditPousadaForm(prev => ({ ...prev, emailRemetenteNome: e.target.value }))}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                {editingPousadaId && <RemetenteEmailStatus pousadaId={editingPousadaId} reloadKey={remetenteReload} />}
              </fieldset>

              <fieldset className="border border-zinc-200 rounded-lg p-3 space-y-2 text-xs">
                <legend className="px-1 font-semibold text-zinc-700">Site oficial e app</legend>
                <AppLodgeSelect value={editPousadaForm.appLodgeId} onChange={id => setEditPousadaForm(prev => ({ ...prev, appLodgeId: id }))} />
                <label className="flex items-center gap-2 font-semibold text-zinc-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editPousadaForm.sitePublicado}
                    onChange={e => setEditPousadaForm(prev => ({ ...prev, sitePublicado: e.target.checked }))}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  Site criado pela equipe e publicado
                </label>
                <p className="text-[11px] text-zinc-500">Ligado: o site aparece no catálogo ("Ver site oficial") e o parceiro pode ajustar textos e fotos. Desligado: o portal mostra a oferta do serviço.</p>
                <label htmlFor="custom-domain" className="block text-zinc-700 font-semibold pt-2">Domínio próprio (opcional)</label>
                <input
                  id="custom-domain"
                  type="text"
                  inputMode="url"
                  placeholder="pousadavagalume.com"
                  value={editPousadaForm.customDomain}
                  onChange={e => setEditPousadaForm(prev => ({ ...prev, customDomain: e.target.value }))}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-zinc-500">
                  Só o endereço, sem http nem www. O domínio passa a abrir o site oficial desta pousada; reserva, cadastro e pagamento continuam no EcoSafari. Antes, adicione o domínio na Vercel (Settings → Domains) e aponte o DNS — passo a passo no RUNBOOK.md.
                </p>
              </fieldset>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                <div>
                  <label className="block text-zinc-700 font-semibold mb-1.5">Preço da Diária (R$)</label>
                  <input
                    type="number"
                    value={editPousadaForm.pricePerNight}
                    onChange={e => setEditPousadaForm(prev => ({ ...prev, pricePerNight: Number(e.target.value) }))}
                    required
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 font-semibold mb-1.5">Capacidade Máxima</label>
                  <input
                    type="number"
                    value={editPousadaForm.capacity}
                    onChange={e => setEditPousadaForm(prev => ({ ...prev, capacity: Number(e.target.value) }))}
                    required
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block text-zinc-700 font-semibold mb-1.5">Descrição Curta</label>
                <input
                  type="text"
                  value={editPousadaForm.description}
                  onChange={e => setEditPousadaForm(prev => ({ ...prev, description: e.target.value }))}
                  required
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="text-xs">
                <label className="block text-zinc-700 font-semibold mb-1.5">Descrição Completa (página de detalhes)</label>
                <textarea
                  value={editPousadaForm.longDescription}
                  onChange={e => setEditPousadaForm(prev => ({ ...prev, longDescription: e.target.value }))}
                  rows={4}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              {/* Images — shown in the catalog's detail view (visão detalhada) */}
              <ImageListEditor
                label="Imagens (visão detalhada do catálogo)"
                value={editPousadaForm.images}
                onChange={images => setEditPousadaForm(prev => ({ ...prev, images }))}
              />

              {/* Independent gallery for the /site/:slug official site page —
                  falls back to the images above when left empty, so this is
                  optional, not a second copy of the same list. */}
              <ImageListEditor
                label="Fotos do Site Oficial (opcional — se vazio, usa as imagens acima)"
                value={editPousadaForm.officialSiteImages}
                onChange={officialSiteImages => setEditPousadaForm(prev => ({ ...prev, officialSiteImages }))}
                emptyHint="Nenhuma foto exclusiva — o Site Oficial vai usar as imagens da visão detalhada."
              />

              <div className="text-xs">
                <label className="block text-zinc-700 font-semibold mb-1.5">Estrutura & Comodidades</label>
                <TagInput
                  value={editPousadaForm.features}
                  onChange={features => setEditPousadaForm(prev => ({ ...prev, features }))}
                  placeholder="Digite e pressione Enter (ex: Wi-Fi)"
                />
              </div>

              <div className="text-xs">
                <label className="block text-zinc-700 font-semibold mb-1.5">Atividades Inclusas</label>
                <TagInput
                  value={editPousadaForm.activities}
                  onChange={activities => setEditPousadaForm(prev => ({ ...prev, activities }))}
                  placeholder="Digite e pressione Enter (ex: Safári)"
                />
              </div>

              <div className="text-xs">
                <label className="block text-zinc-700 font-semibold mb-1.5">Experiências Pagas</label>
                <ExperienceListEditor
                  value={editPousadaForm.experiences}
                  onChange={experiences => setEditPousadaForm(prev => ({ ...prev, experiences }))}
                  withProvider
                />
              </div>

              <div className="text-xs">
                <label className="block text-zinc-700 font-semibold mb-1.5">Quartos</label>
                <RoomsEditor
                  value={editPousadaForm.rooms}
                  onChange={rooms => setEditPousadaForm(prev => ({ ...prev, rooms }))}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                <div>
                  <label className="block text-zinc-700 font-semibold mb-1.5">Link do Vídeo (opcional)</label>
                  <input
                    type="text"
                    value={editPousadaForm.videoUrl}
                    onChange={e => setEditPousadaForm(prev => ({ ...prev, videoUrl: e.target.value }))}
                    placeholder="https://..."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 font-semibold mb-1.5">Site Oficial / Rede Social (opcional)</label>
                  <input
                    type="text"
                    value={editPousadaForm.officialSiteUrl}
                    onChange={e => setEditPousadaForm(prev => ({ ...prev, officialSiteUrl: e.target.value }))}
                    placeholder="https://instagram.com/..."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2 text-xs border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setEditingPousadaId(null)}
                  className="bg-zinc-100 text-zinc-700 px-4 py-2.5 rounded-lg font-semibold hover:bg-zinc-200 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-bold transition shadow-sm"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        );
      })()}

      <div className="max-w-7xl mx-auto px-6">

        {/* Fake-data integrity alert — only rendered when something's
            actually wrong, so it stays invisible day-to-day. Flags rows
            matching the old hardcoded demo dataset's ids (see KNOWN_FAKE_IDS
            in server.ts), a reliable sign some other deployment is still
            writing straight into this Supabase project. */}
        {fakeDataCheck && !fakeDataCheck.clean && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-xs">
            <p className="text-red-800 font-semibold mb-2">
              Encontrados registros com os IDs do antigo dataset de demonstração — provavelmente um deploy antigo ainda gravando dado fake direto no banco:
            </p>
            <ul className="font-mono text-red-700 space-y-0.5 mb-3">
              {Object.entries(fakeDataCheck.found).map(([table, ids]) => (
                <li key={table}>{table}: {ids.join(", ")}</li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePurgeFakeData}
                disabled={purgingFakeData}
                className="bg-red-600 hover:bg-red-700 text-white text-[11px] uppercase tracking-widest font-bold px-3 py-2 rounded-md transition disabled:opacity-60 cursor-pointer"
              >
                {purgingFakeData ? "Removendo..." : "Remover esses registros"}
              </button>
              <button
                onClick={fetchFakeDataCheck}
                disabled={checkingFakeData}
                className="text-red-700 hover:text-red-900 text-[11px] font-semibold underline transition disabled:opacity-60 cursor-pointer"
              >
                {checkingFakeData ? "Verificando..." : "Verificar novamente"}
              </button>
            </div>
          </div>
        )}

        {/* Header Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 border-b border-zinc-200 pb-5">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 tracking-tight flex items-center gap-2">
              <Building2 className="h-5 w-5 text-editorial-primary" /> Painel de Controle EcoSafari
            </h1>
            <p className="text-zinc-500 text-xs mt-1">Gestão de pousadas parceiras, guias turísticos, alocação de equipe e agenda de reservas.</p>
          </div>

          {/* Notification bell — opens a popup instead of a permanent
              on-page panel, so notifications don't take up space until the
              admin actually wants to see them. */}
          <div className="relative" ref={notificationsRef}>
            <button
              onClick={() => setShowNotifications(prev => !prev)}
              className="relative bg-white border border-zinc-200 p-2.5 rounded-lg flex items-center hover:border-zinc-300 hover:bg-zinc-50 transition-colors cursor-pointer"
              title="Notificações"
            >
              <Bell className="h-4 w-4 text-zinc-500" />
              {unreadNotifications.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                  {unreadNotifications.length}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white border border-zinc-200 rounded-xl shadow-lg z-30">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200">
                  <h3 className="font-semibold text-sm text-zinc-900 flex items-center gap-2">
                    <Bell className="h-4 w-4 text-zinc-400" /> Notificações
                  </h3>
                  {unreadNotifications.length > 0 && (
                    <span className="text-[10px] uppercase tracking-wider font-bold text-editorial-primary bg-editorial-secondary px-2 py-0.5 rounded-full">
                      {unreadNotifications.length} não lida{unreadNotifications.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Filtros: status de leitura, ordenação por data e uma data
                    específica — tudo client-side, a lista completa já veio
                    do /api/notifications. */}
                <div className="px-5 py-2.5 border-b border-zinc-100 space-y-2">
                  <div className="flex items-center gap-1">
                    {([
                      { id: "todas", label: "Todas" },
                      { id: "nao_lidas", label: "Não lidas" },
                      { id: "lidas", label: "Lidas" },
                    ] as const).map(f => (
                      <button
                        key={f.id}
                        onClick={() => setNotifReadFilter(f.id)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-full border transition cursor-pointer ${
                          notifReadFilter === f.id
                            ? "bg-editorial-primary text-white border-editorial-primary"
                            : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={notifSort}
                      onChange={e => setNotifSort(e.target.value as "recentes" | "antigas")}
                      className="text-[10px] font-semibold text-zinc-600 border border-zinc-200 rounded px-1.5 py-1 cursor-pointer"
                    >
                      <option value="recentes">Mais recentes primeiro</option>
                      <option value="antigas">Mais antigas primeiro</option>
                    </select>
                    <input
                      type="date"
                      value={notifDateFilter}
                      onChange={e => setNotifDateFilter(e.target.value)}
                      className="text-[10px] font-semibold text-zinc-600 border border-zinc-200 rounded px-1.5 py-1 cursor-pointer"
                      title="Filtrar por data"
                    />
                    {notifDateFilter && (
                      <button
                        onClick={() => setNotifDateFilter("")}
                        className="text-[10px] text-zinc-400 hover:text-editorial-primary cursor-pointer"
                      >
                        limpar data
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {visibleNotifications.length === 0 ? (
                    <p className="text-zinc-400 text-xs px-5 py-6 text-center">
                      {notifications.length === 0 ? "Nenhuma notificação ainda." : "Nenhuma notificação encontrada com esses filtros."}
                    </p>
                  ) : (
                    visibleNotifications.map((notif) => {
                      const Icon = NOTIFICATION_ICONS[notif.type] || Bell;
                      return (
                        <div
                          key={notif.id}
                          className={`flex items-start gap-3 px-5 py-3 border-b border-zinc-100 last:border-none transition-colors ${notif.read ? "" : "bg-editorial-secondary/30"}`}
                        >
                          <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${notif.read ? "text-zinc-300" : "text-editorial-primary"}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs leading-relaxed ${notif.read ? "text-zinc-500" : "text-zinc-900 font-medium"}`}>{notif.message}</p>
                            <span className="text-[10px] text-zinc-400 mt-0.5 block">{formatRelativeTime(notif.timestamp)}</span>
                          </div>
                          {!notif.read && (
                            <button
                              onClick={() => handleMarkNotificationRead(notif.id)}
                              className="text-[10px] font-semibold text-zinc-400 hover:text-editorial-primary transition cursor-pointer flex-shrink-0"
                            >
                              Marcar como lida
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* METRICS ROW */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">

          <div className="bg-white border border-zinc-200 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-zinc-500 text-xs block">Faturamento Reservas</span>
              <span className="text-xl font-semibold text-zinc-900 mt-1 block">R$ {totalRevenue.toLocaleString('pt-BR')}</span>
            </div>
            <div className="bg-zinc-50 text-editorial-primary rounded-full p-2.5">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>

          <div className="bg-white border border-zinc-200 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-zinc-500 text-xs block">Reservas Ativas</span>
              <span className="text-xl font-semibold text-zinc-900 mt-1 block">{activeReservationsCount} registradas</span>
            </div>
            <div className="bg-zinc-50 text-zinc-400 rounded-full p-2.5">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>

          <div className="bg-white border border-zinc-200 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-zinc-500 text-xs block">Pousadas Parceiras</span>
              <span className="text-xl font-semibold text-zinc-900 mt-1 block">{pousadas.length} ativas</span>
            </div>
            <div className="bg-zinc-50 text-zinc-400 rounded-full p-2.5">
              <Building2 className="h-4 w-4" />
            </div>
          </div>

          <div className="bg-white border border-zinc-200 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-zinc-500 text-xs block">Aguardando Aprovação</span>
              <span className="text-xl font-semibold text-amber-700 mt-1 block">{pendingConfirmation} de reservas</span>
            </div>
            <div className="bg-amber-50 text-amber-600 rounded-full p-2.5">
              <Clock className="h-4 w-4" />
            </div>
          </div>

        </div>

        {/* Referral source stats */}
        <div className="mb-8">
          <ReferralStatsWidget />
        </div>

        {/* Sidebar nav (left, vertical) + tab content (right) */}
        <div className="flex flex-col md:flex-row gap-8 items-start">

        {/* NAVIGATION SIDEBAR */}
        <aside className="w-full md:w-56 flex-shrink-0 md:sticky md:top-6">
          <nav className="flex md:flex-col overflow-x-auto md:overflow-visible gap-1 md:gap-4 bg-white border border-zinc-200 md:border-0 md:bg-transparent rounded-lg md:rounded-none p-2 md:p-0">
            {ADMIN_TAB_GROUPS.map(group => {
              const tabs = ADMIN_TABS.filter(t => t.group === group);
              if (tabs.length === 0) return null;
              return (
                <div key={group} className="md:flex md:flex-col md:gap-0.5">
                  <span className="hidden md:block text-[10px] uppercase tracking-wider font-semibold text-zinc-400 px-3 mb-1.5">{group}</span>
                  {tabs.map(tab => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`relative text-left text-[13px] whitespace-nowrap px-3 py-2 rounded-md transition-colors duration-150 flex items-center gap-2.5 cursor-pointer border-l-2 ${
                          active
                            ? "bg-zinc-100 text-zinc-900 font-medium border-editorial-primary"
                            : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 border-transparent"
                        }`}
                      >
                        <Icon className={`h-4 w-4 flex-shrink-0 ${active ? "text-editorial-primary" : "text-zinc-400"}`} />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* TAB CONTENT */}
        <div className="flex-1 min-w-0 w-full space-y-6">

        {/* TAB: TURISTAS, ROTEIROS, RESERVAS, PAGAMENTOS, GUIAS (camada adicional) */}
        {activeTab === "turismo" && <TurismoPanel />}

        {/* TAB: CANDIDATURAS DE PARCEIROS (cadastro público /seja-parceiro) */}
        {activeTab === "candidaturas" && <CandidaturasPanel />}

        {/* TAB: ATRAÇÕES (Paradas Legais / Restaurantes) */}
        {activeTab === "atracoes" && <AtracoesPanel />}

        {/* TAB: GESTÃO DE ADMINISTRADORES (Supabase Auth) */}
        {activeTab === "admins" && <AdminUsersPanel />}
        {activeTab === "auditlog" && <AdminAuditLogPanel />}
        {activeTab === "lixeira" && <AdminLixeiraPanel />}
        {activeTab === "pacotes" && <PacotesPanel pousadas={pousadas} guides={guides} />}
        {activeTab === "cupons" && <CuponsPanel pousadas={pousadas} />}
        {activeTab === "pedidos-site" && <PedidosSitePanel />}

        {/* TAB 1: RESERVAS & CONFIRMAÇÕES */}
        {activeTab === "bookings" && <AdminReservasTab pousadas={pousadas} onRefreshData={onRefreshData} fetchBookings={fetchBookings} guides={guides} bookings={bookings} />}

        {/* TAB 2: POUSADAS CRUD */}
        {activeTab === "pousadas" && <AdminPousadasTab pousadas={pousadas} onRefreshData={onRefreshData} setManagingPousadaAccess={setManagingPousadaAccess} setEditingPousadaId={setEditingPousadaId} setEditPousadaForm={setEditPousadaForm} />}

        {/* TAB 3: GUIAS CRUD */}
        {activeTab === "guides" && <AdminGuiasTab guides={guides} setManagingGuideAccess={setManagingGuideAccess} fetchGuides={fetchGuides} />}

        {/* TAB 4: AGENDA INTEGRADA */}
        {activeTab === "agenda" && <AdminAgendaTab pousadas={pousadas} onRefreshData={onRefreshData} googleCalendarStatus={googleCalendarStatus} bookings={bookings} fetchGoogleCalendarStatus={fetchGoogleCalendarStatus} />}

        {/* TAB 5: HISTÓRICO DE CLIENTES */}
        {activeTab === "history" && (
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <h3 className="font-extrabold text-zinc-900 text-lg mb-1 flex items-center gap-1.5"><Users className="h-5 w-5 text-emerald-700" /> Histórico Consolidado de Clientes</h3>
              <p className="text-zinc-500 text-xs">Dados centralizados de todos os clientes que já realizaram orçamentos ou reservas.</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-100 text-zinc-500 uppercase font-bold border-b border-zinc-200 text-[10px] tracking-wider">
                    <th className="p-4">Explorador</th>
                    <th className="p-4">Origem</th>
                    <th className="p-4">N° de Viagens</th>
                    <th className="p-4">Gasto Total</th>
                    <th className="p-4">Alergias / Restrições</th>
                    <th className="p-4">Status Última Reserva</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {/* Derive unique clients by email */}
                  {Array.from(new Set(bookings.map(b => b.customerEmail))).map(email => {
                    const clientBookings = bookings.filter(b => b.customerEmail === email);
                    const lastBooking = clientBookings[clientBookings.length - 1];
                    const totalSpent = clientBookings.reduce((sum, b) => sum + b.totalPrice, 0);

                    return (
                      <tr key={email}>
                        <td className="p-4">
                          <span className="font-bold text-zinc-950 block">{lastBooking.customerName}</span>
                          <span className="text-zinc-500 text-[10px] block">{email}</span>
                        </td>
                        <td className="p-4 font-medium text-zinc-600">
                          {lastBooking.nationality}
                        </td>
                        <td className="p-4 font-extrabold text-zinc-800">
                          {clientBookings.length} {clientBookings.length === 1 ? 'viagem' : 'viagens'}
                        </td>
                        <td className="p-4 font-extrabold text-emerald-800">
                          R$ {totalSpent.toLocaleString('pt-BR')}
                        </td>
                        <td className="p-4 text-zinc-600">
                          {lastBooking.dietaryRestrictions || "Nenhuma"}
                        </td>
                        <td className="p-4">
                          <span className="bg-zinc-100 border border-zinc-200 text-zinc-700 px-2 py-0.5 rounded font-bold">
                            {lastBooking.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 7: SPECIES CRUD */}
        {activeTab === "species" && <AdminEspeciesTab species={species} pousadas={pousadas} onRefreshData={onRefreshData} />}

        </div>
        {/* end TAB CONTENT */}

        </div>
        {/* end sidebar + content flex wrapper */}

      </div>

      {managingGuideAccess && (
        <PartnerAccessManager
          partnerType="guia"
          partnerId={managingGuideAccess.id}
          partnerLabel={managingGuideAccess.name}
          onClose={() => setManagingGuideAccess(null)}
        />
      )}
      {managingPousadaAccess && (
        <PartnerAccessManager
          partnerType="pousada"
          partnerId={managingPousadaAccess.id}
          partnerLabel={managingPousadaAccess.name}
          onClose={() => setManagingPousadaAccess(null)}
        />
      )}
    </div>
  );
}
