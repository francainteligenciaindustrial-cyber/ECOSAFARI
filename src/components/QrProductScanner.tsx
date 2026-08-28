import React, { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { X, Camera, AlertTriangle } from "lucide-react";

interface Props {
  onScan: (produtoId: string) => void;
  onClose: () => void;
}

// Leitor de QR code pela câmera do dispositivo — puro navegador (jsQR
// decodifica frame a frame de um <video>, sem precisar de app nativo nem
// serviço externo). O QR do produto (ver PousadaProdutosManager.tsx)
// codifica só o id do produto, então basta devolver o texto lido.
export default function QrProductScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        tick();
      })
      .catch(() => setError("Não foi possível acessar a câmera. Confira a permissão do navegador."));

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            onScan(code.data);
            return; // para de escanear assim que achar um código
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-50 p-4">
      <button onClick={onClose} className="absolute top-4 right-4 text-white hover:text-zinc-300 cursor-pointer" aria-label="Fechar leitor">
        <X className="h-6 w-6" />
      </button>
      {error ? (
        <div className="text-center text-white max-w-xs">
          <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-3" />
          <p className="text-sm">{error}</p>
        </div>
      ) : (
        <>
          <div className="relative w-full max-w-sm aspect-square overflow-hidden rounded-lg border-2 border-white/30">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          </div>
          <p className="text-white/80 text-xs mt-4 flex items-center gap-1.5"><Camera className="h-3.5 w-3.5" /> Aponte pro QR code do produto</p>
        </>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
