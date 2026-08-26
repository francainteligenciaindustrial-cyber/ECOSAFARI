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
import { usePagination } from "../lib/usePagination";

interface AdminDashboardProps {
  pousadas: Pousada[];
  species?: Species[];
  onRefreshData: () => void;
}

type AdminTab = "bookings" | "pousadas" | "guides" | "atracoes" | "agenda" | "history" | "species" | "turismo" | "candidaturas" | "admins" | "auditlog";

// Drives the vertical sidebar nav — a single source of truth instead of one
// hand-written <button> per tab. Grouped into sections (rather than one flat
// list of 11) so the nav keeps reading cleanly as more partner types get
// added to the ecosystem over time — the same pattern big platforms
// (Stripe, Linear, Vercel) use once a sidebar outgrows ~6-7 flat items.
const ADMIN_TABS: { id: AdminTab; icon: LucideIcon; label: string; group: string }[] = [
  { id: "bookings", icon: ClipboardList, label: "Reservas & Confirmações", group: "Operação" },
  { id: "agenda", icon: CalendarClock, label: "Agenda Integrada", group: "Operação" },
  { id: "history", icon: HistoryIcon, label: "Histórico de Clientes", group: "Operação" },
  { id: "pousadas", icon: Building2, label: "Pousadas", group: "Parceiros" },
  { id: "guides", icon: Compass, label: "Guias", group: "Parceiros" },
  { id: "atracoes", icon: MapPin, label: "Atrações", group: "Parceiros" },
  { id: "candidaturas", icon: Handshake, label: "Candidaturas", group: "Parceiros" },
  { id: "species", icon: PawPrint, label: "Espécies", group: "Conteúdo" },
  { id: "turismo", icon: MapIcon, label: "Turistas & Roteiros", group: "Conteúdo" },
  { id: "admins", icon: Lock, label: "Administradores", group: "Sistema" },
  { id: "auditlog", icon: ScrollText, label: "Log de Auditoria", group: "Sistema" },
];
const ADMIN_TAB_GROUPS = ["Operação", "Parceiros", "Conteúdo", "Sistema"] as const;

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
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddPousada, setShowAddPousada] = useState(false);
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [showAddGuide, setShowAddGuide] = useState(false);
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

  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);

  // Both now go through adminFetch (an authenticated call) instead of a
  // plain <a href> — the backend route requires an admin session, since an
  // unauthenticated GET here used to let anyone hijack or drop the site's
  // Google Calendar connection.
  const handleConnectGoogleCalendar = async () => {
    setConnectingGoogle(true);
    try {
      const response = await adminFetch("/api/auth/google");
      const data = await response.json();
      if (response.ok && data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        alert(data.error || "Erro ao iniciar conexão com o Google Calendar.");
      }
    } catch (err) {
      console.error("Erro ao iniciar conexão com o Google Calendar:", err);
    } finally {
      setConnectingGoogle(false);
    }
  };

  const handleDisconnectGoogleCalendar = async () => {
    setDisconnectingGoogle(true);
    try {
      const response = await adminFetch("/api/auth/google/disconnect", { method: "POST" });
      if (response.ok) await fetchGoogleCalendarStatus();
    } catch (err) {
      console.error("Erro ao desconectar Google Calendar:", err);
    } finally {
      setDisconnectingGoogle(false);
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

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) setShowNotifications(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Forms States
  const [pousadaForm, setPousadaForm] = useState({
    name: "",
    description: "",
    longDescription: "",
    location: "",
    pricePerNight: 1500,
    features: ["Wi-Fi", "Piscina", "Ar Condicionado"] as string[],
    activities: ["Safári", "Trilha Noturna"] as string[],
    experiences: [{ title: "Safári Onça-Pintada", price: 300 }, { title: "Observação de Aves", price: 150 }] as ExperienceDraft[],
    capacity: 10,
    images: "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=800&q=80",
    videoUrl: "",
    rooms: [] as RoomDraft[]
  });

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
    rooms: [] as RoomDraft[]
  });

  const openEditPousada = (p: Pousada) => {
    setEditingPousadaId(p.id);
    setEditPousadaForm({
      name: p.name,
      description: p.description,
      longDescription: p.longDescription || "",
      location: p.location,
      pricePerNight: p.pricePerNight,
      capacity: p.capacity,
      features: [...(p.features || [])],
      activities: [...(p.activities || [])],
      experiences: (p.experiences || []).map(e => ({ title: e.title, price: e.price })),
      images: [...(p.images || [])],
      officialSiteImages: [...(p.officialSiteImages || [])],
      videoUrl: p.videoUrl || "",
      officialSiteUrl: p.officialSiteUrl || "",
      rooms: [...(p.rooms || [])]
    });
  };

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
          .map(exp => ({ title: exp.title.trim(), description: `Expedição de ${exp.title.trim()}`, price: exp.price || 0 })),
        images: editPousadaForm.images.map(i => i.trim()).filter(Boolean),
        officialSiteImages: editPousadaForm.officialSiteImages.map(i => i.trim()).filter(Boolean),
        videoUrl: editPousadaForm.videoUrl.trim() || undefined,
        officialSiteUrl: editPousadaForm.officialSiteUrl.trim() || undefined,
        rooms: editPousadaForm.rooms.filter(r => r.type.trim())
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

  const [guideForm, setGuideForm] = useState({
    name: "",
    email: "",
    phone: "",
    languages: [{ language: "Português", level: "avancado" }, { language: "Inglês", level: "intermediario" }] as GuideLanguage[],
    specialty: ["Fotografia", "Rastreamento"] as string[],
    status: "disponivel" as "disponivel" | "indisponivel",
    bio: "",
    age: "",
    birthplace: "",
    interests: [] as string[],
    photoUrl: "",
    images: [] as string[]
  });

  // Edit Guide modal state
  const [editingGuideId, setEditingGuideId] = useState<string | null>(null);
  const [managingGuideAccess, setManagingGuideAccess] = useState<Guide | null>(null);
  const [managingPousadaAccess, setManagingPousadaAccess] = useState<Pousada | null>(null);
  const [editGuideForm, setEditGuideForm] = useState({
    name: "",
    email: "",
    phone: "",
    languages: [] as GuideLanguage[],
    specialty: [] as string[],
    status: "disponivel" as "disponivel" | "indisponivel",
    bio: "",
    age: "",
    birthplace: "",
    interests: [] as string[],
    photoUrl: "",
    images: [] as string[],
    unavailableDates: [] as string[]
  });

  const openEditGuide = (g: Guide) => {
    setEditingGuideId(g.id);
    setEditGuideForm({
      name: g.name,
      email: g.email,
      phone: g.phone,
      languages: [...(g.languages || [])],
      specialty: [...(g.specialty || [])],
      status: g.status,
      bio: g.bio || "",
      age: g.age ? String(g.age) : "",
      birthplace: g.birthplace || "",
      interests: [...(g.interests || [])],
      photoUrl: g.photoUrl || "",
      images: [...(g.images || [])],
      unavailableDates: [...(g.unavailableDates || [])]
    });
  };

  const handleEditGuideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGuideId) return;
    const payload = {
      name: editGuideForm.name,
      email: editGuideForm.email,
      phone: editGuideForm.phone,
      languages: editGuideForm.languages,
      specialty: editGuideForm.specialty,
      photoUrl: editGuideForm.photoUrl,
      status: editGuideForm.status,
      bio: editGuideForm.bio,
      age: editGuideForm.age ? Number(editGuideForm.age) : undefined,
      birthplace: editGuideForm.birthplace,
      interests: editGuideForm.interests,
      images: editGuideForm.images,
      unavailableDates: editGuideForm.unavailableDates
    };
    const response = await adminFetch(`/api/guides/${editingGuideId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      setEditingGuideId(null);
      fetchGuides();
    }
  };

  const [showAddSpecies, setShowAddSpecies] = useState(false);
  const [speciesForm, setSpeciesForm] = useState({
    name: "",
    scientificName: "",
    category: "MAMÍFERO TERRESTRE",
    description: "",
    details: "",
    sightings: "95%+ AVISTAMENTOS",
    image: "",
    bestPousadaId: ""
  });

  // Calculate high-fidelity dashboard metrics
  const totalRevenue = bookings
    .filter(b => b.status === "pago" || b.status === "confirmado_pousada" || b.status === "confirmado_guia" || b.status === "confirmado_total")
    .reduce((sum, b) => sum + b.totalPrice, 0);

  const pendingConfirmation = bookings.filter(b => b.status === "pago" || b.status === "confirmado_pousada" || b.status === "confirmado_guia").length;

  const activeReservationsCount = bookings.filter(b => b.status !== "cancelado").length;

  // Actions for reservation statuses (simulating Guide & Pousada confirmations)
  const handleConfirmPousada = async (bookingId: string) => {
    try {
      const response = await adminFetch(`/api/bookings/${bookingId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmado_pousada" })
      });
      if (response.ok) { onRefreshData(); fetchBookings(); }
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmGuide = async (bookingId: string, guideId: string) => {
    try {
      const response = await adminFetch(`/api/bookings/${bookingId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmado_guia", guideId })
      });
      if (response.ok) { onRefreshData(); fetchBookings(); }
    } catch (err) {
      console.error(err);
    }
  };

  // Marca uma reserva como paga sem passar pelo Stripe — pra fechamentos
  // combinados fora do checkout (Pix, transferência, dinheiro na recepção,
  // reserva por telefone/WhatsApp) e pra testar o resto do fluxo de
  // confirmação (aprovar quarto → vincular guia → sincronizar agenda) sem
  // precisar de um pagamento real configurado.
  const handleMarkAsPaid = async (bookingId: string) => {
    try {
      const response = await adminFetch(`/api/bookings/${bookingId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pago" })
      });
      if (response.ok) { onRefreshData(); fetchBookings(); }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    try {
      const response = await adminFetch(`/api/bookings/${bookingId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelado" })
      });
      if (response.ok) { onRefreshData(); fetchBookings(); }
    } catch (err) {
      console.error(err);
    }
  };

  // Mark notification as read
  const handleMarkNotificationRead = async (id: string) => {
    try {
      await adminFetch(`/api/notifications/${id}/read`, { method: "POST" });
      onRefreshData();
    } catch (err) {
      console.error(err);
    }
  };

  // CRUD submissions
  const handleAddPousadaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: pousadaForm.name,
        description: pousadaForm.description,
        longDescription: pousadaForm.longDescription,
        location: pousadaForm.location,
        pricePerNight: Number(pousadaForm.pricePerNight),
        features: pousadaForm.features,
        activities: pousadaForm.activities,
        experiences: pousadaForm.experiences
          .filter(exp => exp.title.trim())
          .map(exp => ({ title: exp.title.trim(), description: `Expedição de ${exp.title.trim()}`, price: exp.price || 0 })),
        capacity: Number(pousadaForm.capacity),
        images: [pousadaForm.images],
        videoUrl: pousadaForm.videoUrl.trim() || undefined,
        rooms: pousadaForm.rooms.filter(r => r.type.trim())
      };

      const response = await adminFetch("/api/pousadas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setShowAddPousada(false);
        onRefreshData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddGuideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: guideForm.name,
        email: guideForm.email,
        phone: guideForm.phone,
        languages: guideForm.languages,
        specialty: guideForm.specialty,
        status: guideForm.status,
        bio: guideForm.bio,
        age: guideForm.age ? Number(guideForm.age) : undefined,
        birthplace: guideForm.birthplace,
        interests: guideForm.interests,
        photoUrl: guideForm.photoUrl,
        images: guideForm.images
      };

      const response = await adminFetch("/api/guides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setShowAddGuide(false);
        fetchGuides();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeletePousada = async (id: string) => {
    if (!window.confirm("Deseja realmente remover esta pousada parceira?")) return;
    try {
      const response = await adminFetch(`/api/pousadas/${id}`, { method: "DELETE" });
      if (response.ok) onRefreshData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleVerified = async (id: string, currentValue: boolean) => {
    try {
      const response = await adminFetch(`/api/pousadas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified: !currentValue })
      });
      if (response.ok) onRefreshData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSetVideoUrl = async (id: string, currentValue: string) => {
    const url = window.prompt("Link do vídeo desta pousada:", currentValue || "");
    if (url === null) return;
    try {
      const response = await adminFetch(`/api/pousadas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: url.trim() })
      });
      if (response.ok) onRefreshData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteGuide = async (id: string) => {
    if (!window.confirm("Deseja realmente remover este guia turístico?")) return;
    try {
      const response = await adminFetch(`/api/guides/${id}`, { method: "DELETE" });
      if (response.ok) fetchGuides();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddSpeciesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Falls back to the first real registered pousada (never a fake demo
      // name) when the admin leaves the "melhor pousada" dropdown unset.
      const selectedPousada = pousadas.find(p => p.id === speciesForm.bestPousadaId) || pousadas[0];
      const payload = {
        name: speciesForm.name,
        scientificName: speciesForm.scientificName,
        category: speciesForm.category,
        description: speciesForm.description,
        details: speciesForm.details,
        sightings: speciesForm.sightings,
        image: speciesForm.image || "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=800&q=80",
        bestPousadaId: selectedPousada?.id || "",
        bestPousadaName: selectedPousada?.name || ""
      };

      const response = await adminFetch("/api/species", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setShowAddSpecies(false);
        setSpeciesForm({
          name: "",
          scientificName: "",
          category: "MAMÍFERO TERRESTRE",
          description: "",
          details: "",
          sightings: "95%+ AVISTAMENTOS",
          image: "",
          bestPousadaId: ""
        });
        onRefreshData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSpecies = async (id: string) => {
    if (!window.confirm("Deseja realmente remover esta espécie silvestre?")) return;
    try {
      const response = await adminFetch(`/api/species/${id}`, { method: "DELETE" });
      if (response.ok) onRefreshData();
    } catch (err) {
      console.error(err);
    }
  };

  // Filters bookings list
  const filteredBookings = bookings.filter(b => {
    const matchesSearch = b.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || b.pousadaName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });
  const bookingsPagination = usePagination(filteredBookings, 20);
  const pousadasPagination = usePagination(pousadas, 10);
  const guidesPagination = usePagination(guides, 20);
  const speciesPagination = usePagination(species, 20);

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
                <button
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
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-zinc-400 text-xs px-5 py-6 text-center">Nenhuma notificação ainda.</p>
                  ) : (
                    notifications.map((notif) => {
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

        {/* TAB 1: RESERVAS & CONFIRMAÇÕES */}
        {activeTab === "bookings" && (
          <div className="space-y-6">
            
            {/* Search and filters */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 border border-zinc-200 rounded-2xl">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Buscar reserva..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex items-center gap-4">
                <span className="text-zinc-500 text-xs font-semibold whitespace-nowrap">{filteredBookings.length} reservas filtradas</span>
                <button
                  onClick={() => setShowNewBooking(v => !v)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition flex items-center gap-1.5 shadow-sm whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" /> Nova Reserva
                </button>
              </div>
            </div>

            {showNewBooking && (
              <NewBookingForm
                pousadas={pousadas}
                onClose={() => setShowNewBooking(false)}
                onCreated={() => { fetchBookings(); onRefreshData(); }}
              />
            )}

            {/* List of active bookings */}
            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-100 text-zinc-500 uppercase font-bold border-b border-zinc-200 text-[10px] tracking-wider">
                      <th className="p-4">Cód / Cliente</th>
                      <th className="p-4">Pousada / Experiência</th>
                      <th className="p-4">Período</th>
                      <th className="p-4">Valor</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Ações de Confirmação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {bookingsPagination.pageItems.map((b) => (
                      <tr key={b.id} className="hover:bg-zinc-50/50">
                        <td className="p-4">
                          <span className="font-mono text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-semibold">#{b.id.split("_")[1] || b.id}</span>
                          <span className="block font-bold text-zinc-900 mt-1">{b.customerName}</span>
                          <span className="text-[10px] text-zinc-500 block">{b.customerEmail} • {b.nationality}</span>
                        </td>
                        <td className="p-4">
                          <span className="font-bold text-zinc-800">{b.pousadaName}</span>
                          <span className="block text-[11px] text-emerald-700 font-semibold mt-0.5">{b.experienceType}</span>
                        </td>
                        <td className="p-4 font-medium text-zinc-700">
                          {b.checkIn} <span className="text-zinc-400">até</span> {b.checkOut}
                        </td>
                        <td className="p-4 font-extrabold text-zinc-900">
                          R$ {b.totalPrice.toLocaleString('pt-BR')}
                        </td>
                        <td className="p-4">
                          {/* Rich Status Badges */}
                          {b.status === "pendente_pagamento" && <span className="bg-zinc-100 text-zinc-700 border border-zinc-200 px-2 py-1 rounded-full font-bold">Pendente Pagamento</span>}
                          {b.status === "pago" && <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-full font-bold animate-pulse">Pago (Aguardando ADM)</span>}
                          {b.status === "confirmado_pousada" && <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded-full font-bold">Confirmado Pousada</span>}
                          {b.status === "confirmado_guia" && <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-1 rounded-full font-bold">Confirmado Guia</span>}
                          {b.status === "confirmado_total" && <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 rounded-full font-bold flex items-center gap-1 w-max"><ShieldCheck className="h-3.5 w-3.5" /> Confirmado Total</span>}
                          {b.status === "cancelado" && <span className="bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded-full font-bold">Cancelado</span>}
                        </td>
                        <td className="p-4 text-right space-y-1.5">
                          {/* Admin interaction tools */}
                          {b.status === "pendente_pagamento" && (
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => handleMarkAsPaid(b.id)}
                                title="Pra fechamentos fora do Stripe (Pix, transferência, dinheiro) ou pra testar o fluxo de confirmação"
                                className="bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-800 font-bold px-2.5 py-1.5 rounded transition text-[10px]"
                              >
                                Marcar como Paga
                              </button>
                            </div>
                          )}
                          {b.status === "pago" && (
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => handleConfirmPousada(b.id)}
                                className="bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 font-bold px-2.5 py-1.5 rounded transition text-[10px]"
                              >
                                Aprovar Quarto Pousada
                              </button>
                            </div>
                          )}

                          {/* Allocation of available guides */}
                          {(b.status === "pago" || b.status === "confirmado_pousada") && !b.guideId && (
                            <div className="flex items-center justify-end gap-1.5 mt-1.5">
                              <span className="text-[10px] text-zinc-500 font-semibold">Vincular Guia:</span>
                              <select
                                onChange={(e) => {
                                  if (e.target.value) handleConfirmGuide(b.id, e.target.value);
                                }}
                                className="bg-zinc-50 border border-zinc-200 rounded p-1 text-[10px]"
                                defaultValue=""
                              >
                                <option value="" disabled>Selecione...</option>
                                {guides.filter(g => g.status === "disponivel").map(g => (
                                  <option key={g.id} value={g.id}>{g.name}{g.specialty?.[0] ? ` (${g.specialty[0]})` : ""}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {b.guideName && (
                            <span className="block text-[10px] text-indigo-700 font-semibold text-right">🧭 Guia Alocado: {b.guideName}</span>
                          )}

                          {b.status !== "cancelado" && b.status !== "confirmado_total" && (
                            <button
                              onClick={() => handleCancelBooking(b.id)}
                              className="text-red-400 hover:text-red-600 font-bold text-[10px] hover:underline"
                            >
                              Cancelar Reserva
                            </button>
                          )}
                          
                          {b.status === "confirmado_total" && b.googleCalendarEventId && (
                            <span className="text-[9px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded font-mono block text-right w-max ml-auto">
                              📅 Google Calendar Evento: {b.googleCalendarEventId}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredBookings.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center p-8 text-zinc-400">Nenhuma reserva encontrada.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={bookingsPagination.page}
                totalPages={bookingsPagination.totalPages}
                totalItems={bookingsPagination.totalItems}
                onPageChange={bookingsPagination.setPage}
              />
            </div>
          </div>
        )}

        {/* TAB 2: POUSADAS CRUD */}
        {activeTab === "pousadas" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 border border-zinc-200 rounded-2xl">
              <span className="font-bold text-sm text-zinc-800">Total: {pousadas.length} pousadas cadastradas</span>
              <button
                onClick={() => setShowAddPousada(!showAddPousada)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="h-4 w-4" /> Adicionar Pousada Parceira
              </button>
            </div>

            {/* Add Pousada form */}
            {showAddPousada && (
              <form onSubmit={handleAddPousadaSubmit} className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-md space-y-4">
                <h3 className="font-bold text-base text-zinc-900 border-b border-zinc-100 pb-2">Cadastrar Nova Pousada</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Nome da Pousada</label>
                    <input
                      type="text"
                      value={pousadaForm.name}
                      onChange={e => setPousadaForm(prev => ({ ...prev, name: e.target.value }))}
                      required
                      placeholder="Ex: Pousada Ecológica Pantanal"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Localização (Bioma/Estado)</label>
                    <input
                      type="text"
                      value={pousadaForm.location}
                      onChange={e => setPousadaForm(prev => ({ ...prev, location: e.target.value }))}
                      required
                      placeholder="Ex: Pantanal Norte, Mato Grosso"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Preço da Diária (Base R$)</label>
                    <input
                      type="number"
                      value={pousadaForm.pricePerNight}
                      onChange={e => setPousadaForm(prev => ({ ...prev, pricePerNight: Number(e.target.value) }))}
                      required
                      className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Capacidade Máxima (Acomodações)</label>
                    <input
                      type="number"
                      value={pousadaForm.capacity}
                      onChange={e => setPousadaForm(prev => ({ ...prev, capacity: Number(e.target.value) }))}
                      required
                      className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Link da Imagem Principal</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={pousadaForm.images}
                        onChange={e => setPousadaForm(prev => ({ ...prev, images: e.target.value }))}
                        className="flex-1 bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                      />
                      <ImageUploadButton onUploaded={url => setPousadaForm(prev => ({ ...prev, images: url }))} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Link do Vídeo (opcional)</label>
                    <input
                      type="text"
                      value={pousadaForm.videoUrl}
                      onChange={e => setPousadaForm(prev => ({ ...prev, videoUrl: e.target.value }))}
                      placeholder="https://... (vídeo desta pousada específica)"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="text-xs">
                  <label className="block text-zinc-700 font-semibold mb-1">Descrição Curta</label>
                  <input
                    type="text"
                    value={pousadaForm.description}
                    onChange={e => setPousadaForm(prev => ({ ...prev, description: e.target.value }))}
                    required
                    placeholder="Descrição para o card do catálogo..."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="text-xs">
                  <label className="block text-zinc-700 font-semibold mb-1">Estrutura & Comodidades</label>
                  <TagInput
                    value={pousadaForm.features}
                    onChange={features => setPousadaForm(prev => ({ ...prev, features }))}
                    placeholder="Digite e pressione Enter (ex: Wi-Fi)"
                  />
                </div>

                <div className="text-xs">
                  <label className="block text-zinc-700 font-semibold mb-1">Atividades Inclusas</label>
                  <TagInput
                    value={pousadaForm.activities}
                    onChange={activities => setPousadaForm(prev => ({ ...prev, activities }))}
                    placeholder="Digite e pressione Enter (ex: Safári)"
                  />
                </div>

                <div className="text-xs">
                  <label className="block text-zinc-700 font-semibold mb-1">Experiências Pagas</label>
                  <ExperienceListEditor
                    value={pousadaForm.experiences}
                    onChange={experiences => setPousadaForm(prev => ({ ...prev, experiences }))}
                  />
                </div>

                <div className="text-xs">
                  <label className="block text-zinc-700 font-semibold mb-1">Quartos</label>
                  <RoomsEditor
                    value={pousadaForm.rooms}
                    onChange={rooms => setPousadaForm(prev => ({ ...prev, rooms }))}
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setShowAddPousada(false)}
                    className="bg-zinc-100 text-zinc-700 px-4 py-2 rounded font-semibold hover:bg-zinc-200 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded font-bold transition shadow-sm"
                  >
                    Salvar Pousada
                  </button>
                </div>
              </form>
            )}

            {/* Pousadas Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {pousadasPagination.pageItems.map(p => (
                <div key={p.id} className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm flex gap-4">
                  <img
                    src={p.images[0]}
                    alt={p.name}
                    referrerPolicy="no-referrer"
                    className="w-24 h-24 object-cover rounded-xl"
                  />
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-extrabold text-zinc-950 text-base">{p.name}</h4>
                        {p.verified && (
                          <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full">
                            <BadgeCheck className="h-3 w-3" /> Verificada
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">{p.location}</p>
                      <p className="text-zinc-600 text-xs mt-1.5 line-clamp-2">{p.description}</p>
                      <span className="flex items-center gap-1 text-[10px] text-zinc-400 mt-1.5">
                        <Eye className="h-3 w-3" /> {p.viewCount || 0} visualizações
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-zinc-100 pt-2.5 mt-2 text-xs">
                      <span className="font-extrabold text-zinc-900">Diária R$ {p.pricePerNight}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditPousada(p)}
                          className="text-[10px] font-bold px-2 py-1.5 rounded text-zinc-600 hover:bg-zinc-100 transition flex items-center gap-1"
                          title="Editar pousada"
                        >
                          <Edit3 className="h-3 w-3" /> Editar
                        </button>
                        <button
                          onClick={() => handleSetVideoUrl(p.id, p.videoUrl || "")}
                          className={`text-[10px] font-bold px-2 py-1.5 rounded transition ${
                            p.videoUrl ? "text-emerald-700 hover:bg-emerald-50" : "text-zinc-500 hover:bg-zinc-100"
                          }`}
                          title={p.videoUrl ? "Editar link do vídeo" : "Definir vídeo desta pousada"}
                        >
                          {p.videoUrl ? "Editar vídeo" : "+ Vídeo"}
                        </button>
                        <button
                          onClick={() => handleToggleVerified(p.id, !!p.verified)}
                          className={`text-[10px] font-bold px-2 py-1.5 rounded transition ${
                            p.verified ? "text-zinc-500 hover:bg-zinc-100" : "text-emerald-700 hover:bg-emerald-50"
                          }`}
                          title={p.verified ? "Remover selo de verificada" : "Marcar como verificada"}
                        >
                          {p.verified ? "Remover selo" : "Verificar"}
                        </button>
                        <button
                          onClick={() => setManagingPousadaAccess(p)}
                          className="text-zinc-500 hover:text-editorial-primary hover:bg-zinc-100 p-1.5 rounded transition cursor-pointer"
                          title="Gerenciar acesso de parceiro"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeletePousada(p.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded transition"
                          title="Excluir Pousada"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Pagination
              page={pousadasPagination.page}
              totalPages={pousadasPagination.totalPages}
              totalItems={pousadasPagination.totalItems}
              onPageChange={pousadasPagination.setPage}
            />
          </div>
        )}

        {/* TAB 3: GUIAS CRUD */}
        {activeTab === "guides" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 border border-zinc-200 rounded-2xl">
              <span className="font-bold text-sm text-zinc-800">Total: {guides.length} guias cadastrados</span>
              <button
                onClick={() => setShowAddGuide(!showAddGuide)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="h-4 w-4" /> Cadastrar Novo Guia
              </button>
            </div>

            {/* Add Guide form */}
            {showAddGuide && (
              <form onSubmit={handleAddGuideSubmit} className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-md space-y-4">
                <h3 className="font-bold text-base text-zinc-900 border-b border-zinc-100 pb-2">Cadastrar Novo Guia Turístico</h3>

                <div className="flex items-center gap-4 text-xs">
                  <div className="w-16 h-16 flex-shrink-0 rounded-full overflow-hidden bg-zinc-100 border border-zinc-200 flex items-center justify-center">
                    {guideForm.photoUrl ? (
                      <img src={guideForm.photoUrl} alt="Prévia" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    ) : (
                      <Users className="h-6 w-6 text-zinc-400" />
                    )}
                  </div>
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Foto de Perfil</label>
                    <ImageUploadButton label="Enviar foto" onUploaded={url => setGuideForm(prev => ({ ...prev, photoUrl: url }))} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Nome Completo</label>
                    <input
                      type="text"
                      value={guideForm.name}
                      onChange={e => setGuideForm(prev => ({ ...prev, name: e.target.value }))}
                      required
                      placeholder="Ex: Carlos Silva"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">E-mail</label>
                    <input
                      type="email"
                      value={guideForm.email}
                      onChange={e => setGuideForm(prev => ({ ...prev, email: e.target.value }))}
                      required
                      placeholder="carlos@hotmail.com"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Telefone WhatsApp</label>
                    <input
                      type="text"
                      value={guideForm.phone}
                      onChange={e => setGuideForm(prev => ({ ...prev, phone: e.target.value }))}
                      required
                      placeholder="+55 65 99912-3456"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-zinc-700 font-semibold mb-1">Idiomas Falados (com nível)</label>
                  <LanguagesEditor
                    value={guideForm.languages}
                    onChange={languages => setGuideForm(prev => ({ ...prev, languages }))}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Especialidades</label>
                    <TagInput
                      value={guideForm.specialty}
                      onChange={specialty => setGuideForm(prev => ({ ...prev, specialty }))}
                      placeholder="Ex: Rastreamento"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Status do Guia</label>
                    <ToggleSwitch
                      checked={guideForm.status === "disponivel"}
                      onChange={checked => setGuideForm(prev => ({ ...prev, status: checked ? "disponivel" : "indisponivel" }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Idade</label>
                    <input
                      type="number" min="18" value={guideForm.age}
                      onChange={e => setGuideForm(prev => ({ ...prev, age: e.target.value }))}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Origem / Local de Nascimento</label>
                    <input
                      type="text" value={guideForm.birthplace}
                      onChange={e => setGuideForm(prev => ({ ...prev, birthplace: e.target.value }))}
                      placeholder="Ex: Poconé, MT"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="text-xs">
                  <label className="block text-zinc-700 font-semibold mb-1">Breve Histórico / Bio</label>
                  <textarea
                    rows={3} value={guideForm.bio}
                    onChange={e => setGuideForm(prev => ({ ...prev, bio: e.target.value }))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500 resize-none"
                  />
                </div>

                <div className="text-xs">
                  <label className="block text-zinc-700 font-semibold mb-1">Temas de Interesse (piloteiro, passarinheiro, botânica...)</label>
                  <TagInput
                    value={guideForm.interests}
                    onChange={interests => setGuideForm(prev => ({ ...prev, interests }))}
                    placeholder="Digite e pressione Enter"
                  />
                </div>

                <ImageListEditor label="Galeria de Fotos (expedições, campo)" value={guideForm.images} onChange={images => setGuideForm(prev => ({ ...prev, images }))} />

                <div className="flex gap-2 justify-end pt-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setShowAddGuide(false)}
                    className="bg-zinc-100 text-zinc-700 px-4 py-2 rounded font-semibold hover:bg-zinc-200 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded font-bold transition shadow-sm"
                  >
                    Salvar Guia
                  </button>
                </div>
              </form>
            )}

            {/* Edit Guide modal */}
            {editingGuideId && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <form
                  onSubmit={handleEditGuideSubmit}
                  className="bg-white border border-zinc-200 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 space-y-5"
                >
                  <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
                    <h3 className="font-bold text-lg text-zinc-900">Editar Guia</h3>
                    <button type="button" onClick={() => setEditingGuideId(null)} className="text-zinc-400 hover:text-zinc-700 transition cursor-pointer">
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <div className="w-16 h-16 flex-shrink-0 rounded-full overflow-hidden bg-zinc-100 border border-zinc-200 flex items-center justify-center">
                      {editGuideForm.photoUrl ? (
                        <img src={editGuideForm.photoUrl} alt="Prévia" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : (
                        <Users className="h-6 w-6 text-zinc-400" />
                      )}
                    </div>
                    <div>
                      <label className="block text-zinc-700 font-semibold mb-1">Foto de Perfil</label>
                      <ImageUploadButton label="Trocar foto" onUploaded={url => setEditGuideForm(prev => ({ ...prev, photoUrl: url }))} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <label className="block text-zinc-700 font-semibold mb-1">Nome Completo</label>
                      <input type="text" required value={editGuideForm.name} onChange={e => setEditGuideForm(prev => ({ ...prev, name: e.target.value }))} className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-zinc-700 font-semibold mb-1">E-mail</label>
                      <input type="email" required value={editGuideForm.email} onChange={e => setEditGuideForm(prev => ({ ...prev, email: e.target.value }))} className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-zinc-700 font-semibold mb-1">Telefone WhatsApp</label>
                      <input type="text" required value={editGuideForm.phone} onChange={e => setEditGuideForm(prev => ({ ...prev, phone: e.target.value }))} className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Idiomas Falados (com nível)</label>
                    <LanguagesEditor value={editGuideForm.languages} onChange={languages => setEditGuideForm(prev => ({ ...prev, languages }))} />
                  </div>

                  <div className="text-xs">
                    <label className="block text-zinc-700 font-semibold mb-1">Especialidades</label>
                    <TagInput value={editGuideForm.specialty} onChange={specialty => setEditGuideForm(prev => ({ ...prev, specialty }))} placeholder="Ex: Rastreamento" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <label className="block text-zinc-700 font-semibold mb-1">Status</label>
                      <ToggleSwitch
                        checked={editGuideForm.status === "disponivel"}
                        onChange={checked => setEditGuideForm(prev => ({ ...prev, status: checked ? "disponivel" : "indisponivel" }))}
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-700 font-semibold mb-1">Idade</label>
                      <input type="number" min="18" value={editGuideForm.age} onChange={e => setEditGuideForm(prev => ({ ...prev, age: e.target.value }))} className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-zinc-700 font-semibold mb-1">Origem</label>
                      <input type="text" value={editGuideForm.birthplace} onChange={e => setEditGuideForm(prev => ({ ...prev, birthplace: e.target.value }))} className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500" />
                    </div>
                  </div>

                  <div className="text-xs">
                    <label className="block text-zinc-700 font-semibold mb-1">Breve Histórico / Bio</label>
                    <textarea rows={3} value={editGuideForm.bio} onChange={e => setEditGuideForm(prev => ({ ...prev, bio: e.target.value }))} className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500 resize-none" />
                  </div>

                  <div className="text-xs">
                    <label className="block text-zinc-700 font-semibold mb-1">Temas de Interesse</label>
                    <TagInput value={editGuideForm.interests} onChange={interests => setEditGuideForm(prev => ({ ...prev, interests }))} placeholder="Digite e pressione Enter" />
                  </div>

                  <ImageListEditor label="Galeria de Fotos (expedições, campo)" value={editGuideForm.images} onChange={images => setEditGuideForm(prev => ({ ...prev, images }))} />

                  <div className="text-xs bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                    <label className="block text-zinc-700 font-semibold mb-1.5">Agenda — datas indisponíveis</label>
                    <GuideAvailabilityCalendar value={editGuideForm.unavailableDates} onChange={unavailableDates => setEditGuideForm(prev => ({ ...prev, unavailableDates }))} />
                  </div>

                  <div className="flex gap-2 justify-end pt-2 text-xs border-t border-zinc-100">
                    <button type="button" onClick={() => setEditingGuideId(null)} className="bg-zinc-100 text-zinc-700 px-4 py-2.5 rounded-lg font-semibold hover:bg-zinc-200 transition cursor-pointer">
                      Cancelar
                    </button>
                    <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-bold transition shadow-sm cursor-pointer">
                      Salvar Alterações
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Guides List */}
            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-100 text-zinc-500 uppercase font-bold border-b border-zinc-200 text-[10px] tracking-wider">
                    <th className="p-4">Guia / Contato</th>
                    <th className="p-4">Idiomas falados</th>
                    <th className="p-4">Especialidade / Foco</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {guidesPagination.pageItems.map(g => (
                    <tr key={g.id}>
                      <td className="p-4">
                        <span className="font-bold text-zinc-950 block">{g.name}</span>
                        <span className="text-[10px] text-zinc-500 block mt-0.5">{g.email} • {g.phone}</span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {(g.languages || []).map((l, i) => (
                            <span key={i} className="bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded text-[10px] border border-zinc-200">{l.language} ({LEVEL_LABELS[l.level]})</span>
                          ))}
                        </div>
                      </td>
                      <td className="p-4 font-medium text-zinc-700">
                        {(g.specialty || []).join(", ")}
                      </td>
                      <td className="p-4">
                        {g.status === "disponivel" ? (
                          <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 rounded-full font-bold">Disponível</span>
                        ) : (
                          <span className="bg-zinc-100 text-zinc-600 border border-zinc-200 px-2 py-1 rounded-full font-bold">Indisponível</span>
                        )}
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setManagingGuideAccess(g)}
                          className="text-zinc-500 hover:text-editorial-primary p-2 rounded hover:bg-zinc-50 transition cursor-pointer"
                          title="Gerenciar acesso de parceiro"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openEditGuide(g)}
                          className="text-zinc-500 hover:text-editorial-primary p-2 rounded hover:bg-zinc-50 transition cursor-pointer"
                          title="Editar Guia"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteGuide(g.id)}
                          className="text-red-500 hover:text-red-700 p-2 rounded hover:bg-red-50 transition cursor-pointer"
                          title="Excluir Guia"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={guidesPagination.page}
                totalPages={guidesPagination.totalPages}
                totalItems={guidesPagination.totalItems}
                onPageChange={guidesPagination.setPage}
              />
            </div>

          </div>
        )}

        {/* TAB 4: AGENDA INTEGRADA */}
        {activeTab === "agenda" && (
          <div className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-4">
              <div>
                <h3 className="font-serif font-bold text-editorial-primary text-xl mb-1 flex items-center gap-1.5"><Calendar className="h-5 w-5 text-editorial-primary" /> Agenda Geral de Expedições</h3>
                <p className="text-zinc-500 text-xs">Sincronização integrada em tempo real com o Google Calendar para todas as expedições confirmadas.</p>
              </div>
            </div>

            {/* Google Calendar Connection Status Banner */}
            <div className="bg-editorial-secondary border border-editorial-border p-5 rounded-none flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1">
                <h4 className="font-serif font-bold text-editorial-primary text-sm flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${googleCalendarStatus.connected ? "bg-emerald-500" : "bg-amber-500"}`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${googleCalendarStatus.connected ? "bg-emerald-600" : "bg-amber-600"}`}></span>
                  </span>
                  Integração Oficial Google Calendar
                </h4>
                <p className="text-editorial-muted text-[11px] mt-1 font-light">
                  {googleCalendarStatus.connected
                    ? `Sincronizado ativamente com a conta: ${googleCalendarStatus.email || "Conectada"}`
                    : "Conecte sua agenda para enviar automaticamente as reservas confirmadas para o Google Calendar em tempo real."}
                </p>
              </div>
              <div className="flex-shrink-0">
                {googleCalendarStatus.connected ? (
                  <button
                    onClick={handleDisconnectGoogleCalendar}
                    disabled={disconnectingGoogle}
                    className="bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 px-4 py-2 text-xs font-bold uppercase tracking-widest transition cursor-pointer disabled:opacity-60"
                  >
                    {disconnectingGoogle ? "Desconectando..." : "Desconectar Conta"}
                  </button>
                ) : (
                  <button
                    onClick={handleConnectGoogleCalendar}
                    disabled={connectingGoogle}
                    className="bg-editorial-primary text-white hover:bg-editorial-primary/95 px-4 py-2 text-xs font-bold uppercase tracking-widest transition cursor-pointer disabled:opacity-60"
                  >
                    {connectingGoogle ? "Conectando..." : "Conectar Google Calendar"}
                  </button>
                )}
              </div>
            </div>

            <PousadaCalendarsPanel pousadas={pousadas} connected={googleCalendarStatus.connected} onRefreshData={onRefreshData} />

            <div className="border border-zinc-200 rounded-xl overflow-hidden divide-y divide-zinc-200">
              {bookings.filter(b => b.status !== "cancelado").map((b, idx) => (
                <div key={b.id} className="p-4 hover:bg-zinc-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg font-bold text-center w-20 flex-shrink-0 border border-emerald-100">
                      <span className="text-[10px] block uppercase text-emerald-600">Check-In</span>
                      <span className="text-sm block leading-none mt-1">{b.checkIn.split("-")[2]} / {b.checkIn.split("-")[1]}</span>
                    </div>
                    <div>
                      <h4 className="font-extrabold text-zinc-950 text-base">{b.pousadaName}</h4>
                      <p className="text-xs text-zinc-600 mt-1">
                        Cliente: <span className="font-bold text-zinc-800">{b.customerName}</span> ({b.adults} adultos, {b.children} crianças)
                      </p>
                      <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1">
                        ⏱️ Check-out em: {b.checkOut}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-start sm:items-end gap-1.5">
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">
                      🧭 Experiência: {b.experienceType}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {b.guideName ? `Guia: ${b.guideName}` : "⚠️ Nenhum guia alocado"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
        {activeTab === "species" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 border border-zinc-200 rounded-2xl">
              <span className="font-bold text-sm text-zinc-800">Total: {species.length} espécies cadastradas</span>
              <button
                onClick={() => setShowAddSpecies(!showAddSpecies)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="h-4 w-4" /> Cadastrar Nova Espécie
              </button>
            </div>

            {/* Add Species form */}
            {showAddSpecies && (
              <form onSubmit={handleAddSpeciesSubmit} className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-md space-y-4">
                <h3 className="font-bold text-base text-zinc-900 border-b border-zinc-100 pb-2">Cadastrar Nova Espécie Silvestre</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Nome Popular (ex: Onça-Pintada)</label>
                    <input
                      type="text"
                      value={speciesForm.name}
                      onChange={e => setSpeciesForm(prev => ({ ...prev, name: e.target.value }))}
                      required
                      placeholder="Ex: Onça-Pintada"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Nome Científico (ex: Panthera onca)</label>
                    <input
                      type="text"
                      value={speciesForm.scientificName}
                      onChange={e => setSpeciesForm(prev => ({ ...prev, scientificName: e.target.value }))}
                      required
                      placeholder="Ex: Panthera onca"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Categoria</label>
                    <select
                      value={speciesForm.category}
                      onChange={e => setSpeciesForm(prev => ({ ...prev, category: e.target.value }))}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="MAMÍFERO TERRESTRE">MAMÍFERO TERRESTRE</option>
                      <option value="MAMÍFERO AQUÁTICO">MAMÍFERO AQUÁTICO</option>
                      <option value="AVE EXÓTICA">AVE EXÓTICA</option>
                      <option value="RÉPTIL PREDADOR">RÉPTIL PREDADOR</option>
                      <option value="ANFÍBIO">ANFÍBIO</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Probabilidade de Avistamento (ex: 95%+ AVISTAMENTOS)</label>
                    <input
                      type="text"
                      value={speciesForm.sightings}
                      onChange={e => setSpeciesForm(prev => ({ ...prev, sightings: e.target.value }))}
                      required
                      placeholder="Ex: 90%+ AVISTAMENTOS"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Melhor Pousada de Observação</label>
                    <select
                      value={speciesForm.bestPousadaId}
                      onChange={e => setSpeciesForm(prev => ({ ...prev, bestPousadaId: e.target.value }))}
                      required
                      className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Selecione uma pousada...</option>
                      {pousadas.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-xs">
                  <label className="block text-zinc-700 font-semibold mb-1">Link da Imagem Ilustrativa</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={speciesForm.image}
                      onChange={e => setSpeciesForm(prev => ({ ...prev, image: e.target.value }))}
                      placeholder="https://images.unsplash.com/..."
                      className="flex-1 bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                    />
                    <ImageUploadButton onUploaded={url => setSpeciesForm(prev => ({ ...prev, image: url }))} />
                  </div>
                </div>

                <div className="text-xs">
                  <label className="block text-zinc-700 font-semibold mb-1">Descrição Curta (para o card principal)</label>
                  <input
                    type="text"
                    value={speciesForm.description}
                    onChange={e => setSpeciesForm(prev => ({ ...prev, description: e.target.value }))}
                    required
                    placeholder="Breve sumário ecológico..."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="text-xs">
                  <label className="block text-zinc-700 font-semibold mb-1">Detalhes Completos (para o modal explicativo)</label>
                  <textarea
                    value={speciesForm.details}
                    onChange={e => setSpeciesForm(prev => ({ ...prev, details: e.target.value }))}
                    required
                    rows={3}
                    placeholder="Informações comportamentais, conservação, etc..."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex justify-end gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setShowAddSpecies(false)}
                    className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 px-4 py-2 rounded font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded font-bold"
                  >
                    Salvar Espécie
                  </button>
                </div>
              </form>
            )}

            {/* Species List Grid */}
            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-zinc-50 text-zinc-500 uppercase tracking-wider border-b border-zinc-200 font-bold">
                      <th className="p-4">Espécie</th>
                      <th className="p-4">Nome Científico</th>
                      <th className="p-4">Categoria</th>
                      <th className="p-4">Avistamentos</th>
                      <th className="p-4">Melhor Pousada</th>
                      <th className="p-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {species.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-zinc-400 italic">
                          Nenhuma espécie cadastrada no banco de dados. O site está usando o catálogo padrão do Pantanal.
                        </td>
                      </tr>
                    ) : (
                      speciesPagination.pageItems.map(s => (
                        <tr key={s.id} className="hover:bg-zinc-50/55 transition">
                          <td className="p-4 flex items-center gap-3">
                            <img
                              src={s.image}
                              alt={s.name}
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 object-cover rounded border border-zinc-200"
                            />
                            <span className="font-bold text-zinc-900">{s.name}</span>
                          </td>
                          <td className="p-4 italic text-zinc-600">{s.scientificName}</td>
                          <td className="p-4">
                            <span className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-2 py-0.5 rounded text-[10px] font-bold">
                              {s.category}
                            </span>
                          </td>
                          <td className="p-4 font-mono font-semibold text-amber-800">{s.sightings}</td>
                          <td className="p-4 text-zinc-600">{s.bestPousadaName}</td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => handleDeleteSpecies(s.id)}
                              className="text-red-600 hover:text-red-700 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Excluir
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={speciesPagination.page}
                totalPages={speciesPagination.totalPages}
                totalItems={speciesPagination.totalItems}
                onPageChange={speciesPagination.setPage}
              />
            </div>
          </div>
        )}

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
