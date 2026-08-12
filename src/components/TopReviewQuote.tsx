import React, { useState, useEffect } from "react";
import { Quote, Star } from "lucide-react";
import { Review } from "../types";

interface Props {
  targetType: "pousada" | "atracao" | "guia";
  targetId: string;
}

// Featured testimonial shown right alongside the bio/description near the
// top of a partner's profile — the single most recent comment among their
// highest-rated reviews, so a visitor sees the best social proof before
// scrolling all the way down to the full reviews list.
export default function TopReviewQuote({ targetType, targetId }: Props) {
  const [review, setReview] = useState<Review | null>(null);

  useEffect(() => {
    let cancelled = false;
    const idKey = targetType === "pousada" ? "pousadaId" : targetType === "atracao" ? "atracaoId" : "guideId";
    fetch("/api/reviews")
      .then(res => res.ok ? res.json() : [])
      .then((all: Review[]) => {
        if (cancelled) return;
        const mine = all.filter(r => (r as any)[idKey] === targetId);
        if (mine.length === 0) {
          setReview(null);
          return;
        }
        const maxRating = Math.max(...mine.map(r => r.rating));
        const topRated = mine.filter(r => r.rating === maxRating);
        topRated.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setReview(topRated[0]);
      })
      .catch(() => setReview(null));
    return () => { cancelled = true; };
  }, [targetType, targetId]);

  if (!review) return null;

  return (
    <div className="bg-editorial-secondary/40 border border-editorial-border p-4 flex gap-3">
      <Quote className="h-5 w-5 text-editorial-primary flex-shrink-0 mt-0.5" />
      <div>
        <div className="flex items-center gap-0.5 mb-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={`h-3 w-3 ${i < review.rating ? "text-amber-500 fill-amber-500" : "text-editorial-border"}`} />
          ))}
        </div>
        <p className="text-editorial-text text-sm italic leading-relaxed">"{review.comment}"</p>
        <span className="text-editorial-muted text-[11px] font-semibold mt-1 block">— {review.userName}</span>
      </div>
    </div>
  );
}
