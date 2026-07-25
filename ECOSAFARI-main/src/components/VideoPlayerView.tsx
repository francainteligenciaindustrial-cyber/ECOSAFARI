import React, { useState, useEffect, useRef } from "react";
import { ArrowLeft, Play, Pause, Volume2, VolumeX, MessageSquare, Compass, Eye, MapPin, Sparkles } from "lucide-react";
import { Pousada } from "../types";

interface VideoPlayerViewProps {
  pousada: Pousada | null;
  onBack: () => void;
  onOpenBot: (pousada: Pousada) => void;
}

export default function VideoPlayerView({ pousada, onBack, onOpenBot }: VideoPlayerViewProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [activeChapter, setActiveChapter] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Plays this pousada's own video when set by the admin; falls back to a
  // generic placeholder clip otherwise.
  const videoSource = pousada?.videoUrl || "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

  const chapters = [
    { time: 0, title: "Rastreamento da Onça-Pintada", duration: "0:00 - 1:15", desc: "Acompanhe nossos guias na busca pela soberana do Pantanal ao longo dos rios Clarinho e Negro." },
    { time: 10, title: "O Encantador Boto Cor-de-Rosa", duration: "1:15 - 2:30", desc: "Descubra a biologia e as lendas que cercam o golfinho de água doce mais amado do mundo na Amazônia." },
    { time: 20, title: "Lobo-Guará no Cerrado Noturno", duration: "2:30 - 3:45", desc: "Explore o misticismo do Cerrado à noite utilizando sensores térmicos especiais para identificar fauna ativa." },
    { time: 30, title: "Fervedouros e Dunas do Jalapão", duration: "3:45 - Fim", desc: "A força das águas e as dunas douradas de Tocantins em ângulos cinematográficos inéditos." }
  ];

  // Try to autoplay once mounted
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(err => {
          console.log("Autoplay was prevented, loading with user action required.", err);
          setIsPlaying(false);
        });
    }
  }, []);

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleMuteUnmute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  return (
    <div id="video-cinema-page" className="bg-editorial-primary min-h-screen text-[#FDFCF8] py-10 font-sans">
      <div className="max-w-7xl mx-auto px-6">
        
        {/* Navigation */}
        <div className="flex items-center justify-between mb-8 border-b border-[#FDFCF8]/10 pb-6">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-[#FDFCF8]/80 hover:text-white transition cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao catálogo
          </button>
          
          <div className="bg-[#FDFCF8]/10 border border-[#FDFCF8]/25 px-3 py-1 text-[10px] uppercase tracking-widest text-[#FDFCF8] font-bold flex items-center gap-1.5 animate-pulse">
            <Sparkles className="h-3.5 w-3.5" /> EcoCinema Auto-Executável
          </div>
        </div>

        {/* Layout grid: Cinematic Video vs Chapters Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Main Video Player */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="relative aspect-video bg-black border border-[#FDFCF8]/10 shadow-2xl group overflow-hidden">
              
              <video
                ref={videoRef}
                src={videoSource}
                loop
                muted={isMuted}
                autoPlay
                className="w-full h-full object-cover"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />

              {/* Video Overlay controls */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-6">
                
                {/* Top Info */}
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="font-serif font-bold text-lg tracking-tight">Expedições EcoSafari Brasil</h2>
                    <p className="text-zinc-300 text-xs flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3 text-[#FDFCF8]" /> Vivências em Alta Resolução</p>
                  </div>
                  {pousada && (
                    <span className="bg-[#FDFCF8] text-editorial-primary text-[9px] uppercase font-bold tracking-widest px-2.5 py-1">
                      Exibição: {pousada.name}
                    </span>
                  )}
                </div>

                {/* Bottom Bar Controls */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handlePlayPause}
                      className="bg-[#FDFCF8] text-editorial-primary p-2.5 rounded-none hover:scale-105 transition cursor-pointer"
                    >
                      {isPlaying ? <Pause className="h-4 w-4 fill-editorial-primary" /> : <Play className="h-4 w-4 fill-editorial-primary" />}
                    </button>
                    
                    <button
                      onClick={handleMuteUnmute}
                      className="text-white hover:text-[#FDFCF8] p-2 transition cursor-pointer"
                    >
                      {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                    </button>
                  </div>

                  <span className="text-[10px] uppercase tracking-widest font-mono text-zinc-300">Auto-playing • Loop Ativo</span>
                </div>

              </div>

              {/* Autoplay Badge if muted */}
              {isMuted && (
                <button
                  onClick={handleMuteUnmute}
                  className="absolute bottom-6 right-6 bg-[#FDFCF8] text-editorial-primary text-[10px] uppercase tracking-widest px-3 py-1.5 font-bold shadow transition z-10 animate-bounce cursor-pointer"
                >
                  <VolumeX className="h-4 w-4 inline mr-1" /> Ativar Som
                </button>
              )}
            </div>

            {/* Video metadata */}
            <div className="bg-[#FDFCF8]/5 border border-[#FDFCF8]/10 p-6 shadow-sm">
              <h3 className="font-serif font-bold text-lg mb-2">Vivencie o Safári Fotográfico Ecológico</h3>
              <p className="text-[#FDFCF8]/80 text-xs leading-relaxed font-light">
                Nossos vídeos mostram imagens reais capturadas por biólogos e turistas parceiros em expedições. A EcoSafari financia projetos locais de conservação e monitoramento de grandes carnívoros. Hospedando-se em nossas pousadas parceiras, você ajuda a manter a floresta e o cerrado de pé.
              </p>
            </div>
          </div>

          {/* Chapters Sidebar */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* Chapters list */}
            <div className="bg-[#FDFCF8]/5 border border-[#FDFCF8]/10 p-6 flex-1">
              <h3 className="font-serif font-bold text-[#FDFCF8] text-sm uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <Compass className="h-4 w-4 text-[#FDFCF8]" /> Capítulos da Expedição
              </h3>
              
              <div className="space-y-3">
                {chapters.map((chap, idx) => (
                  <div
                    key={idx}
                    onClick={() => setActiveChapter(idx)}
                    className={`p-4 cursor-pointer border transition ${
                      activeChapter === idx
                        ? "bg-white/10 border-white"
                        : "bg-white/0 border-[#FDFCF8]/15 hover:border-[#FDFCF8]/40 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-serif font-bold text-sm text-[#FDFCF8]">{chap.title}</span>
                      <span className="text-[9px] font-mono text-[#FDFCF8] bg-white/10 px-1.5 py-0.5">{chap.duration}</span>
                    </div>
                    <p className="text-[#FDFCF8]/75 text-xs leading-normal font-light">{chap.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Call to action card */}
            <div className="bg-[#FDFCF8]/10 border border-[#FDFCF8]/25 p-6 flex flex-col justify-between text-center gap-4">
              <div>
                <span className="text-[#FDFCF8]/80 font-bold text-[9px] uppercase tracking-widest block mb-1">Gostou da Experiência?</span>
                <h4 className="font-serif font-bold text-white text-base">Agende este safári hoje mesmo</h4>
                <p className="text-[#FDFCF8]/85 text-xs mt-2 leading-relaxed font-light">
                  Converse diretamente com o nosso bot virtual "Sofia" via WhatsApp Business para montar seu pacote integrado!
                </p>
              </div>
              <button
                onClick={() => onOpenBot(pousada || null as any)}
                className="w-full bg-[#FDFCF8] hover:bg-[#FDFCF8]/95 text-editorial-primary font-bold py-3 text-[11px] uppercase tracking-widest transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <MessageSquare className="h-4 w-4" /> Conversar com Sofia
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
