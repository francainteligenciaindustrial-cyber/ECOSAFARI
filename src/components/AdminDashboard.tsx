import React, { useState, useEffect } from "react";
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
  Image as ImageIcon
} from "lucide-react";
import { Pousada, Guide, Booking, Notification, Species } from "../types";
import TurismoPanel from "./TurismoPanel";
import CandidaturasPanel from "./CandidaturasPanel";
import AdminUsersPanel from "./AdminUsersPanel";
import ReferralStatsWidget from "./ReferralStatsWidget";
import { adminFetch } from "../lib/adminFetch";
import ImageUploadButton from "./ImageUploadButton";
import TagInput from "./TagInput";
import ExperienceListEditor, { ExperienceDraft } from "./ExperienceListEditor";
import Pagination from "./Pagination";
import { usePagination } from "../lib/usePagination";

interface AdminDashboardProps {
  pousadas: Pousada[];
  species?: Species[];
  onRefreshData: () => void;
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
  const [activeTab, setActiveTab] = useState<"bookings" | "pousadas" | "guides" | "agenda" | "history" | "supabase" | "species" | "turismo" | "candidaturas" | "admins">("bookings");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddPousada, setShowAddPousada] = useState(false);
  const [showAddGuide, setShowAddGuide] = useState(false);
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState<{ connected: boolean; email: string | null }>({ connected: false, email: null });

  // Supabase Status States
  const [supabaseStatus, setSupabaseStatus] = useState<{
    connected: boolean;
    url: string;
    tables: Record<string, boolean>;
    allOk: boolean;
  } | null>(null);
  const [loadingSupabase, setLoadingSupabase] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

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
      const response = await fetch("/api/auth/google/status");
      if (response.ok) {
        const data = await response.json();
        setGoogleCalendarStatus(data);
      }
    } catch (err) {
      console.error("Erro ao carregar status do Google Calendar:", err);
    }
  };

  const fetchSupabaseStatus = async () => {
    setLoadingSupabase(true);
    try {
      const response = await adminFetch("/api/supabase/status");
      if (response.ok) {
        const data = await response.json();
        setSupabaseStatus(data);
      }
    } catch (err) {
      console.error("Erro ao carregar status do Supabase:", err);
    } finally {
      setLoadingSupabase(false);
    }
  };

  useEffect(() => {
    fetchGoogleCalendarStatus();
    if (activeTab === "supabase") {
      fetchSupabaseStatus();
      fetchFakeDataCheck();
    }
  }, [activeTab]);

  // Notifications management
  const unreadNotifications = notifications.filter(n => !n.read);

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
    videoUrl: ""
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
    images: "",
    videoUrl: "",
    officialSiteUrl: ""
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
      images: (p.images || []).join("\n"),
      videoUrl: p.videoUrl || "",
      officialSiteUrl: p.officialSiteUrl || ""
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
        images: editPousadaForm.images.split("\n").map(i => i.trim()).filter(Boolean),
        videoUrl: editPousadaForm.videoUrl.trim() || undefined,
        officialSiteUrl: editPousadaForm.officialSiteUrl.trim() || undefined
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
    languages: ["Português", "Inglês"] as string[],
    specialty: ["Fotografia", "Rastreamento"] as string[],
    status: "disponivel" as "disponivel" | "indisponivel"
  });

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
        videoUrl: pousadaForm.videoUrl.trim() || undefined
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
        status: guideForm.status
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
        const imageLines = editPousadaForm.images.split("\n");
        const updateImageLine = (idx: number, value: string) => {
          const lines = [...imageLines];
          lines[idx] = value;
          setEditPousadaForm(prev => ({ ...prev, images: lines.join("\n") }));
        };
        const removeImageLine = (idx: number) => {
          const lines = imageLines.filter((_, i) => i !== idx);
          setEditPousadaForm(prev => ({ ...prev, images: lines.join("\n") }));
        };
        const addImageLine = () => {
          setEditPousadaForm(prev => ({ ...prev, images: prev.images ? prev.images + "\n" : "" }));
        };

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

              {/* Images — one row per photo, with live thumbnail preview */}
              <div className="text-xs">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-zinc-700 font-semibold flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" /> Imagens
                  </label>
                  <div className="flex items-center gap-3">
                    <ImageUploadButton
                      label="Enviar nova imagem"
                      onUploaded={url => setEditPousadaForm(prev => ({ ...prev, images: prev.images ? prev.images + "\n" + url : url }))}
                    />
                    <button
                      type="button"
                      onClick={addImageLine}
                      className="flex items-center gap-1 text-emerald-700 font-semibold hover:text-emerald-800 transition cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar link
                    </button>
                  </div>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {imageLines.length === 0 && (
                    <p className="text-zinc-400 italic py-2">Nenhuma imagem adicionada ainda.</p>
                  )}
                  {imageLines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-zinc-50 border border-zinc-200 rounded-lg p-2">
                      <div className="w-14 h-14 flex-shrink-0 rounded-md overflow-hidden bg-zinc-200 border border-zinc-300 flex items-center justify-center">
                        {line.trim() ? (
                          <img
                            src={line.trim()}
                            alt={`Imagem ${idx + 1}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-zinc-400" />
                        )}
                      </div>
                      <input
                        type="text"
                        value={line}
                        onChange={e => updateImageLine(idx, e.target.value)}
                        placeholder="https://... ou /pousadas/foto.png"
                        className="flex-1 bg-white border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500 font-mono"
                      />
                      <ImageUploadButton label="Enviar" onUploaded={url => updateImageLine(idx, url)} />
                      <button
                        type="button"
                        onClick={() => removeImageLine(idx)}
                        className="text-zinc-400 hover:text-red-600 transition cursor-pointer flex-shrink-0"
                        title="Remover imagem"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

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

        {/* Header Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 border-b border-editorial-border pb-6">
          <div>
            <h1 className="text-3xl font-serif font-bold text-editorial-primary tracking-tight flex items-center gap-2">
              <Building2 className="h-7 w-7 text-editorial-primary" /> Painel de Controle EcoSafari
            </h1>
            <p className="text-editorial-muted text-xs mt-1 font-light">Gestão de pousadas parceiras, guias turísticos, alocação de equipe e agenda de reservas.</p>
          </div>

          {/* Quick Notification alert — jumps to the notification log below */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setActiveTab("bookings");
                setTimeout(() => {
                  document.getElementById("notifications-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 50);
              }}
              className="relative bg-white border border-editorial-border p-2 rounded-none flex items-center gap-2.5 shadow-sm text-[11px] hover:bg-editorial-secondary transition cursor-pointer"
            >
              <Bell className="h-4 w-4 text-editorial-primary animate-swing" />
              <div>
                <span className="font-bold text-editorial-primary">{unreadNotifications.length} novas</span> notificações
              </div>
            </button>
          </div>
        </div>

        {/* METRICS ROW */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          
          <div className="bg-white border border-editorial-border p-5 rounded-none shadow-sm flex items-center justify-between">
            <div>
              <span className="text-editorial-muted text-[9px] font-bold uppercase tracking-widest block">Faturamento Reservas</span>
              <span className="text-2xl font-serif font-bold text-editorial-primary mt-1 block">R$ {totalRevenue.toLocaleString('pt-BR')}</span>
            </div>
            <div className="bg-editorial-secondary text-editorial-primary border border-editorial-border p-3">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white border border-editorial-border p-5 rounded-none shadow-sm flex items-center justify-between">
            <div>
              <span className="text-editorial-muted text-[9px] font-bold uppercase tracking-widest block">Reservas Ativas</span>
              <span className="text-2xl font-serif font-bold text-editorial-primary mt-1 block">{activeReservationsCount} registradas</span>
            </div>
            <div className="bg-editorial-secondary text-editorial-primary border border-editorial-border p-3">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white border border-editorial-border p-5 rounded-none shadow-sm flex items-center justify-between">
            <div>
              <span className="text-editorial-muted text-[9px] font-bold uppercase tracking-widest block">Pousadas Parceiras</span>
              <span className="text-2xl font-serif font-bold text-editorial-primary mt-1 block">{pousadas.length} ativas</span>
            </div>
            <div className="bg-editorial-secondary text-editorial-primary border border-editorial-border p-3">
              <Building2 className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white border border-editorial-border p-5 rounded-none shadow-sm flex items-center justify-between">
            <div>
              <span className="text-editorial-muted text-[9px] font-bold uppercase tracking-widest block">Aguardando Aprovação</span>
              <span className="text-2xl font-serif font-bold text-amber-800 mt-1 block">{pendingConfirmation} de reservas</span>
            </div>
            <div className="bg-amber-50 text-amber-900 border border-amber-200 p-3">
              <Clock className="h-5 w-5 animate-pulse" />
            </div>
          </div>

        </div>

        {/* Referral source stats */}
        <div className="mb-8">
          <ReferralStatsWidget />
        </div>

        {/* NAVIGATION TABS */}
        <div className="flex border-b border-editorial-border mb-6 overflow-x-auto gap-6">
          <button
            onClick={() => setActiveTab("bookings")}
            className={`pb-3 text-[11px] uppercase tracking-widest font-bold border-b-2 transition duration-200 whitespace-nowrap px-1 flex items-center gap-2 cursor-pointer ${
              activeTab === "bookings" ? "border-editorial-primary text-editorial-primary font-bold" : "border-transparent text-editorial-muted hover:text-editorial-primary"
            }`}
          >
            📋 Reservas & Confirmações
          </button>
          <button
            onClick={() => setActiveTab("pousadas")}
            className={`pb-3 text-[11px] uppercase tracking-widest font-bold border-b-2 transition duration-200 whitespace-nowrap px-1 flex items-center gap-2 cursor-pointer ${
              activeTab === "pousadas" ? "border-editorial-primary text-editorial-primary font-bold" : "border-transparent text-editorial-muted hover:text-editorial-primary"
            }`}
          >
            🏨 Gestão de Pousadas
          </button>
          <button
            onClick={() => setActiveTab("guides")}
            className={`pb-3 text-[11px] uppercase tracking-widest font-bold border-b-2 transition duration-200 whitespace-nowrap px-1 flex items-center gap-2 cursor-pointer ${
              activeTab === "guides" ? "border-editorial-primary text-editorial-primary font-bold" : "border-transparent text-editorial-muted hover:text-editorial-primary"
            }`}
          >
            🧭 Gestão de Guias
          </button>
          <button
            onClick={() => setActiveTab("agenda")}
            className={`pb-3 text-[11px] uppercase tracking-widest font-bold border-b-2 transition duration-200 whitespace-nowrap px-1 flex items-center gap-2 cursor-pointer ${
              activeTab === "agenda" ? "border-editorial-primary text-editorial-primary font-bold" : "border-transparent text-editorial-muted hover:text-editorial-primary"
            }`}
          >
            📅 Agenda Integrada
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`pb-3 text-[11px] uppercase tracking-widest font-bold border-b-2 transition duration-200 whitespace-nowrap px-1 flex items-center gap-2 cursor-pointer ${
              activeTab === "history" ? "border-editorial-primary text-editorial-primary font-bold" : "border-transparent text-editorial-muted hover:text-editorial-primary"
            }`}
          >
            👤 Histórico de Clientes
          </button>
          <button
            onClick={() => setActiveTab("supabase")}
            className={`pb-3 text-[11px] uppercase tracking-widest font-bold border-b-2 transition duration-200 whitespace-nowrap px-1 flex items-center gap-2 cursor-pointer ${
              activeTab === "supabase" ? "border-editorial-primary text-editorial-primary font-bold" : "border-transparent text-editorial-muted hover:text-editorial-primary"
            }`}
          >
            ⚡ Banco de Dados (Supabase)
          </button>
          <button
            onClick={() => setActiveTab("species")}
            className={`pb-3 text-[11px] uppercase tracking-widest font-bold border-b-2 transition duration-200 whitespace-nowrap px-1 flex items-center gap-2 cursor-pointer ${
              activeTab === "species" ? "border-editorial-primary text-editorial-primary font-bold" : "border-transparent text-editorial-muted hover:text-editorial-primary"
            }`}
          >
            🐾 Gestão de Espécies
          </button>
          <button
            onClick={() => setActiveTab("turismo")}
            className={`pb-3 text-[11px] uppercase tracking-widest font-bold border-b-2 transition duration-200 whitespace-nowrap px-1 flex items-center gap-2 cursor-pointer ${
              activeTab === "turismo" ? "border-editorial-primary text-editorial-primary font-bold" : "border-transparent text-editorial-muted hover:text-editorial-primary"
            }`}
          >
            🗺️ Turistas & Roteiros
          </button>
          <button
            onClick={() => setActiveTab("candidaturas")}
            className={`pb-3 text-[11px] uppercase tracking-widest font-bold border-b-2 transition duration-200 whitespace-nowrap px-1 flex items-center gap-2 cursor-pointer ${
              activeTab === "candidaturas" ? "border-editorial-primary text-editorial-primary font-bold" : "border-transparent text-editorial-muted hover:text-editorial-primary"
            }`}
          >
            🤝 Candidaturas de Parceiros
          </button>
          <button
            onClick={() => setActiveTab("admins")}
            className={`pb-3 text-[11px] uppercase tracking-widest font-bold border-b-2 transition duration-200 whitespace-nowrap px-1 flex items-center gap-2 cursor-pointer ${
              activeTab === "admins" ? "border-editorial-primary text-editorial-primary font-bold" : "border-transparent text-editorial-muted hover:text-editorial-primary"
            }`}
          >
            🔐 Administradores
          </button>
        </div>

        {/* TAB: TURISTAS, ROTEIROS, RESERVAS, PAGAMENTOS, GUIAS (camada adicional) */}
        {activeTab === "turismo" && <TurismoPanel />}

        {/* TAB: CANDIDATURAS DE PARCEIROS (cadastro público /seja-parceiro) */}
        {activeTab === "candidaturas" && <CandidaturasPanel />}

        {/* TAB: GESTÃO DE ADMINISTRADORES (Supabase Auth) */}
        {activeTab === "admins" && <AdminUsersPanel />}

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
              <span className="text-zinc-500 text-xs font-semibold">{filteredBookings.length} reservas filtradas</span>
            </div>

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
                                  <option key={g.id} value={g.id}>{g.name} ({g.specialty[0]})</option>
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

            {/* In-app administrative log activities */}
            <div id="notifications-panel" className="bg-zinc-900 text-white rounded-2xl p-6 border border-zinc-800 shadow-lg">
              <h3 className="font-extrabold text-sm mb-4 flex items-center gap-2 text-emerald-400"><Clock className="h-4.5 w-4.5" /> Histórico de Alertas de Sistema (Webhooks)</h3>
              <div className="space-y-3 max-h-52 overflow-y-auto pr-2 scrollbar-thin">
                {notifications.map((notif) => (
                  <div key={notif.id} className={`flex items-start justify-between p-3 rounded-lg text-xs border ${notif.read ? "bg-zinc-800/30 border-zinc-800 text-zinc-400" : "bg-emerald-950/20 border-emerald-900/30 text-zinc-100"}`}>
                    <div className="flex gap-2">
                      <span className="mt-0.5">🔔</span>
                      <p className="leading-relaxed">{notif.message}</p>
                    </div>
                    {!notif.read && (
                      <button
                        onClick={() => handleMarkNotificationRead(notif.id)}
                        className="text-[10px] font-bold text-emerald-400 hover:underline shrink-0"
                      >
                        Marcar como Lida
                      </button>
                    )}
                  </div>
                ))}
              </div>
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-zinc-700 font-semibold mb-1">Idiomas Falados</label>
                    <TagInput
                      value={guideForm.languages}
                      onChange={languages => setGuideForm(prev => ({ ...prev, languages }))}
                      placeholder="Ex: Português"
                    />
                  </div>
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
                    <select
                      value={guideForm.status}
                      onChange={e => setGuideForm(prev => ({ ...prev, status: e.target.value as any }))}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="disponivel">Disponível</option>
                      <option value="indisponivel">Indisponível</option>
                    </select>
                  </div>
                </div>

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
                          {g.languages.map((l, i) => (
                            <span key={i} className="bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded text-[10px] border border-zinc-200">{l}</span>
                          ))}
                        </div>
                      </td>
                      <td className="p-4 font-medium text-zinc-700">
                        {g.specialty.join(", ")}
                      </td>
                      <td className="p-4">
                        {g.status === "disponivel" ? (
                          <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 rounded-full font-bold">Disponível</span>
                        ) : (
                          <span className="bg-zinc-100 text-zinc-600 border border-zinc-200 px-2 py-1 rounded-full font-bold">Indisponível</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleDeleteGuide(g.id)}
                          className="text-red-500 hover:text-red-700 p-2 rounded hover:bg-red-50 transition"
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
                  <a
                    href="/api/auth/google/disconnect"
                    className="bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 px-4 py-2 text-xs font-bold uppercase tracking-widest transition cursor-pointer inline-block"
                  >
                    Desconectar Conta
                  </a>
                ) : (
                  <a
                    href="/api/auth/google"
                    className="bg-editorial-primary text-white hover:bg-editorial-primary/95 px-4 py-2 text-xs font-bold uppercase tracking-widest transition cursor-pointer inline-block"
                  >
                    Conectar Google Calendar
                  </a>
                )}
              </div>
            </div>

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

        {/* TAB 6: SUPABASE DATABASE */}
        {activeTab === "supabase" && (
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-4">
              <div>
                <h3 className="font-serif font-bold text-editorial-primary text-xl mb-1 flex items-center gap-1.5">⚡ Conexão Supabase Real-Time</h3>
                <p className="text-zinc-500 text-xs">Monitore o status do seu banco de dados na nuvem e configure as tabelas com um único clique.</p>
              </div>
              <button
                onClick={fetchSupabaseStatus}
                disabled={loadingSupabase}
                className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold px-4 py-2 rounded-lg transition"
              >
                {loadingSupabase ? "Verificando..." : "🔄 Atualizar Status"}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Status and Diagnostics */}
              <div className="lg:col-span-1 space-y-4">
                <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50">
                  <h4 className="font-bold text-xs text-zinc-500 uppercase tracking-wider mb-3">Status de Conexão</h4>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="relative flex h-3.5 w-3.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                    </span>
                    <span className="font-bold text-sm text-zinc-900">Supabase Conectado</span>
                  </div>
                  <div className="text-[11px] text-zinc-500 break-all bg-white p-2 border border-zinc-200 font-mono rounded mt-2">
                    URL: {supabaseStatus?.url || "Carregando..."}
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-zinc-200 bg-white space-y-3">
                  <h4 className="font-bold text-xs text-zinc-500 uppercase tracking-wider">Status das Tabelas</h4>
                  {supabaseStatus && supabaseStatus.tables ? (
                    <div className="space-y-2">
                      {Object.entries(supabaseStatus.tables).map(([table, exists]) => (
                        <div key={table} className="flex items-center justify-between text-xs py-1 border-b border-zinc-100 last:border-none">
                          <span className="font-mono text-zinc-700 font-semibold">{table}</span>
                          {exists ? (
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                              ✓ Criada
                            </span>
                          ) : (
                            <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                              ⚠️ Não Encontrada
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500 animate-pulse">Carregando status das tabelas...</div>
                  )}
                </div>

                {/* Fake-data guard: flags rows matching the old hardcoded
                    demo dataset's ids, which this app hasn't written since
                    switching to UUIDs — a reliable sign that some other
                    deployment is still seeding fake data into this database. */}
                <div className={`p-4 rounded-xl border space-y-3 ${fakeDataCheck && !fakeDataCheck.clean ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white"}`}>
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs text-zinc-500 uppercase tracking-wider">Verificação de Dados Fake</h4>
                    <button
                      onClick={fetchFakeDataCheck}
                      disabled={checkingFakeData}
                      className="text-[10px] font-bold text-zinc-500 hover:text-zinc-800 transition cursor-pointer"
                    >
                      {checkingFakeData ? "Verificando..." : "🔄 Verificar"}
                    </button>
                  </div>
                  {!fakeDataCheck ? (
                    <div className="text-xs text-zinc-500 animate-pulse">Verificando...</div>
                  ) : fakeDataCheck.clean ? (
                    <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5">✓ Nenhum dado fake encontrado</div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-red-700 font-semibold">
                        Encontrados registros com os IDs do antigo dataset de demonstração — sinal de que algo (provavelmente um deploy antigo ainda ativo) está gravando dado fake direto no banco:
                      </p>
                      <ul className="text-[11px] font-mono text-red-800 space-y-0.5">
                        {Object.entries(fakeDataCheck.found).map(([table, ids]) => (
                          <li key={table}>{table}: {ids.join(", ")}</li>
                        ))}
                      </ul>
                      <button
                        onClick={handlePurgeFakeData}
                        disabled={purgingFakeData}
                        className="w-full bg-red-600 hover:bg-red-700 text-white text-[10px] uppercase tracking-widest font-bold py-2.5 rounded-lg transition disabled:opacity-60 cursor-pointer"
                      >
                        {purgingFakeData ? "Removendo..." : "🗑️ Remover esses registros"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Instructions and SQL */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-zinc-950 text-zinc-100 p-6 rounded-2xl border border-zinc-800 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <div>
                      <h4 className="text-sm font-extrabold text-emerald-400 font-serif">Como inicializar as tabelas no Supabase?</h4>
                      <p className="text-zinc-400 text-[11px] mt-0.5">Siga os 3 passos simples abaixo para ativar a sincronização 100% perfeita.</p>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`
CREATE TABLE IF NOT EXISTS pousadas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  "longDescription" TEXT,
  location TEXT,
  rating FLOAT DEFAULT 5.0,
  "pricePerNight" NUMERIC DEFAULT 0,
  images TEXT, -- stored as JSON string
  features TEXT, -- stored as JSON string
  activities TEXT, -- stored as JSON string
  experiences TEXT, -- stored as JSON string
  capacity INTEGER DEFAULT 1,
  "videoUrl" TEXT
);

CREATE TABLE IF NOT EXISTS guides (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  languages TEXT, -- stored as JSON string
  specialty TEXT, -- stored as JSON string
  status TEXT DEFAULT 'disponivel',
  email TEXT,
  phone TEXT
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  "pousadaId" TEXT,
  "pousadaName" TEXT,
  "customerName" TEXT,
  "customerEmail" TEXT,
  "customerPhone" TEXT,
  nationality TEXT,
  adults INTEGER DEFAULT 1,
  children INTEGER DEFAULT 0,
  "childAges" TEXT,
  "dietaryRestrictions" TEXT,
  "specialNeeds" TEXT,
  "checkIn" TEXT,
  "checkOut" TEXT,
  "experienceType" TEXT,
  "totalPrice" NUMERIC DEFAULT 0,
  status TEXT,
  "guideId" TEXT,
  "guideName" TEXT,
  "dateCreated" TEXT,
  "googleCalendarEventId" TEXT
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  "pousadaId" TEXT,
  "userName" TEXT,
  rating FLOAT,
  comment TEXT,
  date TEXT
);

CREATE TABLE IF NOT EXISTS sightings (
  id TEXT PRIMARY KEY,
  "pousadaId" TEXT,
  "pousadaName" TEXT,
  "userName" TEXT,
  "animalName" TEXT,
  "imageUrl" TEXT,
  location TEXT,
  timestamp TEXT,
  likes INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  target TEXT,
  "targetId" TEXT,
  message TEXT,
  type TEXT,
  timestamp TEXT,
  read BOOLEAN DEFAULT false,
  "bookingId" TEXT
);

CREATE TABLE IF NOT EXISTS species (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "scientificName" TEXT,
  category TEXT,
  description TEXT,
  details TEXT,
  sightings TEXT,
  image TEXT,
  "bestPousadaId" TEXT,
  "bestPousadaName" TEXT
);

-- Ativar RLS e permitir acessos públicos para todas as tabelas criadas acima
ALTER TABLE pousadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE sightings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE species ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura pública" ON pousadas;
DROP POLICY IF EXISTS "Permitir leitura pública" ON guides;
DROP POLICY IF EXISTS "Permitir leitura pública" ON bookings;
DROP POLICY IF EXISTS "Permitir leitura pública" ON reviews;
DROP POLICY IF EXISTS "Permitir leitura pública" ON sightings;
DROP POLICY IF EXISTS "Permitir leitura pública" ON notifications;
DROP POLICY IF EXISTS "Permitir leitura pública" ON species;

CREATE POLICY "Permitir leitura pública" ON pousadas FOR SELECT USING (true);
CREATE POLICY "Permitir leitura pública" ON guides FOR SELECT USING (true);
CREATE POLICY "Permitir leitura pública" ON bookings FOR SELECT USING (true);
CREATE POLICY "Permitir leitura pública" ON reviews FOR SELECT USING (true);
CREATE POLICY "Permitir leitura pública" ON sightings FOR SELECT USING (true);
CREATE POLICY "Permitir leitura pública" ON notifications FOR SELECT USING (true);
CREATE POLICY "Permitir leitura pública" ON species FOR SELECT USING (true);

-- Permitir inserção, atualização e deleção para facilitar o fluxo local do painel e simulator
CREATE POLICY "Permitir inserção pública" ON bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização pública" ON bookings FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Permitir inserção de avaliações" ON reviews FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir inserção de avistamentos" ON sightings FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir inserção de notificações" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de notificações" ON notifications FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Permitir inserção de espécies" ON species FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de espécies" ON species FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Permitir deleção de espécies" ON species FOR DELETE USING (true);
                        `);
                        setCopiedSql(true);
                        setTimeout(() => setCopiedSql(false), 2000);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded transition shadow-sm flex items-center gap-1 cursor-pointer"
                    >
                      {copiedSql ? "✓ Copiado!" : "📋 Copiar Código SQL"}
                    </button>
                  </div>

                  <div className="space-y-3 text-xs leading-relaxed text-zinc-300">
                    <p>
                      1️⃣ Acesse seu painel do <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-emerald-400 font-bold hover:underline">Supabase</a> e clique no seu projeto.
                    </p>
                    <p>
                      2️⃣ No menu lateral esquerdo, clique em <strong>SQL Editor</strong> e depois em <strong>New query</strong>.
                    </p>
                    <p>
                      3️⃣ Cole o código SQL que você copiou do botão acima e clique em <strong>Run</strong> (ou aperte Ctrl+Enter/Cmd+Enter).
                    </p>
                    <div className="bg-emerald-950/20 border border-emerald-900/30 p-3 text-[11px] text-emerald-400 rounded-lg">
                      <strong>💡 Nota de Sincronização:</strong> Assim que as tabelas forem criadas com sucesso no editor do Supabase, este painel detectará automaticamente e importará/exportará todos os dados iniciais. Qualquer reserva feita pelos hóspedes no Aplicativo Móvel será salva no banco do Supabase!
                    </div>
                  </div>
                </div>
              </div>
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
    </div>
  );
}
