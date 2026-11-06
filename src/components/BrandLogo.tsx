import React from "react";

// Marca Ipantanal: símbolo "iP" (o ponto do i em verde sobre o P) e o nome
// IPANTANAL em Space Grotesk espaçado, com o primeiro I em verde.
// tone "light" = fundo claro (Grafite + Verde Mata); "dark" = fundo escuro
// (Névoa + Verde Sinal). Mesmo desenho do favicon e dos ícones do app.
const INK = { light: "#0B1412", dark: "#F4F6F5" } as const;
const GREEN = { light: "#0B9467", dark: "#2EE59D" } as const;

export function BrandMark({ size = 28, tone = "light", title }: { size?: number; tone?: "light" | "dark"; title?: string }) {
  return (
    <svg
      width={size}
      height={size * 1.25}
      viewBox="0 0 64 80"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ flexShrink: 0, display: "block" }}
    >
      <circle cx="12" cy="12" r="9" fill={GREEN[tone]} />
      <path d="M17 32 V70" stroke={INK[tone]} strokeWidth="12" strokeLinecap="round" fill="none" />
      <path d="M17 32 H36 A15 15 0 0 1 36 62 H17" stroke={INK[tone]} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export default function BrandLogo({ size = "md", tone = "light", showWordmark = true }: { size?: "sm" | "md" | "lg"; tone?: "light" | "dark"; showWordmark?: boolean }) {
  const s = { sm: { mark: 20, text: 15, gap: 10 }, md: { mark: 28, text: 19, gap: 12 }, lg: { mark: 34, text: 26, gap: 16 } }[size];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: s.gap, fontStyle: "normal" }}>
      <BrandMark size={s.mark} tone={tone} title={showWordmark ? undefined : "Ipantanal"} />
      {showWordmark && (
        <span
          style={{
            fontFamily: '"Space Grotesk", Inter, sans-serif',
            fontWeight: 500,
            fontSize: s.text,
            letterSpacing: "0.2em",
            lineHeight: 1,
            color: INK[tone],
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: GREEN[tone] }}>I</span>PANTANAL
        </span>
      )}
    </span>
  );
}
