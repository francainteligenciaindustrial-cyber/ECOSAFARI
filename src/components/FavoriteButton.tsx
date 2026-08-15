import React, { useState, useEffect } from "react";
import { Heart, LoaderCircle } from "lucide-react";
import { useTouristSession } from "../lib/useTouristSession";
import { adminFetch } from "../lib/adminFetch";
import { navigate } from "../lib/router";

interface FavoriteButtonProps {
  pousadaId: string;
  className?: string;
}

// Coração de "favoritar" — só funciona logado como turista; se não estiver,
// manda pra tela de login/cadastro em vez de falhar silenciosamente.
export default function FavoriteButton({ pousadaId, className = "" }: FavoriteButtonProps) {
  const { isTourist, checking } = useTouristSession();
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);

  useEffect(() => {
    if (checking) return;
    if (!isTourist) {
      setCheckingStatus(false);
      return;
    }
    adminFetch("/api/turista/favoritos")
      .then(res => (res.ok ? res.json() : []))
      .then((favs: { id: string }[]) => setIsFavorite(favs.some(f => f.id === pousadaId)))
      .catch(() => {})
      .finally(() => setCheckingStatus(false));
  }, [checking, isTourist, pousadaId]);

  const handleClick = async () => {
    if (!isTourist) {
      navigate("/turista");
      return;
    }
    setLoading(true);
    try {
      if (isFavorite) {
        await adminFetch(`/api/turista/favoritos/${pousadaId}`, { method: "DELETE" });
        setIsFavorite(false);
      } else {
        await adminFetch(`/api/turista/favoritos/${pousadaId}`, { method: "POST" });
        setIsFavorite(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={checkingStatus || loading}
      className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold transition cursor-pointer disabled:opacity-60 ${
        isFavorite
          ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
          : "bg-white border-editorial-border text-editorial-muted hover:text-red-600 hover:border-red-200"
      } ${className}`}
      title={isTourist ? (isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos") : "Entre como turista para favoritar"}
    >
      {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Heart className={`h-3.5 w-3.5 ${isFavorite ? "fill-red-500" : ""}`} />}
      {isFavorite ? "Favoritado" : "Favoritar"}
    </button>
  );
}
