import React, { useState } from "react";
import { MapPin, LocateFixed } from "lucide-react";

// Cidades-base mais comuns dos guias do Pantanal e arredores (coordenadas
// aproximadas do centro). "Usar minha localização" cobre quem mora fora delas.
export const CIDADES_BASE: { nome: string; lat: number; lng: number }[] = [
  { nome: "Cuiabá (MT)", lat: -15.601, lng: -56.097 },
  { nome: "Poconé (MT)", lat: -16.257, lng: -56.623 },
  { nome: "Porto Jofre (MT)", lat: -17.364, lng: -56.774 },
  { nome: "Barão de Melgaço (MT)", lat: -16.194, lng: -55.967 },
  { nome: "Santo Antônio do Leverger (MT)", lat: -15.866, lng: -56.077 },
  { nome: "Cáceres (MT)", lat: -16.07, lng: -57.679 },
  { nome: "Chapada dos Guimarães (MT)", lat: -15.461, lng: -55.75 },
  { nome: "Nobres (MT)", lat: -14.72, lng: -56.328 },
  { nome: "Alta Floresta (MT)", lat: -9.875, lng: -56.086 },
  { nome: "Corumbá (MS)", lat: -19.009, lng: -57.653 },
  { nome: "Miranda (MS)", lat: -20.24, lng: -56.378 },
  { nome: "Aquidauana (MS)", lat: -20.471, lng: -55.787 },
  { nome: "Bonito (MS)", lat: -21.127, lng: -56.482 },
  { nome: "Campo Grande (MS)", lat: -20.469, lng: -54.62 },
  { nome: "Coxim (MS)", lat: -18.506, lng: -54.76 },
  { nome: "Palmas (TO)", lat: -10.184, lng: -48.334 },
  { nome: "Mateiros — Jalapão (TO)", lat: -10.546, lng: -46.42 },
];

const RAIOS = [50, 100, 150, 250, 400];

export interface AreaAtuacao { baseCidade?: string; baseLatitude?: number | null; baseLongitude?: number | null; raioKm?: number }

// "Onde você atua": define quais passeios chegam por e-mail para o guia.
export default function AreaAtuacaoEditor({ value, onChange }: { value: AreaAtuacao; onChange: (v: AreaAtuacao) => void }) {
  const [localizando, setLocalizando] = useState(false);
  const [erro, setErro] = useState("");
  const atual = CIDADES_BASE.find(c => c.nome === value.baseCidade);
  const field = "w-full border border-editorial-border rounded-md p-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-editorial-primary";

  const usarLocalizacao = () => {
    setErro("");
    if (!navigator.geolocation) return setErro("Seu navegador não permite pegar a localização.");
    setLocalizando(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocalizando(false);
        onChange({ ...value, baseCidade: "Minha localização", baseLatitude: Math.round(pos.coords.latitude * 1000) / 1000, baseLongitude: Math.round(pos.coords.longitude * 1000) / 1000 });
      },
      () => { setLocalizando(false); setErro("Não foi possível pegar sua localização. Escolha uma cidade da lista."); },
      { timeout: 10000 }
    );
  };

  return (
    <div className="text-xs border border-editorial-border rounded-xl p-4 space-y-3">
      <div>
        <p className="font-semibold text-editorial-text flex items-center gap-1.5"><MapPin className="h-4 w-4 text-editorial-accent" /> Onde você atua</p>
        <p className="text-editorial-muted text-[11px] mt-0.5">Você recebe por e-mail os passeios pagos até essa distância da sua base. Só a cidade aparece no seu perfil público.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block font-semibold mb-1">Cidade-base</span>
          <select
            value={atual ? atual.nome : value.baseCidade ? "__custom" : ""}
            onChange={e => {
              const c = CIDADES_BASE.find(x => x.nome === e.target.value);
              if (c) onChange({ ...value, baseCidade: c.nome, baseLatitude: c.lat, baseLongitude: c.lng });
              else if (e.target.value === "") onChange({ ...value, baseCidade: "", baseLatitude: null, baseLongitude: null });
            }}
            className={field}
          >
            <option value="">Escolha…</option>
            {value.baseCidade && !atual && <option value="__custom">{value.baseCidade}</option>}
            {CIDADES_BASE.map(c => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block font-semibold mb-1">Até que distância</span>
          <select value={value.raioKm || 150} onChange={e => onChange({ ...value, raioKm: Number(e.target.value) })} className={field}>
            {RAIOS.map(r => <option key={r} value={r}>{r} km</option>)}
          </select>
        </label>
      </div>
      <button type="button" onClick={usarLocalizacao} disabled={localizando} className="inline-flex items-center gap-1.5 text-editorial-primary font-semibold underline cursor-pointer disabled:opacity-60">
        <LocateFixed className="h-3.5 w-3.5" /> {localizando ? "Localizando…" : "Usar minha localização atual"}
      </button>
      {erro && <p className="text-amber-800">{erro}</p>}
    </div>
  );
}
