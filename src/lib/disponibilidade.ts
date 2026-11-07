// Cabe nesta data? E, se não couber, quais as datas livres mais próximas com
// o mesmo número de noites? Mesma regra de checkPousadaAvailability (quartos
// por tipo ou capacidade total), calculada em memória a partir das reservas
// de uma janela — uma consulta ao banco em vez de uma por dia testado.
// Sem imports: também é usado pelo servidor.

export interface Ocupacao {
  checkIn: string;
  checkOut: string;
  adults?: number;
  children?: number;
  roomType?: string | null;
  status?: string;
  holdUntil?: string | null;
}
export interface PousadaCapacidade {
  capacity: number;
  rooms?: { type: string; capacity: number; quantity: number }[];
  unavailableDates?: string[];
}

const DAY = 86400000;
export const shiftISO = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * DAY).toISOString().slice(0, 10);
export const noites = (ci: string, co: string) => Math.round((Date.parse(`${co}T00:00:00Z`) - Date.parse(`${ci}T00:00:00Z`)) / DAY);

const ocupa = (b: Ocupacao, now: number) =>
  b.status !== "cancelado" && !(b.status === "pendente_pagamento" && b.holdUntil && Date.parse(b.holdUntil) < now);

export function cabeNaData(p: PousadaCapacidade, ocup: Ocupacao[], ci: string, co: string, hospedes: number, roomType?: string, now = Date.now()): boolean {
  if ((p.unavailableDates || []).some(d => d >= ci && d < co)) return false;
  const cruzam = ocup.filter(b => ocupa(b, now) && b.checkIn < co && ci < b.checkOut);
  if (roomType) {
    const room = (p.rooms || []).find(r => r.type === roomType);
    if (!room || hospedes > room.capacity) return false;
    return cruzam.filter(b => b.roomType === roomType).length < room.quantity;
  }
  const ja = cruzam.reduce((acc, b) => acc + (b.adults || 0) + (b.children || 0), 0);
  return ja + hospedes <= p.capacity;
}

// Datas livres mais próximas (mesmo número de noites), olhando até maxDias
// para frente e para trás — nunca antes de "primeiroDia". Empate: prefere
// depois (quem planeja costuma conseguir adiar mais do que adiantar).
export function datasLivresMaisProximas(
  p: PousadaCapacidade, ocup: Ocupacao[], ci: string, co: string, hospedes: number, roomType: string | undefined,
  opts: { primeiroDia: string; maxDias?: number; now?: number }
): { checkIn: string; checkOut: string; diferencaDias: number } | null {
  const n = noites(ci, co);
  if (n < 1) return null;
  // Grupo maior que o quarto não se resolve mudando a data.
  if (roomType) {
    const room = (p.rooms || []).find(r => r.type === roomType);
    if (!room || hospedes > room.capacity) return null;
  } else if (hospedes > p.capacity) return null;
  const max = opts.maxDias ?? 90;
  for (let d = 1; d <= max; d++) {
    for (const dir of [1, -1]) {
      const nci = shiftISO(ci, d * dir);
      if (nci < opts.primeiroDia) continue;
      const nco = shiftISO(nci, n);
      if (cabeNaData(p, ocup, nci, nco, hospedes, roomType, opts.now)) return { checkIn: nci, checkOut: nco, diferencaDias: d * dir };
    }
  }
  return null;
}
