import React, { useState, useEffect } from "react";
import { Users, MapIcon, CalendarCheck, CreditCard, Compass, Plus, Trash2, LoaderCircle } from "lucide-react";
import { Turista, Roteiro, Reserva, Pagamento, GuiaTuristico } from "../types";
import { adminFetch } from "../lib/adminFetch";
import Pagination from "./Pagination";
import { usePagination } from "../lib/usePagination";

type Section = "turistas" | "roteiros" | "reservas" | "pagamentos" | "guias";

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "turistas", label: "Turistas", icon: <Users className="h-3.5 w-3.5" /> },
  { id: "roteiros", label: "Roteiros", icon: <MapIcon className="h-3.5 w-3.5" /> },
  { id: "reservas", label: "Reservas", icon: <CalendarCheck className="h-3.5 w-3.5" /> },
  { id: "pagamentos", label: "Pagamentos", icon: <CreditCard className="h-3.5 w-3.5" /> },
  { id: "guias", label: "Guias", icon: <Compass className="h-3.5 w-3.5" /> },
];

export default function TurismoPanel() {
  const [activeSection, setActiveSection] = useState<Section>("turistas");
  const [loading, setLoading] = useState(true);

  const [turistas, setTuristas] = useState<Turista[]>([]);
  const [roteiros, setRoteiros] = useState<Roteiro[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [guias, setGuias] = useState<GuiaTuristico[]>([]);

  const [showAddForm, setShowAddForm] = useState(false);

  const fetchAll = async () => {
    try {
      const [tRes, rtRes, rvRes, pgRes, gRes] = await Promise.all([
        adminFetch("/api/turistas"),
        adminFetch("/api/roteiros"),
        adminFetch("/api/reservas"),
        adminFetch("/api/pagamentos"),
        adminFetch("/api/guias"),
      ]);
      setTuristas(await tRes.json());
      setRoteiros(await rtRes.json());
      setReservas(await rvRes.json());
      setPagamentos(await pgRes.json());
      setGuias(await gRes.json());
    } catch (err) {
      console.error("Erro ao carregar dados de turismo:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleDelete = async (endpoint: string, id: string) => {
    if (!confirm("Tem certeza que deseja excluir este registro?")) return;
    await adminFetch(`/api/${endpoint}/${id}`, { method: "DELETE" });
    fetchAll();
  };

  const roteiroName = (id: string) => roteiros.find(r => r.id === id)?.name || id;
  const turistaName = (id: string) => turistas.find(t => t.id === id)?.name || id;
  const reservaLabel = (id: string) => {
    const rv = reservas.find(r => r.id === id);
    if (!rv) return id;
    return `${turistaName(rv.turistaId)} · ${roteiroName(rv.roteiroId)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-editorial-muted gap-2">
        <LoaderCircle className="h-5 w-5 animate-spin" />
        <span className="text-xs uppercase tracking-widest font-bold">Carregando dados de turismo...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2 mb-6">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => { setActiveSection(s.id); setShowAddForm(false); }}
            className={`flex items-center gap-1.5 px-4 py-2 text-[11px] uppercase tracking-widest font-bold border transition cursor-pointer ${
              activeSection === s.id
                ? "bg-editorial-primary text-white border-editorial-primary"
                : "bg-white text-editorial-muted border-editorial-border hover:text-editorial-primary"
            }`}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-editorial-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm uppercase tracking-widest font-bold text-editorial-primary">
            {SECTIONS.find(s => s.id === activeSection)?.label}
          </h3>
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-editorial-primary hover:opacity-80 transition cursor-pointer"
          >
            <Plus className="h-4 w-4" /> {showAddForm ? "Cancelar" : "Adicionar"}
          </button>
        </div>

        {activeSection === "turistas" && (
          <TuristasSection
            items={turistas}
            showAddForm={showAddForm}
            onAdded={() => { setShowAddForm(false); fetchAll(); }}
            onDelete={(id) => handleDelete("turistas", id)}
          />
        )}
        {activeSection === "roteiros" && (
          <RoteirosSection
            items={roteiros}
            showAddForm={showAddForm}
            onAdded={() => { setShowAddForm(false); fetchAll(); }}
            onDelete={(id) => handleDelete("roteiros", id)}
          />
        )}
        {activeSection === "reservas" && (
          <ReservasSection
            items={reservas}
            turistas={turistas}
            roteiros={roteiros}
            showAddForm={showAddForm}
            onAdded={() => { setShowAddForm(false); fetchAll(); }}
            onDelete={(id) => handleDelete("reservas", id)}
            turistaName={turistaName}
            roteiroName={roteiroName}
          />
        )}
        {activeSection === "pagamentos" && (
          <PagamentosSection
            items={pagamentos}
            reservas={reservas}
            showAddForm={showAddForm}
            onAdded={() => { setShowAddForm(false); fetchAll(); }}
            onDelete={(id) => handleDelete("pagamentos", id)}
            reservaLabel={reservaLabel}
          />
        )}
        {activeSection === "guias" && (
          <GuiasSection
            items={guias}
            showAddForm={showAddForm}
            onAdded={() => { setShowAddForm(false); fetchAll(); }}
            onDelete={(id) => handleDelete("guias", id)}
          />
        )}
      </div>
    </div>
  );
}

// ---------------- Shared table styling helpers ----------------

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="text-left text-[10px] uppercase tracking-widest font-bold text-editorial-muted pb-2 pr-4">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`text-xs text-editorial-text py-2 pr-4 align-top ${className}`}>{children}</td>;
}
function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-center text-editorial-muted text-xs py-6">Nenhum registro cadastrado.</td>
    </tr>
  );
}
function FormInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="border border-editorial-border px-3 py-2 text-xs rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary w-full" />;
}
function FormSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="border border-editorial-border px-3 py-2 text-xs rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary w-full bg-white" />;
}

// ---------------- Turistas ----------------

function TuristasSection({ items, showAddForm, onAdded, onDelete }: {
  items: Turista[]; showAddForm: boolean; onAdded: () => void; onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", whatsapp: "", country: "", age: "", preferences: "" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await adminFetch("/api/turistas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, age: parseInt(form.age) || 0 }),
    });
    setForm({ name: "", email: "", whatsapp: "", country: "", age: "", preferences: "" });
    onAdded();
  };
  const pagination = usePagination(items, 15);

  return (
    <div>
      {showAddForm && (
        <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5 pb-5 border-b border-editorial-border">
          <FormInput required placeholder="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <FormInput required type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <FormInput required placeholder="WhatsApp" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} />
          <FormInput required placeholder="País" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} />
          <FormInput required type="number" placeholder="Idade" value={form.age} onChange={e => setForm({ ...form, age: e.target.value })} />
          <FormInput placeholder="Preferências" value={form.preferences} onChange={e => setForm({ ...form, preferences: e.target.value })} />
          <button type="submit" className="col-span-2 md:col-span-3 bg-editorial-primary text-white text-xs uppercase tracking-widest font-bold py-2 rounded-md cursor-pointer">Salvar Turista</button>
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr><Th>Nome</Th><Th>Email</Th><Th>WhatsApp</Th><Th>País</Th><Th>Idade</Th><Th>Preferências</Th><Th></Th></tr></thead>
          <tbody>
            {items.length === 0 && <EmptyRow colSpan={7} />}
            {pagination.pageItems.map(t => (
              <tr key={t.id} className="border-t border-editorial-border/60">
                <Td>{t.name}</Td><Td>{t.email}</Td><Td>{t.whatsapp}</Td><Td>{t.country}</Td><Td>{t.age}</Td><Td>{t.preferences}</Td>
                <Td><button onClick={() => onDelete(t.id)} className="text-red-600 hover:text-red-800 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} onPageChange={pagination.setPage} />
    </div>
  );
}

// ---------------- Roteiros ----------------

function RoteirosSection({ items, showAddForm, onAdded, onDelete }: {
  items: Roteiro[]; showAddForm: boolean; onAdded: () => void; onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState({ name: "", duration: "", price: "", difficulty: "moderado", capacity: "", description: "" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await adminFetch("/api/roteiros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, price: parseFloat(form.price) || 0, capacity: parseInt(form.capacity) || 1 }),
    });
    setForm({ name: "", duration: "", price: "", difficulty: "moderado", capacity: "", description: "" });
    onAdded();
  };
  const pagination = usePagination(items, 15);

  return (
    <div>
      {showAddForm && (
        <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5 pb-5 border-b border-editorial-border">
          <FormInput required placeholder="Nome do roteiro" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <FormInput required placeholder="Duração (ex: 3 dias / 2 noites)" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} />
          <FormInput required type="number" placeholder="Preço (R$)" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
          <FormSelect value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })}>
            <option value="facil">Fácil</option>
            <option value="moderado">Moderado</option>
            <option value="dificil">Difícil</option>
          </FormSelect>
          <FormInput required type="number" placeholder="Capacidade" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} />
          <FormInput placeholder="Descrição" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <button type="submit" className="col-span-2 md:col-span-3 bg-editorial-primary text-white text-xs uppercase tracking-widest font-bold py-2 rounded-md cursor-pointer">Salvar Roteiro</button>
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr><Th>Nome</Th><Th>Duração</Th><Th>Preço</Th><Th>Dificuldade</Th><Th>Capacidade</Th><Th>Descrição</Th><Th></Th></tr></thead>
          <tbody>
            {items.length === 0 && <EmptyRow colSpan={7} />}
            {pagination.pageItems.map(r => (
              <tr key={r.id} className="border-t border-editorial-border/60">
                <Td>{r.name}</Td><Td>{r.duration}</Td><Td>R$ {r.price.toLocaleString('pt-BR')}</Td><Td className="capitalize">{r.difficulty}</Td><Td>{r.capacity}</Td><Td>{r.description}</Td>
                <Td><button onClick={() => onDelete(r.id)} className="text-red-600 hover:text-red-800 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} onPageChange={pagination.setPage} />
    </div>
  );
}

// ---------------- Reservas ----------------

function ReservasSection({ items, turistas, roteiros, showAddForm, onAdded, onDelete, turistaName, roteiroName }: {
  items: Reserva[]; turistas: Turista[]; roteiros: Roteiro[]; showAddForm: boolean; onAdded: () => void; onDelete: (id: string) => void;
  turistaName: (id: string) => string; roteiroName: (id: string) => string;
}) {
  const [form, setForm] = useState({ turistaId: "", roteiroId: "", date: "", status: "pendente", totalPrice: "" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await adminFetch("/api/reservas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, totalPrice: parseFloat(form.totalPrice) || 0 }),
    });
    setForm({ turistaId: "", roteiroId: "", date: "", status: "pendente", totalPrice: "" });
    onAdded();
  };
  const pagination = usePagination(items, 15);

  return (
    <div>
      {showAddForm && (
        <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5 pb-5 border-b border-editorial-border">
          <FormSelect required value={form.turistaId} onChange={e => setForm({ ...form, turistaId: e.target.value })}>
            <option value="">Selecione o turista</option>
            {turistas.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </FormSelect>
          <FormSelect required value={form.roteiroId} onChange={e => setForm({ ...form, roteiroId: e.target.value })}>
            <option value="">Selecione o roteiro</option>
            {roteiros.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </FormSelect>
          <FormInput required type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <FormSelect value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            <option value="pendente">Pendente</option>
            <option value="confirmada">Confirmada</option>
            <option value="cancelada">Cancelada</option>
            <option value="concluida">Concluída</option>
          </FormSelect>
          <FormInput required type="number" placeholder="Preço Total (R$)" value={form.totalPrice} onChange={e => setForm({ ...form, totalPrice: e.target.value })} />
          <button type="submit" className="bg-editorial-primary text-white text-xs uppercase tracking-widest font-bold py-2 rounded-md cursor-pointer">Salvar Reserva</button>
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr><Th>Turista</Th><Th>Roteiro</Th><Th>Data</Th><Th>Status</Th><Th>Preço Total</Th><Th></Th></tr></thead>
          <tbody>
            {items.length === 0 && <EmptyRow colSpan={6} />}
            {pagination.pageItems.map(r => (
              <tr key={r.id} className="border-t border-editorial-border/60">
                <Td>{turistaName(r.turistaId)}</Td><Td>{roteiroName(r.roteiroId)}</Td><Td>{r.date}</Td><Td className="capitalize">{r.status}</Td><Td>R$ {r.totalPrice.toLocaleString('pt-BR')}</Td>
                <Td><button onClick={() => onDelete(r.id)} className="text-red-600 hover:text-red-800 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} onPageChange={pagination.setPage} />
    </div>
  );
}

// ---------------- Pagamentos ----------------

function PagamentosSection({ items, reservas, showAddForm, onAdded, onDelete, reservaLabel }: {
  items: Pagamento[]; reservas: Reserva[]; showAddForm: boolean; onAdded: () => void; onDelete: (id: string) => void;
  reservaLabel: (id: string) => string;
}) {
  const [form, setForm] = useState({ reservaId: "", amount: "", date: "", method: "pix", status: "pendente" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await adminFetch("/api/pagamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount) || 0 }),
    });
    setForm({ reservaId: "", amount: "", date: "", method: "pix", status: "pendente" });
    onAdded();
  };
  const pagination = usePagination(items, 15);

  return (
    <div>
      {showAddForm && (
        <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5 pb-5 border-b border-editorial-border">
          <FormSelect required value={form.reservaId} onChange={e => setForm({ ...form, reservaId: e.target.value })}>
            <option value="">Selecione a reserva</option>
            {reservas.map(r => <option key={r.id} value={r.id}>{reservaLabel(r.id)}</option>)}
          </FormSelect>
          <FormInput required type="number" placeholder="Valor (R$)" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          <FormInput required type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <FormSelect value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
            <option value="pix">Pix</option>
            <option value="cartao">Cartão</option>
            <option value="boleto">Boleto</option>
            <option value="transferencia">Transferência</option>
          </FormSelect>
          <FormSelect value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            <option value="pendente">Pendente</option>
            <option value="aprovado">Aprovado</option>
            <option value="recusado">Recusado</option>
            <option value="estornado">Estornado</option>
          </FormSelect>
          <button type="submit" className="bg-editorial-primary text-white text-xs uppercase tracking-widest font-bold py-2 rounded-md cursor-pointer">Salvar Pagamento</button>
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr><Th>Reserva</Th><Th>Valor</Th><Th>Data</Th><Th>Método</Th><Th>Status</Th><Th></Th></tr></thead>
          <tbody>
            {items.length === 0 && <EmptyRow colSpan={6} />}
            {pagination.pageItems.map(p => (
              <tr key={p.id} className="border-t border-editorial-border/60">
                <Td>{reservaLabel(p.reservaId)}</Td><Td>R$ {p.amount.toLocaleString('pt-BR')}</Td><Td>{p.date}</Td><Td className="capitalize">{p.method}</Td><Td className="capitalize">{p.status}</Td>
                <Td><button onClick={() => onDelete(p.id)} className="text-red-600 hover:text-red-800 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} onPageChange={pagination.setPage} />
    </div>
  );
}

// ---------------- Guias ----------------

function GuiasSection({ items, showAddForm, onAdded, onDelete }: {
  items: GuiaTuristico[]; showAddForm: boolean; onAdded: () => void; onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState({ name: "", specialty: "", phone: "", availability: "true", rating: "" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await adminFetch("/api/guias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, availability: form.availability === "true", rating: parseFloat(form.rating) || 5 }),
    });
    setForm({ name: "", specialty: "", phone: "", availability: "true", rating: "" });
    onAdded();
  };
  const pagination = usePagination(items, 15);

  return (
    <div>
      {showAddForm && (
        <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5 pb-5 border-b border-editorial-border">
          <FormInput required placeholder="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <FormInput required placeholder="Especialidade" value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })} />
          <FormInput required placeholder="Telefone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          <FormSelect value={form.availability} onChange={e => setForm({ ...form, availability: e.target.value })}>
            <option value="true">Disponível</option>
            <option value="false">Indisponível</option>
          </FormSelect>
          <FormInput required type="number" step="0.1" min="0" max="5" placeholder="Avaliação (0-5)" value={form.rating} onChange={e => setForm({ ...form, rating: e.target.value })} />
          <button type="submit" className="bg-editorial-primary text-white text-xs uppercase tracking-widest font-bold py-2 rounded-md cursor-pointer">Salvar Guia</button>
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr><Th>Nome</Th><Th>Especialidade</Th><Th>Telefone</Th><Th>Disponibilidade</Th><Th>Avaliação</Th><Th></Th></tr></thead>
          <tbody>
            {items.length === 0 && <EmptyRow colSpan={6} />}
            {pagination.pageItems.map(g => (
              <tr key={g.id} className="border-t border-editorial-border/60">
                <Td>{g.name}</Td><Td>{g.specialty}</Td><Td>{g.phone}</Td>
                <Td>{g.availability ? "Disponível" : "Indisponível"}</Td><Td>⭐ {g.rating}</Td>
                <Td><button onClick={() => onDelete(g.id)} className="text-red-600 hover:text-red-800 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} onPageChange={pagination.setPage} />
    </div>
  );
}
