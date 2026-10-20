import React, { useState } from "react";
import { Users, X, Plus, Trash2, Edit3, Search, KeyRound } from "lucide-react";
import { Guide, GuideLanguage } from "../types";
import { adminFetch } from "../lib/adminFetch";
import ImageUploadButton from "./ImageUploadButton";
import TagInput from "./TagInput";
import ToggleSwitch from "./ToggleSwitch";
import LanguagesEditor, { LEVEL_LABELS } from "./LanguagesEditor";
import ImageListEditor from "./ImageListEditor";
import Pagination from "./Pagination";
import GuideAvailabilityCalendar from "./GuideAvailabilityCalendar";
import { usePagination } from "../lib/usePagination";


// Aba "Guias (cadastro, edição e lista)" do painel de Gestão — extraída do AdminDashboard.tsx.
interface AdminGuiasTabProps {
  guides: Guide[];
  setManagingGuideAccess: React.Dispatch<React.SetStateAction<Guide>>;
  fetchGuides: () => Promise<void>;
}

export default function AdminGuiasTab({ guides, setManagingGuideAccess, fetchGuides }: AdminGuiasTabProps) {
  const [showAddGuide, setShowAddGuide] = useState(false);

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

  const handleDeleteGuide = async (id: string) => {
    if (!window.confirm("Deseja realmente remover este guia turístico? Ele some do sistema, mas fica guardado na Lixeira (aba Sistema) por 30 dias caso precise restaurar.")) return;
    try {
      const response = await adminFetch(`/api/guides/${id}`, { method: "DELETE" });
      if (response.ok) fetchGuides();
    } catch (err) {
      console.error(err);
    }
  };

  // Filtro da aba Guias — nome, idiomas falados e especialidade/foco.
  const [guideSearch, setGuideSearch] = useState("");
  const filteredGuides = guides.filter(g => {
    if (!guideSearch.trim()) return true;
    const q = guideSearch.toLowerCase();
    return (
      g.name.toLowerCase().includes(q) ||
      (g.languages || []).some(l => l.language.toLowerCase().includes(q)) ||
      (g.specialty || []).some(s => s.toLowerCase().includes(q))
    );
  });
  const guidesPagination = usePagination(filteredGuides, 20);

  return (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white p-4 border border-zinc-200 rounded-2xl">
              <span className="font-bold text-sm text-zinc-800 flex-shrink-0">Total: {guides.length} guias cadastrados{guideSearch && ` (${filteredGuides.length} encontrados)`}</span>
              <div className="flex items-center gap-2 flex-1 sm:flex-none sm:justify-end">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text" value={guideSearch} onChange={e => setGuideSearch(e.target.value)}
                    placeholder="Buscar por nome, idioma ou especialidade..."
                    className="pl-8 pr-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-emerald-500 w-full sm:w-72"
                  />
                </div>
                <button
                  onClick={() => setShowAddGuide(!showAddGuide)}
                  className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="h-4 w-4" /> Cadastrar Novo Guia
                </button>
              </div>
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
                    <button aria-label="Fechar" type="button" onClick={() => setEditingGuideId(null)} className="text-zinc-400 hover:text-zinc-700 transition cursor-pointer">
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
                        <button aria-label="Gerenciar acesso de parceiro"
                          onClick={() => setManagingGuideAccess(g)}
                          className="text-zinc-500 hover:text-editorial-primary p-2 rounded hover:bg-zinc-50 transition cursor-pointer"
                          title="Gerenciar acesso de parceiro"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button aria-label="Editar Guia"
                          onClick={() => openEditGuide(g)}
                          className="text-zinc-500 hover:text-editorial-primary p-2 rounded hover:bg-zinc-50 transition cursor-pointer"
                          title="Editar Guia"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button aria-label="Excluir Guia"
                          onClick={() => handleDeleteGuide(g.id)}
                          className="text-red-500 hover:text-red-700 p-2 rounded hover:bg-red-50 transition cursor-pointer"
                          title="Excluir Guia"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredGuides.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center p-8 text-zinc-400">
                        {guides.length === 0 ? "Nenhum guia cadastrado ainda." : "Nenhum guia encontrado com esse filtro."}
                      </td>
                    </tr>
                  )}
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
        );
}
