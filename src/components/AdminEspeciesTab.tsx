import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Pousada, Species } from "../types";
import { adminFetch } from "../lib/adminFetch";
import ImageUploadButton from "./ImageUploadButton";
import Pagination from "./Pagination";
import { usePagination } from "../lib/usePagination";


// Aba "Espécies" do painel de Gestão — extraída do AdminDashboard.tsx.
interface AdminEspeciesTabProps {
  species: Species[];
  pousadas: Pousada[];
  onRefreshData: () => void;
}

export default function AdminEspeciesTab({ species, pousadas, onRefreshData }: AdminEspeciesTabProps) {

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
    if (!window.confirm("Deseja realmente remover esta espécie silvestre? Ela some do sistema, mas fica guardada na Lixeira (aba Sistema) por 30 dias caso precise restaurar.")) return;
    try {
      const response = await adminFetch(`/api/species/${id}`, { method: "DELETE" });
      if (response.ok) onRefreshData();
    } catch (err) {
      console.error(err);
    }
  };
  const speciesPagination = usePagination(species, 20);

  return (
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
        );
}
