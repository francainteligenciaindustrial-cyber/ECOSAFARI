import React, { useState } from "react";
import { Plus, Trash2, Edit3, BadgeCheck, Eye, KeyRound } from "lucide-react";
import { Pousada } from "../types";
import { adminFetch } from "../lib/adminFetch";
import ImageUploadButton from "./ImageUploadButton";
import TagInput from "./TagInput";
import ExperienceListEditor, { ExperienceDraft } from "./ExperienceListEditor";
import RoomsEditor, { RoomDraft } from "./RoomsEditor";
import Pagination from "./Pagination";
import { usePagination } from "../lib/usePagination";


// Aba "Pousadas (cadastro e lista)" do painel de Gestão — extraída do AdminDashboard.tsx.
interface AdminPousadasTabProps {
  pousadas: Pousada[];
  onRefreshData: () => void;
  setManagingPousadaAccess: React.Dispatch<React.SetStateAction<Pousada>>;
  setEditingPousadaId: React.Dispatch<React.SetStateAction<string>>;
  setEditPousadaForm: React.Dispatch<React.SetStateAction<{ name: string; description: string; longDescription: string; location: string; pricePerNight: number; capacity: number; features: string[]; activities: string[]; experiences: ExperienceDraft[]; images: string[]; officialSiteImages: string[]; videoUrl: string; officialSiteUrl: string; rooms: RoomDraft[]; latitude: number; longitude: number; emailRemetente: string; emailRemetenteNome: string; emailContato: string; customDomain: string; sitePublicado: boolean; }>>;
}

export default function AdminPousadasTab({ pousadas, onRefreshData, setManagingPousadaAccess, setEditingPousadaId, setEditPousadaForm }: AdminPousadasTabProps) {
  const [showAddPousada, setShowAddPousada] = useState(false);

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
      rooms: [...(p.rooms || [])],
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      emailRemetente: p.emailRemetente || "",
      emailRemetenteNome: p.emailRemetenteNome || "",
      emailContato: p.emailContato || "",
      customDomain: p.customDomain || "",
      sitePublicado: !!p.sitePublicado
    });
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

  const handleDeletePousada = async (id: string) => {
    if (!window.confirm("Deseja realmente remover esta pousada parceira? Ela some do sistema, mas fica guardada na Lixeira (aba Sistema) por 30 dias caso precise restaurar.")) return;
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
  const pousadasPagination = usePagination(pousadas, 10);

  return (
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
                        <button aria-label="Gerenciar acesso de parceiro"
                          onClick={() => setManagingPousadaAccess(p)}
                          className="text-zinc-500 hover:text-editorial-primary hover:bg-zinc-100 p-1.5 rounded transition cursor-pointer"
                          title="Gerenciar acesso de parceiro"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button aria-label="Excluir Pousada"
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
        );
}
