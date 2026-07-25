import React, { useState, useRef, useEffect } from "react";
import { ArrowLeft, Sparkles, ExternalLink, MapPin } from "lucide-react";
import { Pousada } from "../types";

const AGENCY_WHATSAPP_NUMBER = "5565999868334";

// Placeholder nature clip shown before handing off to the real WhatsApp.
// TODO: replace with a real branded EcoSafari video (drop the file in /public/videos/
// and point this at "/videos/your-file.mp4") once one is available.
const GATE_VIDEO_SRC = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

interface WhatsAppGateViewProps {
  pousada: Pousada | null;
  onBack: () => void;
}

function agencyWhatsappLink(message: string) {
  return `https://wa.me/${AGENCY_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export default function WhatsAppGateView({ pousada, onBack }: WhatsAppGateViewProps) {
  const [videoEnded, setVideoEnded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => setVideoEnded(true));
    }
  }, []);

  const whatsappMessage = pousada
    ? `Olá! Vim do site da EcoSafari Brasil e tenho interesse na ${pousada.name}.`
    : "Olá! Vim do site da EcoSafari Brasil e gostaria de mais informações.";

  return (
    <div id="whatsapp-gate-page" className="bg-editorial-primary min-h-screen text-[#FDFCF8] py-10 font-sans">
      <div className="max-w-4xl mx-auto px-6">

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

        {/* Video */}
        <div className="relative aspect-video bg-black border border-[#FDFCF8]/10 shadow-2xl overflow-hidden mb-8">
          <video
            ref={videoRef}
            src={GATE_VIDEO_SRC}
            muted
            playsInline
            className="w-full h-full object-cover"
            onEnded={() => setVideoEnded(true)}
            onError={() => setVideoEnded(true)}
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 flex flex-col justify-between p-6 pointer-events-none">
            <div>
              <h2 className="font-serif font-bold text-lg tracking-tight">Expedições EcoSafari Brasil</h2>
              {pousada && (
                <p className="text-zinc-300 text-xs flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3 text-[#FDFCF8]" /> {pousada.name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Call to action card */}
        <div className="bg-[#FDFCF8]/10 border border-[#FDFCF8]/25 p-8 text-center">
          {videoEnded ? (
            <>
              <h3 className="font-serif font-bold text-white text-xl mb-2">Pronto para planejar sua expedição?</h3>
              <p className="text-[#FDFCF8]/85 text-xs mb-6 max-w-md mx-auto leading-relaxed font-light">
                Fale agora com nossa equipe no WhatsApp oficial para tirar dúvidas, escolher datas e fechar sua reserva.
              </p>
              <a
                href={agencyWhatsappLink(whatsappMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-8 text-[11px] uppercase tracking-widest transition shadow-sm cursor-pointer"
              >
                <ExternalLink className="h-4 w-4" /> Ir para o WhatsApp
              </a>
            </>
          ) : (
            <p className="text-[#FDFCF8]/70 text-xs uppercase tracking-widest font-bold animate-pulse">
              Preparando sua expedição...
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
