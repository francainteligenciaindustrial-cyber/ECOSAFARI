import React, { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";
import { useToast } from "../lib/ToastProvider";
import { Pousada } from "../types";

interface NewBookingFormProps {
  pousadas: Pousada[];
  onClose: () => void;
  onCreated: () => void;
}

const inputClass = "w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500";

// Criação manual de reserva pela equipe (telefone, walk-in, ou pra
// registrar o que já foi combinado no WhatsApp) — antes não existia
// nenhuma UI pra isso, só o endpoint (POST /api/bookings, sempre
// requireAdmin). Quando a pousada tem "rooms" cadastrado, oferece escolher
// o tipo de quarto — a checagem de disponibilidade no servidor passou a
// validar por UNIDADE daquele tipo, não só a capacidade agregada da
// pousada, que permitia duas reservas "cabendo no total" mas pedindo o
// mesmo quarto físico ao mesmo tempo.
export default function NewBookingForm({ pousadas, onClose, onCreated }: NewBookingFormProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState({
    pousadaId: "",
    roomType: "",
    checkIn: "",
    checkOut: "",
    adults: "2",
    children: "0",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    nationality: "Brasileira",
    experienceType: "",
    dietaryRestrictions: "",
    specialNeeds: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<{ checkIn: string; checkOut: string; note: string } | null>(null);

  const selectedPousada = pousadas.find(p => p.id === form.pousadaId) || null;
  const rooms = selectedPousada?.rooms || [];
  const experiences = selectedPousada?.experiences || [];

  const handlePousadaChange = (pousadaId: string) => {
    setForm(prev => ({ ...prev, pousadaId, roomType: "", experienceType: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    setSuggestion(null);
    try {
      const res = await adminFetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pousadaId: form.pousadaId,
          roomType: form.roomType || undefined,
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          adults: Number(form.adults),
          children: Number(form.children),
          customerName: form.customerName,
          customerEmail: form.customerEmail,
          customerPhone: form.customerPhone,
          nationality: form.nationality,
          experienceType: form.experienceType || undefined,
          dietaryRestrictions: form.dietaryRestrictions,
          specialNeeds: form.specialNeeds,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Erro ao criar reserva.");
        if (body.suggestions?.[0]) setSuggestion(body.suggestions[0]);
        return;
      }
      showToast(`Reserva criada para ${form.customerName || "cliente"}.`, "success");
      onCreated();
      onClose();
    } catch {
      setError("Erro ao criar reserva.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-md space-y-4">
      <h3 className="font-bold text-base text-zinc-900 border-b border-zinc-100 pb-2">Nova Reserva</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div>
          <label className="block text-zinc-700 font-semibold mb-1">Pousada</label>
          <select required value={form.pousadaId} onChange={e => handlePousadaChange(e.target.value)} className={inputClass}>
            <option value="" disabled>Selecione...</option>
            {pousadas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-zinc-700 font-semibold mb-1">
            Tipo de quarto {rooms.length === 0 && <span className="text-zinc-400 font-normal">(pousada sem quartos cadastrados)</span>}
          </label>
          <select
            value={form.roomType}
            onChange={e => setForm(prev => ({ ...prev, roomType: e.target.value }))}
            disabled={rooms.length === 0}
            className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <option value="">Sem tipo específico (checa capacidade total)</option>
            {rooms.map((r, i) => (
              <option key={i} value={r.type}>{r.type} — até {r.capacity} hóspedes, {r.quantity} unidade(s)</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <label className="block text-zinc-700 font-semibold mb-1">Check-in</label>
          <input type="date" required value={form.checkIn} onChange={e => setForm(prev => ({ ...prev, checkIn: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-zinc-700 font-semibold mb-1">Check-out</label>
          <input type="date" required value={form.checkOut} onChange={e => setForm(prev => ({ ...prev, checkOut: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-zinc-700 font-semibold mb-1">Adultos</label>
          <input type="number" min={1} required value={form.adults} onChange={e => setForm(prev => ({ ...prev, adults: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-zinc-700 font-semibold mb-1">Crianças</label>
          <input type="number" min={0} value={form.children} onChange={e => setForm(prev => ({ ...prev, children: e.target.value }))} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div>
          <label className="block text-zinc-700 font-semibold mb-1">Nome do cliente</label>
          <input type="text" required value={form.customerName} onChange={e => setForm(prev => ({ ...prev, customerName: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-zinc-700 font-semibold mb-1">Email</label>
          <input type="email" required value={form.customerEmail} onChange={e => setForm(prev => ({ ...prev, customerEmail: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-zinc-700 font-semibold mb-1">Telefone</label>
          <input type="tel" required value={form.customerPhone} onChange={e => setForm(prev => ({ ...prev, customerPhone: e.target.value }))} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div>
          <label className="block text-zinc-700 font-semibold mb-1">Nacionalidade</label>
          <input type="text" value={form.nationality} onChange={e => setForm(prev => ({ ...prev, nationality: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-zinc-700 font-semibold mb-1">Experiência (opcional)</label>
          <select value={form.experienceType} onChange={e => setForm(prev => ({ ...prev, experienceType: e.target.value }))} className={inputClass}>
            <option value="">Padrão</option>
            {experiences.map((exp, i) => <option key={i} value={exp.title}>{exp.title}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div>
          <label className="block text-zinc-700 font-semibold mb-1">Restrições alimentares</label>
          <input type="text" value={form.dietaryRestrictions} onChange={e => setForm(prev => ({ ...prev, dietaryRestrictions: e.target.value }))} placeholder="Nenhuma" className={inputClass} />
        </div>
        <div>
          <label className="block text-zinc-700 font-semibold mb-1">Necessidades especiais</label>
          <input type="text" value={form.specialNeeds} onChange={e => setForm(prev => ({ ...prev, specialNeeds: e.target.value }))} placeholder="Nenhuma" className={inputClass} />
        </div>
      </div>

      {error && (
        <div className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-xs">
          <p className="font-semibold">{error}</p>
          {suggestion && (
            <p className="mt-1">Sugestão: {suggestion.checkIn} até {suggestion.checkOut} ({suggestion.note}).</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-zinc-100">
        <button
          type="submit"
          disabled={submitting}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition flex items-center gap-1.5 shadow-sm disabled:opacity-60"
        >
          {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          {submitting ? "Criando..." : "Criar Reserva"}
        </button>
        <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-700 text-xs font-semibold">
          Cancelar
        </button>
      </div>
    </form>
  );
}
