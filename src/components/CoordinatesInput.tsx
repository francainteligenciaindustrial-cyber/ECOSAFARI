import React, { useState } from "react";
import { MapPin } from "lucide-react";

// Posição no mapa público. Aceita colar direto do Google Maps (botão direito
// no local → clicar nas coordenadas copia "-16.50123, -56.74321").
export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const m = text.trim().match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1].replace(",", "."));
  const lng = Number(m[2].replace(",", "."));
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null;
  return { lat, lng };
}

interface Props {
  latitude?: number | null;
  longitude?: number | null;
  onChange: (pos: { latitude: number | null; longitude: number | null }) => void;
  className?: string;
}

export default function CoordinatesInput({ latitude, longitude, onChange, className = "" }: Props) {
  const initial = latitude != null && longitude != null ? `${latitude}, ${longitude}` : "";
  const [text, setText] = useState(initial);
  const [invalid, setInvalid] = useState(false);

  const commit = (value: string) => {
    if (!value.trim()) {
      setInvalid(false);
      onChange({ latitude: null, longitude: null });
      return;
    }
    const pos = parseCoordinates(value);
    setInvalid(!pos);
    if (pos) onChange({ latitude: pos.lat, longitude: pos.lng });
  };

  return (
    <div className={className}>
      <label htmlFor="coords" className="block text-zinc-700 font-semibold mb-1 text-xs">Posição no mapa (opcional)</label>
      <div className="relative">
        <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
        <input
          id="coords"
          type="text"
          inputMode="decimal"
          placeholder="-16.50123, -56.74321"
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={e => commit(e.target.value)}
          aria-invalid={invalid}
          aria-describedby="coords-hint"
          className={`w-full bg-zinc-50 border rounded p-2 pl-7 text-xs focus:outline-none focus:border-emerald-500 ${invalid ? "border-red-400" : "border-zinc-200"}`}
        />
      </div>
      <p id="coords-hint" className={`text-[10px] mt-1 ${invalid ? "text-red-600" : "text-zinc-500"}`}>
        {invalid
          ? "Formato não reconhecido. Use latitude, longitude — ex.: -16.50123, -56.74321."
          : "No Google Maps, clique com o botão direito no local e clique nas coordenadas para copiar. Sem isso, o mapa usa a cidade como posição aproximada."}
      </p>
    </div>
  );
}
