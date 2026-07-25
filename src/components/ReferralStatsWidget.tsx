import React, { useState, useEffect } from "react";
import { Youtube, Instagram, Facebook, Users, Sparkles, TrendingUp } from "lucide-react";
import { ReferralSource } from "../types";
import { adminFetch } from "../lib/adminFetch";

const META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  youtube: { label: "YouTube", icon: <Youtube className="h-3.5 w-3.5" />, color: "#FF0000" },
  facebook: { label: "Facebook", icon: <Facebook className="h-3.5 w-3.5" />, color: "#1877F2" },
  instagram: { label: "Instagram", icon: <Instagram className="h-3.5 w-3.5" />, color: "url(#instagramGradient)" },
  friend: { label: "Indicação de amigo", icon: <Users className="h-3.5 w-3.5" />, color: "#2D4635" },
  other: { label: "Outras redes", icon: <Sparkles className="h-3.5 w-3.5" />, color: "#9CA3AF" },
};

// Flat swatch color for legend dots — Instagram's gradient can't be a solid CSS color.
const SWATCH: Record<string, string> = { instagram: "#C13584" };

const SIZE = 160;
const RADIUS = 58;
const STROKE = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP_DEG = 3;
const GAP_LEN = (GAP_DEG / 360) * CIRCUMFERENCE;

export default function ReferralStatsWidget() {
  const [sources, setSources] = useState<ReferralSource[] | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    adminFetch("/api/referral-sources")
      .then(res => res.ok ? res.json() : [])
      .then(setSources)
      .catch(() => setSources([]));
  }, []);

  if (!sources) return null;

  const answered = sources.filter(s => s.source !== "dismissed");
  const counts: Record<string, number> = {};
  answered.forEach(s => { counts[s.source] = (counts[s.source] || 0) + 1; });
  const total = answered.length;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  if (total === 0) {
    return (
      <div className="bg-white border border-editorial-border p-5 rounded-none">
        <h3 className="font-bold text-sm text-zinc-800 flex items-center gap-2 mb-1">
          <TrendingUp className="h-4 w-4 text-editorial-primary" /> De onde vêm nossos visitantes
        </h3>
        <p className="text-xs text-zinc-400">Ainda sem respostas da pesquisa de primeiro acesso.</p>
      </div>
    );
  }

  // Build donut segments, each ending with a small visual gap.
  let cumulative = 0;
  const segments = sorted.map(([source, count]) => {
    const pct = count / total;
    const rawLen = pct * CIRCUMFERENCE;
    const segLen = Math.max(0, rawLen - GAP_LEN);
    const offset = -cumulative;
    cumulative += rawLen;
    const meta = META[source] || { label: source, icon: <Sparkles className="h-3.5 w-3.5" />, color: "#9CA3AF" };
    return { source, count, pct: Math.round(pct * 100), meta, segLen, offset };
  });

  return (
    <div className="bg-white border border-editorial-border p-5 rounded-none">
      <h3 className="font-bold text-sm text-zinc-800 flex items-center gap-2 mb-5">
        <TrendingUp className="h-4 w-4 text-editorial-primary" /> De onde vêm nossos visitantes
        <span className="text-[10px] text-zinc-400 font-normal">({total} respostas)</span>
      </h3>

      <div className="flex flex-col sm:flex-row items-center gap-8">
        {/* Donut chart */}
        <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <defs>
              <linearGradient id="instagramGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#FFDC80" />
                <stop offset="25%" stopColor="#F77737" />
                <stop offset="50%" stopColor="#E4405F" />
                <stop offset="75%" stopColor="#C13584" />
                <stop offset="100%" stopColor="#833AB4" />
              </linearGradient>
            </defs>
            <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
              <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="#F3F4F1" strokeWidth={STROKE} />
              {segments.map(seg => (
                <circle
                  key={seg.source}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={seg.meta.color}
                  strokeWidth={hovered === seg.source ? STROKE + 4 : STROKE}
                  strokeDasharray={`${seg.segLen} ${CIRCUMFERENCE - seg.segLen}`}
                  strokeDashoffset={seg.offset}
                  opacity={hovered && hovered !== seg.source ? 0.35 : 1}
                  style={{ transition: "stroke-width 150ms, opacity 150ms", cursor: "pointer" }}
                  onMouseEnter={() => setHovered(seg.source)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <title>{seg.meta.label}: {seg.count} ({seg.pct}%)</title>
                </circle>
              ))}
            </g>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-serif font-bold text-editorial-primary">{total}</span>
            <span className="text-[9px] text-zinc-400 uppercase tracking-widest font-bold">respostas</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 w-full space-y-2">
          {segments.map(seg => (
            <div
              key={seg.source}
              onMouseEnter={() => setHovered(seg.source)}
              onMouseLeave={() => setHovered(null)}
              className={`flex items-center justify-between text-xs px-2 py-1.5 rounded-md transition cursor-pointer ${hovered === seg.source ? "bg-editorial-secondary" : ""}`}
            >
              <span className="flex items-center gap-2 text-zinc-700 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SWATCH[seg.source] || (seg.meta.color.startsWith("#") ? seg.meta.color : "#9CA3AF") }} />
                {seg.meta.icon} {seg.meta.label}
              </span>
              <span className="text-zinc-500">{seg.count} <span className="text-zinc-400">({seg.pct}%)</span></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
