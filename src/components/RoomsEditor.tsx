import React from "react";
import { Plus, Trash2, BedDouble } from "lucide-react";

export interface BedDraft {
  bedType: string;
  count: number;
}

export interface RoomDraft {
  type: string;
  capacity: number;
  quantity: number;
  beds?: BedDraft[];
}

// Categorias fixas em vez de texto livre — evita "casal", "Casal", "cama
// de casal" virando 3 valores diferentes no cadastro de pousadas
// distintas, e deixa a busca/exibição pro hóspede consistente.
export const BED_TYPE_OPTIONS = [
  "Cama de casal",
  "Cama de casal king",
  "Cama de solteiro",
  "Beliche",
  "Sofá-cama",
  "Berço",
];

// Row-per-room-type editor — "quantos quartos tem, e quantas pessoas cabem
// em cada um" — mais a configuração de cama de cada tipo de quarto (ex: 1
// cama de casal + 2 de solteiro), o nível de detalhe que um hóspede
// realmente busca antes de reservar, em vez de só uma capacidade agregada.
export default function RoomsEditor({ value, onChange }: { value: RoomDraft[]; onChange: (rooms: RoomDraft[]) => void }) {
  const update = (idx: number, patch: Partial<RoomDraft>) => {
    onChange(value.map((room, i) => (i === idx ? { ...room, ...patch } : room)));
  };

  const updateBeds = (idx: number, beds: BedDraft[]) => update(idx, { beds });

  return (
    <div className="space-y-3">
      {value.map((room, idx) => {
        const beds = room.beds || [];
        return (
          <div key={idx} className="border border-zinc-200 rounded-lg p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={room.type}
                onChange={e => update(idx, { type: e.target.value })}
                placeholder="Tipo de quarto (ex: Standard, Família)"
                className="flex-1 bg-zinc-50 border border-zinc-200 rounded p-2 text-xs focus:outline-none focus:border-emerald-500"
              />
              <span className="text-zinc-400 text-[11px] font-semibold flex-shrink-0">Qtd.</span>
              <input
                type="number"
                min={1}
                value={room.quantity}
                onChange={e => update(idx, { quantity: Number(e.target.value) })}
                className="w-16 bg-zinc-50 border border-zinc-200 rounded p-2 text-xs focus:outline-none focus:border-emerald-500"
              />
              <span className="text-zinc-400 text-[11px] font-semibold flex-shrink-0">Pessoas</span>
              <input
                type="number"
                min={1}
                value={room.capacity}
                onChange={e => update(idx, { capacity: Number(e.target.value) })}
                className="w-16 bg-zinc-50 border border-zinc-200 rounded p-2 text-xs focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== idx))}
                className="text-zinc-400 hover:text-red-600 transition cursor-pointer flex-shrink-0"
                title="Remover tipo de quarto"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {/* Configuração de camas — opcional, detalha o que já está
                dentro de "Pessoas" acima (ex: 4 pessoas = 2 camas de casal). */}
            <div className="pl-1 space-y-1.5">
              {beds.map((bed, bedIdx) => (
                <div key={bedIdx} className="flex items-center gap-2">
                  <BedDouble className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" />
                  <select
                    value={bed.bedType}
                    onChange={e => updateBeds(idx, beds.map((b, i) => (i === bedIdx ? { ...b, bedType: e.target.value } : b)))}
                    className="flex-1 bg-zinc-50 border border-zinc-200 rounded p-1.5 text-xs focus:outline-none focus:border-emerald-500"
                  >
                    {BED_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={bed.count}
                    onChange={e => updateBeds(idx, beds.map((b, i) => (i === bedIdx ? { ...b, count: Number(e.target.value) } : b)))}
                    className="w-14 bg-zinc-50 border border-zinc-200 rounded p-1.5 text-xs focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => updateBeds(idx, beds.filter((_, i) => i !== bedIdx))}
                    className="text-zinc-400 hover:text-red-600 transition cursor-pointer flex-shrink-0"
                    title="Remover cama"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => updateBeds(idx, [...beds, { bedType: BED_TYPE_OPTIONS[0], count: 1 }])}
                className="flex items-center gap-1 text-zinc-500 font-semibold text-[10px] hover:text-emerald-700 transition cursor-pointer"
              >
                <Plus className="h-3 w-3" /> Adicionar cama
              </button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...value, { type: "", capacity: 2, quantity: 1, beds: [] }])}
        className="flex items-center gap-1 text-emerald-700 font-semibold text-[11px] hover:text-emerald-800 transition cursor-pointer"
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar tipo de quarto
      </button>
    </div>
  );
}
