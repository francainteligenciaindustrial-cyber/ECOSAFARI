import React, { useState, useEffect } from "react";
import { Coins, Gift, LoaderCircle, Check, Copy } from "lucide-react";
import { Recompensa } from "../types";
import { useTouristSession } from "../lib/useTouristSession";
import { adminFetch } from "../lib/adminFetch";
import { navigate } from "../lib/router";

interface Props {
  pousadaId: string;
}

// Vitrine de recompensas trocáveis por Jaguars — os mesmos Jaguars ganhos no
// aplicativo EcoSafari por foto de avistamento aprovada, aqui viram desconto
// direto com a pousada.
export default function PousadaRecompensas({ pousadaId }: Props) {
  const { isTourist, profile } = useTouristSession();
  const [recompensas, setRecompensas] = useState<Recompensa[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [redeemedCode, setRedeemedCode] = useState<{ recompensaId: string; code: string } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/pousadas/${pousadaId}/recompensas`)
      .then(res => (res.ok ? res.json() : []))
      .then(setRecompensas)
      .catch(() => setRecompensas([]))
      .finally(() => setLoading(false));
  }, [pousadaId]);

  if (loading || recompensas.length === 0) return null;

  const handleRedeem = async (recompensa: Recompensa) => {
    setError("");
    setRedeemingId(recompensa.id);
    try {
      const res = await adminFetch("/api/turista/resgates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recompensaId: recompensa.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível resgatar agora.");
        return;
      }
      setRedeemedCode({ recompensaId: recompensa.id, code: data.code });
    } finally {
      setRedeemingId(null);
    }
  };

  const coins = profile?.coins ?? 0;

  return (
    <div className="bg-white p-8 rounded-none border border-editorial-border shadow-sm">
      <h2 className="text-2xl font-serif font-bold text-editorial-primary mb-1 flex items-center gap-2">
        <Gift className="h-5 w-5" /> Resgate com Jaguars
      </h2>
      <p className="text-editorial-muted text-xs mb-6">
        {isTourist
          ? <>Seus Jaguars do aplicativo EcoSafari — você tem <span className="font-bold text-editorial-primary">{coins}</span>.</>
          : "Entre com seu perfil de turista para resgatar com os Jaguars que você ganhou no aplicativo EcoSafari."}
      </p>

      {error && <p className="text-red-600 text-xs font-medium mb-4">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {recompensas.map(r => {
          const isRedeemed = redeemedCode?.recompensaId === r.id;
          const canAfford = coins >= r.coinCost;
          return (
            <div key={r.id} className="border border-editorial-border p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-sm text-editorial-text">{r.title}</span>
                <span className="flex items-center gap-1 text-editorial-primary font-bold text-xs whitespace-nowrap">
                  <Coins className="h-3.5 w-3.5" /> {r.coinCost}
                </span>
              </div>
              {r.description && <p className="text-editorial-muted text-xs">{r.description}</p>}

              {isRedeemed ? (
                <div className="mt-1 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-2 flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-emerald-800 text-sm">{redeemedCode.code}</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(redeemedCode.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                    className="text-emerald-700 hover:text-emerald-900 transition cursor-pointer"
                    title="Copiar código"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ) : !isTourist ? (
                <button
                  onClick={() => navigate("/turista")}
                  className="mt-1 text-editorial-primary text-[11px] uppercase tracking-widest font-bold hover:opacity-80 transition cursor-pointer text-left"
                >
                  Entrar para resgatar
                </button>
              ) : (
                <button
                  onClick={() => handleRedeem(r)}
                  disabled={!canAfford || redeemingId === r.id}
                  className="mt-1 bg-editorial-primary text-white text-[11px] uppercase tracking-widest font-bold py-2 rounded-md hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {redeemingId === r.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : canAfford ? "Resgatar" : "Jaguars insuficientes"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
