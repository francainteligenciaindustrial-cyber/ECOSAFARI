import React, { useState, useEffect } from "react";
import { Star, LoaderCircle, Lock } from "lucide-react";
import { Review } from "../types";
import { navigate } from "../lib/router";
import { adminFetch } from "../lib/adminFetch";
import { useTouristSession } from "../lib/useTouristSession";

interface ReviewsSectionProps {
  targetType: "atracao" | "guia";
  targetId: string;
}

// Avaliações list + submit form for an Atração or Guia public profile page.
// Pousada keeps its own richer review UI (with photo upload) inside
// PousadaCatalog.tsx — this is the lighter-weight version reused by the two
// newer profile types instead of duplicating the same ~80 lines twice.
// Submitting now requires a perfil de turista (see requireTourist in
// server.ts) — the display name comes from that profile, not a free-text
// field, so there's no "quem está avaliando" input here anymore.
export default function ReviewsSection({ targetType, targetId }: ReviewsSectionProps) {
  const { checking, isTourist, profile } = useTouristSession();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState(false);

  const fetchReviews = () => {
    fetch("/api/reviews")
      .then(res => res.json())
      .then((all: Review[]) => setReviews(all.filter(r => (targetType === "atracao" ? r.atracaoId : r.guideId) === targetId)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchReviews(); }, [targetType, targetId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await adminFetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [targetType === "atracao" ? "atracaoId" : "guideId"]: targetId,
          rating,
          comment,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(body.error || "Erro ao enviar avaliação.");
        return;
      }
      setComment("");
      setRating(5);
      setSuccess(true);
      fetchReviews();
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setSubmitError("Erro ao enviar avaliação.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-5">
        {checking ? (
          <div className="bg-white border border-editorial-border p-6 flex justify-center">
            <LoaderCircle className="h-5 w-5 text-editorial-primary animate-spin" />
          </div>
        ) : !isTourist ? (
          <div className="bg-white border border-editorial-border p-6 text-center space-y-3">
            <Lock className="h-6 w-6 text-editorial-muted mx-auto" />
            <h3 className="font-serif font-bold text-editorial-primary text-lg">Crie seu perfil para avaliar</h3>
            <p className="text-editorial-muted text-xs leading-relaxed">Para avaliar, você precisa ter um perfil de turista EcoSafari — é rápido e gratuito.</p>
            <button
              onClick={() => navigate("/turista")}
              className="w-full bg-editorial-primary hover:opacity-90 text-white text-xs font-bold uppercase tracking-widest py-3 rounded-md transition cursor-pointer"
            >
              Criar perfil / Entrar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white border border-editorial-border p-6 space-y-3">
            <h3 className="font-serif font-bold text-editorial-primary text-lg mb-1">Deixe sua Avaliação</h3>
            {profile && <p className="text-editorial-muted text-[11px]">Avaliando como <span className="font-semibold text-editorial-text">{profile.name}</span></p>}
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-editorial-muted mb-1">Nota</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => setRating(n)} className="cursor-pointer">
                    <Star className={`h-6 w-6 ${n <= rating ? "text-amber-500 fill-amber-500" : "text-zinc-200"}`} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-editorial-muted mb-1">Sua Avaliação</label>
              <textarea required rows={3} value={comment} onChange={e => setComment(e.target.value)} className="w-full border border-editorial-border rounded-md p-2 text-xs focus:outline-none focus:ring-1 focus:ring-editorial-primary resize-none" />
            </div>
            {submitError && <p className="text-red-600 text-xs font-medium">{submitError}</p>}
            <button type="submit" disabled={submitting} className="w-full bg-editorial-primary hover:opacity-90 text-white text-xs font-bold uppercase tracking-widest py-3 rounded-md transition disabled:opacity-60 cursor-pointer">
              {submitting ? "Enviando..." : "Enviar Avaliação"}
            </button>
            {success && <p className="text-emerald-700 text-xs font-semibold text-center">Avaliação enviada, obrigado!</p>}
          </form>
        )}
      </div>

      <div className="lg:col-span-7 space-y-4 max-h-[500px] overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-editorial-muted"><LoaderCircle className="h-5 w-5 animate-spin" /></div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-editorial-border">
            <Star className="h-6 w-6 text-editorial-muted mx-auto mb-2" />
            <p className="text-editorial-muted text-xs">Ainda não há avaliações — seja o primeiro.</p>
          </div>
        ) : (
          reviews.map(r => (
            <div key={r.id} className="bg-white border border-editorial-border p-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-serif font-bold text-editorial-primary text-sm">{r.userName}</span>
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "text-amber-500 fill-amber-500" : "text-zinc-200"}`} />
                  ))}
                </div>
              </div>
              <p className="text-editorial-muted text-xs leading-relaxed italic">"{r.comment}"</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
