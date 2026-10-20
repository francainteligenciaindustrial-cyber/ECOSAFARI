import React, { useState, useRef, useEffect } from "react";
import { ArrowLeft, Sparkles, ExternalLink, MapPin } from "lucide-react";
import { Pousada } from "../types";
import { parseVideoUrl } from "../lib/videoEmbed";

const AGENCY_WHATSAPP_NUMBER = "5565999868334";

interface WhatsAppGateViewProps {
  pousada: Pousada | null;
  onBack: () => void;
}

function agencyWhatsappLink(message: string) {
  return `https://wa.me/${AGENCY_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export default function WhatsAppGateView({ pousada, onBack }: WhatsAppGateViewProps) {
  // Vídeo de apresentação da própria pousada (cadastrado pelo gestor na
  // Galeria de Fotos). Sem vídeo, ou com vídeo do YouTube/Drive (onde não dá
  // pra saber quando terminou), o botão do WhatsApp já aparece direto.
  const video = parseVideoUrl(pousada?.videoUrl);
  const [videoEnded, setVideoEnded] = useState(!video || video.kind === "iframe");
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
    <div id="whatsapp-gate-page" className="bg-editorial-primary min-h-screen text-[#FBF8F1] py-10 font-sans">
      <div className="max-w-4xl mx-auto px-6">

        {/* Navigation */}
        <div className="flex items-center justify-between mb-8 border-b border-[#FBF8F1]/10 pb-6">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-[#FBF8F1]/80 hover:text-white transition cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao catálogo
          </button>

          <div className="bg-[#FBF8F1]/10 border border-[#FBF8F1]/25 px-3 py-1 text-[10px] uppercase tracking-widest text-[#FBF8F1] font-bold flex items-center gap-1.5 animate-pulse">
            <Sparkles className="h-3.5 w-3.5" /> EcoCinema Auto-Executável
          </div>
        </div>

        {/* Video */}
        {video && (
        <div className="relative aspect-video bg-black border border-[#FBF8F1]/10 shadow-2xl overflow-hidden mb-8">
          {video.kind === "iframe" ? (
            <iframe
              src={video.src}
              title={`Vídeo de apresentação — ${pousada?.name || "EcoSafari"}`}
              className="w-full h-full"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
          <video
            ref={videoRef}
            src={video.src}
            controls
            playsInline
            className="w-full h-full object-cover"
            onEnded={() => setVideoEnded(true)}
            onError={() => setVideoEnded(true)}
          />
          )}

          {video.kind === "file" && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 flex flex-col justify-between p-6 pointer-events-none">
            <div>
              <h2 className="font-serif font-bold text-lg tracking-tight">Expedições EcoSafari Brasil</h2>
              {pousada && (
                <p className="text-zinc-300 text-xs flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3 text-[#FBF8F1]" /> {pousada.name}
                </p>
              )}
            </div>
          </div>
          )}
        </div>
        )}

        {/* Call to action card */}
        <div className="bg-[#FBF8F1]/10 border border-[#FBF8F1]/25 p-8 text-center">
          {videoEnded ? (
            <>
              <h3 className="font-serif font-bold text-white text-xl mb-2">Pronto para planejar sua expedição?</h3>
              <p className="text-[#FBF8F1]/85 text-xs mb-6 max-w-md mx-auto leading-relaxed font-light">
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
            <button
              type="button"
              onClick={() => setVideoEnded(true)}
              className="text-[#FBF8F1]/80 hover:text-white text-xs uppercase tracking-widest font-bold underline underline-offset-4 cursor-pointer"
            >
              Pular vídeo e falar com a equipe
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
