import React from "react";
import { Plus, Trash2 } from "lucide-react";

export interface RoomDraft {
  type: string;
  capacity: number;
  quantity: number;
}

// Row-per-room-type editor — "quantos quartos tem, e quantas pessoas cabem
// em cada um" — the level of detail a guest actually wants, instead of just
// a single aggregate capacity number for the whole pousada.
export default function RoomsEditor({ value, onChange }: { value: RoomDraft[]; onChange: (rooms: RoomDraft[]) => void }) {
  const update = (idx: number, patch: Partial<RoomDraft>) => {
    onChange(value.map((room, i) => (i === idx ? { ...room, ...patch } : room)));
  };

  return (
    <div className="space-y-2">
      {value.map((room, idx) => (
        <div key={idx} className="flex items-center gap-2">
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
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { type: "", capacity: 2, quantity: 1 }])}
        className="flex items-center gap-1 text-emerald-700 font-semibold text-[11px] hover:text-emerald-800 transition cursor-pointer"
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar tipo de quarto
      </button>
    </div>
  );
}
