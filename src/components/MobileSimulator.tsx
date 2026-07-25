import React, { useState } from "react";
import {
  Camera,
  Heart,
  MapPin,
  Compass,
  Bell,
  Map,
  CheckCircle,
  Plus,
  X,
  UploadCloud,
  Send,
  Wifi,
  Smartphone
} from "lucide-react";
import { Sighting, Pousada, PublicBookingSummary } from "../types";

interface MobileSimulatorProps {
  sightings: Sighting[];
  pousadas: Pousada[];
  bookings: PublicBookingSummary[];
  onAddSighting: (sighting: Sighting) => void;
  onRefreshData: () => void;
  standalone?: boolean;
}

export default function MobileSimulator({
  sightings,
  pousadas,
  bookings,
  onAddSighting,
  onRefreshData,
  standalone = false
}: MobileSimulatorProps) {
  const [activeScreen, setActiveScreen] = useState<"feed" | "checkin" | "alerts">("feed");
  const [showAddSighting, setShowAddSighting] = useState(false);
  const [likedSightings, setLikedSightings] = useState<string[]>([]);
  
  // Sighting form states
  const [animalName, setAnimalName] = useState("");
  const [sightingLocation, setSightingLocation] = useState(pousadas[0]?.id || "1");
  const [sightingUser, setSightingUser] = useState("");
  const [preselectedImage, setPreselectedImage] = useState("https://images.unsplash.com/photo-1575550959106-5a7defe28b56?auto=format&fit=crop&w=600&q=80");

  const [checkInDone, setCheckInDone] = useState<string[]>([]);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);

  // Seed images for sightings
  const availableAnimalsImages = [
    { name: "Onça-Pintada", url: "https://images.unsplash.com/photo-1575550959106-5a7defe28b56?auto=format&fit=crop&w=600&q=80" },
    { name: "Lobo-Guará", url: "https://images.unsplash.com/photo-1590005354167-6da97870c913?auto=format&fit=crop&w=600&q=80" },
    { name: "Arara-Azul", url: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=600&q=80" },
    { name: "Boto-Cor-de-Rosa", url: "https://images.unsplash.com/photo-1550411294-b3b1bd5fce12?auto=format&fit=crop&w=600&q=80" },
    { name: "Tuiuiú Pantaneiro", url: "https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&w=600&q=80" }
  ];

  const handleLike = async (id: string) => {
    if (likedSightings.includes(id)) return; // prevent multiple likes in session
    
    try {
      const response = await fetch(`/api/sightings/${id}/like`, { method: "POST" });
      if (response.ok) {
        setLikedSightings(prev => [...prev, id]);
        onRefreshData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSighting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!animalName.trim() || !sightingUser.trim()) return;

    try {
      const response = await fetch("/api/sightings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pousadaId: sightingLocation,
          userName: sightingUser,
          animalName,
          imageUrl: preselectedImage,
          location: pousadas.find(p => p.id === sightingLocation)?.location || "Reserva Ecológica"
        })
      });

      if (response.ok) {
        const data = await response.json();
        onAddSighting(data);
        setShowAddSighting(false);
        setAnimalName("");
        setSightingUser("");
        onRefreshData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePerformCheckIn = (bookingId: string) => {
    setCheckingInId(bookingId);
    
    // Simulate GPS geofencing analysis
    setTimeout(() => {
      setCheckInDone(prev => [...prev, bookingId]);
      setCheckingInId(null);
      
      // Send a push alert simulation
      setSimulatedAlerts(prev => [
        {
          id: Date.now().toString(),
          title: "Check-In Confirmado! 🏨",
          message: "Seja muito bem-vindo! Seu check-in foi homologado via GPS. O Wi-Fi e os roteiros já foram ativados.",
          time: "Agora"
        },
        ...prev
      ]);
    }, 1200);
  };

  // Mock static push notifications
  const [simulatedAlerts, setSimulatedAlerts] = useState([
    {
      id: "a1",
      title: "🐆 AVISTAMENTO DE ONÇA!",
      message: "Uma fêmea com filhote foi vista bebendo água na margem do Rio Clarinho há 15 minutos! Preparem suas câmeras.",
      time: "15 min atrás"
    },
    {
      id: "a2",
      title: "🐺 RASTREIO LOBO-GUARÁ",
      message: "O colar do lobo 'Chico' emitiu sinal de aproximação na divisa leste. Trilha noturna confirmada às 19:30.",
      time: "40 min atrás"
    }
  ]);

  const innerApp = (
    <div className={`${standalone ? "w-full h-screen" : "flex-1"} bg-zinc-950 flex flex-col overflow-hidden relative`}>
      
      {/* Top App Header */}
      <div className="bg-zinc-900 px-4 py-3 flex justify-between items-center border-b border-zinc-800">
        <span className="font-extrabold text-sm text-emerald-400 tracking-tight flex items-center gap-1">
          <Compass className="h-4.5 w-4.5 animate-spin" /> EcoSafari Go
        </span>
        <button
          onClick={() => setActiveScreen("alerts")}
          className="relative p-1.5 hover:bg-zinc-850 rounded-full transition"
        >
          <Bell className="h-4.5 w-4.5 text-zinc-400 hover:text-emerald-400" />
          <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
        </button>
      </div>

          {/* SCREEN CONTENT */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4 bg-zinc-950 scrollbar-none">
            
            {/* SCREEN 1: SIGHTINGS FEED */}
            {activeScreen === "feed" && (
              <div className="space-y-4">
                
                {/* Intro and post action */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest block">Avistamentos Recentes</span>
                  <button
                    onClick={() => setShowAddSighting(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full p-2 flex items-center justify-center transition shadow shadow-emerald-950"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {/* Empty state — a fresh install has no posted sightings yet */}
                {sightings.length === 0 && (
                  <div className="text-center py-14 border border-dashed border-zinc-800 rounded-2xl">
                    <Camera className="h-7 w-7 text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-300 font-bold text-sm mb-1">Nenhum avistamento ainda</p>
                    <p className="text-zinc-500 text-[11px] max-w-[220px] mx-auto">Seja o primeiro a postar um avistamento da sua expedição.</p>
                  </div>
                )}

                {/* Sighting cards */}
                {sightings.map(sight => (
                  <div key={sight.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
                    {/* Sighting Header */}
                    <div className="p-3 flex items-center justify-between border-b border-zinc-800/50">
                      <div>
                        <span className="font-bold text-[11px] text-zinc-100 block">{sight.userName}</span>
                        <span className="text-[9px] text-zinc-500 block flex items-center gap-0.5 mt-0.5"><MapPin className="h-2.5 w-2.5" /> {sight.pousadaName}</span>
                      </div>
                      <span className="text-[8px] text-zinc-500">{new Date(sight.timestamp).toLocaleDateString()}</span>
                    </div>

                    {/* Sighting Image */}
                    <div className="h-44 overflow-hidden relative">
                      <img
                        src={sight.imageUrl}
                        alt={sight.animalName}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Sighting Body */}
                    <div className="p-3">
                      <span className="font-extrabold text-xs text-emerald-400 block">{sight.animalName}</span>
                      <p className="text-[10px] text-zinc-400 mt-1 leading-normal">Avistado em {sight.location}. Todos os visitantes em segurança!</p>
                      
                      {/* Interaction */}
                      <div className="flex items-center gap-4 mt-3 border-t border-zinc-850 pt-2.5">
                        <button
                          onClick={() => handleLike(sight.id)}
                          className={`flex items-center gap-1 text-[10px] font-bold transition ${likedSightings.includes(sight.id) ? "text-red-500" : "text-zinc-500 hover:text-red-500"}`}
                        >
                          <Heart className={`h-4 w-4 ${likedSightings.includes(sight.id) ? "fill-red-500 text-red-500" : ""}`} />
                          {sight.likes} Likes
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* SCREEN 2: CHECK-IN */}
            {activeScreen === "checkin" && (
              <div className="space-y-4">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-1">Check-In via GPS</span>
                <p className="text-[10px] text-zinc-400 leading-relaxed mb-4">Selecione sua reserva confirmada abaixo para homologar seu check-in de chegada na pousada via posicionamento geográfico satelital.</p>
                
                <div className="space-y-3">
                  {bookings.filter(b => b.status === "confirmado_total").map((b) => (
                    <div key={b.id} className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-col justify-between gap-3">
                      <div>
                        <span className="text-[9px] font-mono font-bold uppercase bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">Reserva #{b.id.split("_")[1] || b.id}</span>
                        <h4 className="font-extrabold text-sm text-zinc-100 mt-2">{b.pousadaName}</h4>
                        <p className="text-[10px] text-zinc-500 mt-1">Período: {b.checkIn} a {b.checkOut}</p>
                      </div>

                      {checkInDone.includes(b.id) ? (
                        <div className="bg-emerald-950/40 text-emerald-400 border border-emerald-900/40 p-2 rounded text-center text-[10px] font-bold flex items-center justify-center gap-1">
                          <CheckCircle className="h-3.5 w-3.5" /> Check-in Concluído via GPS
                        </div>
                      ) : (
                        <button
                          onClick={() => handlePerformCheckIn(b.id)}
                          disabled={checkingInId === b.id}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 rounded text-xs transition"
                        >
                          {checkingInId === b.id ? "Analisando Coordenadas Satélite..." : "Efetuar Check-In (Geofence)"}
                        </button>
                      )}
                    </div>
                  ))}

                  {bookings.filter(b => b.status === "confirmado_total").length === 0 && (
                    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl text-center text-xs text-zinc-500">
                      Nenhuma reserva totalmente confirmada para simular check-in. Use o painel administrativo para aprovar uma reserva paga!
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SCREEN 3: ALERTS */}
            {activeScreen === "alerts" && (
              <div className="space-y-4">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-1">Alertas Ecológicos (Push)</span>
                <p className="text-[10px] text-zinc-400 leading-relaxed mb-4">Avisos e localizações de fauna silvestre reportados por guias e biólogos EcoSafari.</p>
                
                <div className="space-y-3">
                  {simulatedAlerts.map(alert => (
                    <div key={alert.id} className="bg-zinc-900 border-l-4 border-emerald-500 p-3 rounded-r-xl">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-[11px] text-zinc-100">{alert.title}</span>
                        <span className="text-[8px] text-zinc-500">{alert.time}</span>
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-normal">{alert.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Sighting creation Modal */}
          {showAddSighting && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4 z-40">
              <form onSubmit={handleCreateSighting} className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full p-4 space-y-4">
                <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                  <h4 className="font-bold text-xs text-zinc-200">Postar Registro</h4>
                  <button type="button" onClick={() => setShowAddSighting(false)} className="text-zinc-500 hover:text-white">
                    <X className="h-4.5 w-4.5" />
                  </button>
                </div>

                <div className="space-y-2 text-[11px]">
                  <div>
                    <label className="block text-zinc-400 font-semibold mb-1">Seu Nome</label>
                    <input
                      type="text"
                      value={sightingUser}
                      onChange={e => setSightingUser(e.target.value)}
                      required
                      placeholder="Ex: Pedro Alvares"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded p-1.5 text-white text-[11px] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 font-semibold mb-1">Espécie do Animal</label>
                    <input
                      type="text"
                      value={animalName}
                      onChange={e => setAnimalName(e.target.value)}
                      required
                      placeholder="Ex: Onça-Pintada"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded p-1.5 text-white text-[11px] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 font-semibold mb-1">Local do Spot (Inn)</label>
                    <select
                      value={sightingLocation}
                      onChange={e => setSightingLocation(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded p-1.5 text-white text-[11px] focus:outline-none"
                    >
                      {pousadas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-400 font-semibold mb-1">Foto Capturada</label>
                    <div className="grid grid-cols-3 gap-1.5 mt-1">
                      {availableAnimalsImages.map((img, i) => (
                        <div
                          key={i}
                          onClick={() => setPreselectedImage(img.url)}
                          className={`cursor-pointer rounded overflow-hidden h-10 border-2 transition ${preselectedImage === img.url ? "border-emerald-500" : "border-zinc-800"}`}
                          title={img.name}
                        >
                          <img src={img.url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 rounded text-xs transition"
                >
                  Publicar Registro de Fauna
                </button>
              </form>
            </div>
          )}

          {/* Bottom App Navigation Bar */}
          <div className="h-14 bg-zinc-900 border-t border-zinc-800 flex justify-around items-center shrink-0">
            <button
              onClick={() => setActiveScreen("feed")}
              className={`flex flex-col items-center gap-1 text-[9px] font-bold ${activeScreen === "feed" ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              <Camera className="h-4.5 w-4.5" />
              <span>Avistamentos</span>
            </button>
            <button
              onClick={() => setActiveScreen("checkin")}
              className={`flex flex-col items-center gap-1 text-[9px] font-bold ${activeScreen === "checkin" ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              <CheckCircle className="h-4.5 w-4.5" />
              <span>Check-In</span>
            </button>
            <button
              onClick={() => setActiveScreen("alerts")}
              className={`flex flex-col items-center gap-1 text-[9px] font-bold ${activeScreen === "alerts" ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              <Bell className="h-4.5 w-4.5" />
              <span>Alertas</span>
            </button>
          </div>
        </div>
      );

  if (standalone) {
    return innerApp;
  }

  return (
    <div id="mobile-applet-container" className="flex flex-col lg:flex-row items-center justify-center py-12 bg-editorial-bg text-editorial-text gap-10 border-t border-editorial-border">
      
      {/* Description Column */}
      <div className="max-w-md px-6 text-center lg:text-left font-sans">
        <span className="bg-editorial-secondary text-editorial-primary border border-editorial-border px-3 py-1 rounded-none text-[9px] font-bold uppercase tracking-widest mb-3 inline-block">
          Módulo Integrado 6
        </span>
        <h2 className="text-3xl font-serif font-bold text-editorial-primary tracking-tight mb-4">Aplicativo Móvel do Hóspede</h2>
        <p className="text-editorial-muted text-xs leading-relaxed mb-6 font-light">
          Simulamos ao lado a interface do smartphone de um hóspede em campo. Ele pode interagir com o feed social de avistamentos de fauna, registrar check-in via satélite nas pousadas parceiras, e receber alertas de conservação e localização em tempo real.
        </p>

        <div className="space-y-4 text-left bg-white p-6 border border-editorial-border text-xs text-editorial-muted shadow-sm rounded-none">
          <div className="flex gap-2 items-center">
            <span className="text-sm">📸</span>
            <p className="font-light"><strong className="font-bold text-editorial-primary">Avistamentos:</strong> Compartilhe suas fotos tiradas durante as expedições.</p>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-sm">📍</span>
            <p className="font-light"><strong className="font-bold text-editorial-primary">Check-in por GPS:</strong> Valide sua chegada física na pousada sem filas.</p>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-sm">🔔</span>
            <p className="font-light"><strong className="font-bold text-editorial-primary">Alertas Ecológicos:</strong> Receba avisos de animais avistados nos arredores da sua acomodação.</p>
          </div>
        </div>

        <button
          onClick={() => {
            window.open(window.location.origin + window.location.pathname + "#mobile", "_blank");
          }}
          className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-2.5 px-4 text-[10px] tracking-wider transition uppercase mt-4 border border-zinc-750 flex items-center justify-center gap-2 cursor-pointer rounded"
        >
          <Smartphone className="h-4 w-4 text-emerald-400 animate-pulse" />
          <span>Testar Versão App em Tela Cheia</span>
        </button>
      </div>

      {/* SMARTPHONE FRAME */}
      <div className="relative mx-auto w-[360px] h-[720px] bg-black border-[12px] border-zinc-800 rounded-[48px] shadow-2xl overflow-hidden flex flex-col shrink-0 ring-1 ring-zinc-700/50">
        
        {/* Notch */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 h-5 w-32 bg-zinc-800 rounded-b-xl z-30 flex justify-center items-center">
          <div className="w-12 h-1 bg-zinc-900 rounded-full mb-1"></div>
        </div>

        {/* Status Bar */}
        <div className="h-9 bg-zinc-950 text-[10px] font-bold px-6 pt-2 flex justify-between items-center z-20 shrink-0 text-white select-none">
          <span>15:14</span>
          <div className="flex items-center gap-1.5 text-[9px]">
            <Wifi className="h-3 w-3" />
            <span>4G</span>
            <span>100%</span>
          </div>
        </div>

        {innerApp}

      </div>

    </div>
  );
}
