import { describe, it, expect } from "vitest";
import { addToCart, cartItemKey, removeFromCart, updateCartItem, toBookingRequest, MAX_CART_ITEMS, type CartItem } from "./cart";
import { isExpiredHold } from "./cartHold";

const base = { pousadaId: "p1", pousadaName: "Vagalume", checkIn: "2027-07-10", checkOut: "2027-07-13", adults: 2, children: 0 };

describe("carrinho", () => {
  it("adiciona e substitui o mesmo item (mesma pousada, datas e quarto)", () => {
    let list: CartItem[] = [];
    list = addToCart(list, base).list;
    const r = addToCart(list, { ...base, adults: 3 });
    expect(r.replaced).toBe(true);
    expect(r.list).toHaveLength(1);
    expect(r.list[0].adults).toBe(3);
    expect(addToCart(r.list, { ...base, roomType: "Suíte" }).list).toHaveLength(2);
  });

  it("respeita o limite de itens", () => {
    let list: CartItem[] = [];
    for (let i = 0; i < MAX_CART_ITEMS; i++) list = addToCart(list, { ...base, pousadaId: `p${i}` }).list;
    const r = addToCart(list, { ...base, pousadaId: "extra" });
    expect(r.full).toBe(true);
    expect(r.list).toHaveLength(MAX_CART_ITEMS);
  });

  it("editar recalcula a chave; remover tira só o item", () => {
    let list = addToCart([], base).list;
    list = addToCart(list, { ...base, pousadaId: "p2" }).list;
    const key = list[0].key;
    list = updateCartItem(list, key, { roomType: "Chalé" });
    expect(list[0].key).toBe(cartItemKey({ ...base, roomType: "Chalé" }));
    expect(removeFromCart(list, list[0].key).map(i => i.pousadaId)).toEqual(["p2"]);
  });

  it("pacote não manda passeios avulsos", () => {
    const [item] = addToCart([], { ...base, pacoteId: "pk1", experienceTypes: ["Focagem"] }).list;
    expect(toBookingRequest(item).experienceTypes).toEqual([]);
  });

  it("vaga segurada vence só para reserva pendente com prazo passado", () => {
    const now = Date.parse("2027-01-01T12:00:00Z");
    expect(isExpiredHold({ status: "pendente_pagamento", holdUntil: "2027-01-01T11:59:00Z" }, now)).toBe(true);
    expect(isExpiredHold({ status: "pendente_pagamento", holdUntil: "2027-01-01T12:30:00Z" }, now)).toBe(false);
    expect(isExpiredHold({ status: "pago", holdUntil: "2027-01-01T11:00:00Z" }, now)).toBe(false);
    expect(isExpiredHold({ status: "pendente_pagamento" }, now)).toBe(false);
  });
});
