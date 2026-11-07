import { describe, expect, it } from "vitest";
import { clampScore, ratingWindow, summarizeGuestRatings } from "./guestRating";

describe("ratingWindow", () => {
  const today = "2026-11-07";
  it("libera depois do check-out e dentro de 30 dias", () => {
    expect(ratingWindow({ status: "confirmado_total", checkOut: "2026-11-07" }, today).ok).toBe(true);
    expect(ratingWindow({ status: "pago", checkOut: "2026-10-10" }, today).ok).toBe(true);
  });
  it("bloqueia antes do check-out, depois do prazo e reservas que não aconteceram", () => {
    expect(ratingWindow({ status: "pago", checkOut: "2026-11-08" }, today).ok).toBe(false);
    expect(ratingWindow({ status: "pago", checkOut: "2026-10-01" }, today).ok).toBe(false);
    expect(ratingWindow({ status: "cancelado", checkOut: "2026-11-05" }, today).ok).toBe(false);
    expect(ratingWindow({ status: "pendente_pagamento", checkOut: "2026-11-05" }, today).ok).toBe(false);
  });
});

describe("clampScore", () => {
  it("aceita só 1 a 5", () => {
    expect(clampScore(4)).toBe(4);
    expect(clampScore("5")).toBe(5);
    expect(clampScore(0)).toBeNull();
    expect(clampScore(6)).toBeNull();
    expect(clampScore("x")).toBeNull();
  });
});

describe("summarizeGuestRatings", () => {
  it("calcula as médias e traz os comentários mais recentes", () => {
    const s = summarizeGuestRatings([
      { notaComunicacao: 5, notaRegras: 4, notaCuidado: 5, nota: 4.67, comentario: "Ótimo hóspede", autorTipo: "pousada", createdAt: "2026-11-01" },
      { notaComunicacao: 3, notaRegras: 4, notaCuidado: 3, nota: 3.33, comentario: "", autorTipo: "guia", createdAt: "2026-11-03" },
    ]);
    expect(s.total).toBe(2);
    expect(s.media).toBe(4);
    expect(s.comunicacao).toBe(4);
    expect(s.comentarios).toHaveLength(1);
    expect(s.comentarios[0].comentario).toBe("Ótimo hóspede");
  });
  it("sem avaliações não inventa nota", () => {
    expect(summarizeGuestRatings([]).media).toBeNull();
  });
});
