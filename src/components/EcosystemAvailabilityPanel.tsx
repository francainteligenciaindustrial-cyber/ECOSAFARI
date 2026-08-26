import React, { useState, useEffect } from "react";
import { CalendarRange, Building2, Compass, MapPin, LoaderCircle, CheckCircle2, XCircle } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";

interface PousadaAvailability {
  id: string;
  name: string;
  location: string;
  rooms?: { type: string; capacity: number; quantity: number; availableUnits: number }[];
  capacity?: number;
  guestsBooked?: number;
  hasAvailability: boolean;
}

interface GuideAvailability {
  id: string;
  name: string;
  specialty: string[];
  languages: { language: string; level: string }[];
  status: string;
  blockedDatesInRange: string[];
  hasAvailability: boolean;
}

interface AtracaoInfo {
  id: string;
  name: string;
  type: string;
  location: string;
  availability: string;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Visão consolidada de disponibilidade de pousadas + guias + atrações num
// período — antes disso, saber "o que está livre" exigia cruzar reservas,
// guias e atrações em telas separadas. Consome GET /api/gestao/agenda
// (server.ts), a mesma camada que vai alimentar a IA quando ela passar a
// montar roteiro personalizado (Fase 3 do que conversamos).
export default function EcosystemAvailabilityPanel() {
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(addDaysISO(3));
  const [loading, setLoading] = useState(true);
  const [pousadas, setPousadas] = useState<PousadaAvailability[]>([]);
  const [guides, setGuides] = useState<GuideAvailability[]>([]);
  const [atracoes, setAtracoes] = useState<AtracaoInfo[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    adminFetch(`/api/gestao/agenda?startDate=${startDate}&endDate=${endDate}`)
      .then(async res => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error || "Erro ao carregar a agenda consolidada.");
          return;
        }
        setPousadas(body.pousadas || []);
        setGuides(body.guides || []);
        setAtracoes(body.atracoes || []);
      })
      .catch(() => setError("Erro ao carregar a agenda consolidada."))
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="font-bold text-base text-zinc-900 flex items-center gap-1.5">
          <CalendarRange className="h-5 w-5 text-emerald-600" /> Agenda do Ecossistema
        </h3>
        <div className="flex items-center gap-2 text-xs">
          <input
            type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="bg-zinc-50 border border-zinc-200 rounded p-1.5 focus:outline-none focus:border-emerald-500"
          />
          <span className="text-zinc-400">até</span>
          <input
            type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
            className="bg-zinc-50 border border-zinc-200 rounded p-1.5 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>
      <p className="text-zinc-500 text-xs -mt-3">
        Quem está livre ou ocupado no período — pousadas por tipo de quarto, guias por bloqueio de agenda, e o que se sabe das atrações.
      </p>

      {loading ? (
        <div className="flex justify-center py-10"><LoaderCircle className="h-5 w-5 text-emerald-600 animate-spin" /></div>
      ) : error ? (
        <p className="text-red-600 text-xs font-medium">{error}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Pousadas */}
          <div>
            <h4 className="text-[11px] uppercase tracking-widest font-bold text-zinc-500 flex items-center gap-1.5 mb-2">
              <Building2 className="h-3.5 w-3.5" /> Pousadas
            </h4>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {pousadas.map(p => (
                <div key={p.id} className="border border-zinc-100 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-zinc-800 truncate">{p.name}</span>
                    {p.hasAvailability ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                  </div>
                  <span className="text-[10px] text-zinc-400 flex items-center gap-1"><MapPin className="h-2.5 w-2.5" /> {p.location}</span>
                  {p.rooms ? (
                    <ul className="mt-1.5 space-y-0.5">
                      {p.rooms.map((r, i) => (
                        <li key={i} className="text-[10px] text-zinc-600 flex justify-between">
                          <span>{r.type}</span>
                          <span className={r.availableUnits > 0 ? "text-emerald-700 font-semibold" : "text-red-500 font-semibold"}>
                            {r.availableUnits}/{r.quantity} livres
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[10px] text-zinc-500 mt-1">{p.guestsBooked}/{p.capacity} hóspedes ocupados (sem tipos de quarto cadastrados)</p>
                  )}
                </div>
              ))}
              {pousadas.length === 0 && <p className="text-zinc-400 text-xs">Nenhuma pousada cadastrada.</p>}
            </div>
          </div>

          {/* Guias */}
          <div>
            <h4 className="text-[11px] uppercase tracking-widest font-bold text-zinc-500 flex items-center gap-1.5 mb-2">
              <Compass className="h-3.5 w-3.5" /> Guias
            </h4>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {guides.map(g => (
                <div key={g.id} className="border border-zinc-100 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-zinc-800 truncate">{g.name}</span>
                    {g.hasAvailability ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                  </div>
                  <p className="text-[10px] text-zinc-500">{(g.specialty || []).slice(0, 2).join(", ") || "—"}</p>
                  {g.status !== "disponivel" && <p className="text-[10px] text-red-500 font-semibold mt-1">Desligado no perfil</p>}
                  {g.blockedDatesInRange.length > 0 && (
                    <p className="text-[10px] text-amber-600 font-semibold mt-1">Bloqueado: {g.blockedDatesInRange.join(", ")}</p>
                  )}
                </div>
              ))}
              {guides.length === 0 && <p className="text-zinc-400 text-xs">Nenhum guia cadastrado.</p>}
            </div>
          </div>

          {/* Atrações */}
          <div>
            <h4 className="text-[11px] uppercase tracking-widest font-bold text-zinc-500 flex items-center gap-1.5 mb-2">
              <MapPin className="h-3.5 w-3.5" /> Atrações
            </h4>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {atracoes.map(a => (
                <div key={a.id} className="border border-zinc-100 rounded-lg p-3">
                  <span className="text-xs font-bold text-zinc-800 truncate block">{a.name}</span>
                  <span className="text-[10px] text-zinc-400">{a.type === "restaurante" ? "Restaurante" : "Parada Legal"} · {a.location}</span>
                  <p className="text-[10px] text-zinc-500 mt-1">{a.availability || "Sem horário informado — sem agenda dinâmica ainda, só texto livre do cadastro."}</p>
                </div>
              ))}
              {atracoes.length === 0 && <p className="text-zinc-400 text-xs">Nenhuma atração cadastrada.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
