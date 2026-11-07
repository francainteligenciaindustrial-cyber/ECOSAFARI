// Reserva do carrinho ainda não paga cujo prazo para pagar já passou — não
// ocupa mais o quarto. Sem imports: também é usado pelo servidor.
export function isExpiredHold(b: { status?: string; holdUntil?: string | null }, now = Date.now()): boolean {
  return b.status === "pendente_pagamento" && !!b.holdUntil && Date.parse(b.holdUntil) < now;
}
