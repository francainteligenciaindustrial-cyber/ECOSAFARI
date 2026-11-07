// Carrinho do turista, guardado no navegador (a reserva de verdade só nasce
// no pagamento — ver server/routes/carrinho.ts). Cada item é exatamente o
// pedido de uma reserva online: o servidor recalcula preço e vaga.
import { useSyncExternalStore } from "react";

export const MAX_CART_ITEMS = 8;
const KEY = "ipantanal-carrinho";
const EVENT = "ipantanal-carrinho";

export interface CartItem {
  key: string;
  pousadaId: string;
  pousadaName: string;
  image?: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  childAges?: string;
  roomType?: string;
  experienceTypes?: string[];
  pacoteId?: string;
  pacoteName?: string;
  pacoteNights?: number;
  dietaryRestrictions?: string;
  specialNeeds?: string;
  details?: Record<string, unknown>;
  estimate?: number;
  addedAt: string;
}

// Mesma pousada + mesmas datas + mesmo quarto/pacote = mesmo item (substitui).
export const cartItemKey = (i: Pick<CartItem, "pousadaId" | "checkIn" | "checkOut" | "roomType" | "pacoteId">) =>
  [i.pousadaId, i.checkIn, i.checkOut, i.roomType || "", i.pacoteId || ""].join("|");

export function addToCart(list: CartItem[], item: Omit<CartItem, "key" | "addedAt">): { list: CartItem[]; replaced: boolean; full: boolean } {
  const key = cartItemKey(item);
  const existing = list.findIndex(i => i.key === key);
  const next: CartItem = { ...item, key, addedAt: new Date().toISOString() };
  if (existing >= 0) return { list: list.map((i, idx) => (idx === existing ? next : i)), replaced: true, full: false };
  if (list.length >= MAX_CART_ITEMS) return { list, replaced: false, full: true };
  return { list: [...list, next], replaced: false, full: false };
}

export function updateCartItem(list: CartItem[], key: string, patch: Partial<CartItem>): CartItem[] {
  return list.map(i => {
    if (i.key !== key) return i;
    const merged = { ...i, ...patch };
    return { ...merged, key: cartItemKey(merged) };
  });
}

export const removeFromCart = (list: CartItem[], key: string) => list.filter(i => i.key !== key);

// O que vai para o servidor (POST /api/carrinho/cotar e checkout).
export const toBookingRequest = (i: CartItem) => ({
  pousadaId: i.pousadaId,
  checkIn: i.checkIn,
  checkOut: i.checkOut,
  adults: i.adults,
  children: i.children,
  childAges: i.childAges,
  roomType: i.roomType || undefined,
  experienceTypes: i.pacoteId ? [] : i.experienceTypes || [],
  pacoteId: i.pacoteId,
  dietaryRestrictions: i.dietaryRestrictions,
  specialNeeds: i.specialNeeds,
  details: i.details,
});

// ---- armazenamento (localStorage pode falhar: aba anônima, bloqueio) ----
let cache: CartItem[] | null = null;

export function readCart(): CartItem[] {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    cache = Array.isArray(raw) ? raw.filter(i => i && typeof i.pousadaId === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function writeCart(list: CartItem[]) {
  cache = list;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* segue só na memória */ }
  window.dispatchEvent(new Event(EVENT));
}

export const clearCart = () => writeCart([]);

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; cb(); } };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY: CartItem[] = [];
export function useCart(): CartItem[] {
  return useSyncExternalStore(subscribe, readCart, () => EMPTY);
}
