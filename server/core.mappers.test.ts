import { describe, expect, it, beforeAll } from "vitest";

// O núcleo cria o cliente Supabase ao ser importado — valores falsos bastam,
// nenhum teste aqui chama o banco.
let core: typeof import("./core");
beforeAll(async () => {
  process.env.SUPABASE_URL ||= "https://exemplo.supabase.co";
  process.env.SUPABASE_ANON_KEY ||= "teste";
  core = await import("./core");
});

describe("mapPousadaRow", () => {
  // Regressão: a função é uma lista fixa de campos. Campo salvo pela Gestão
  // que não passa por ela some do site e é apagado no próximo "salvar".
  it("devolve todos os campos editáveis da pousada", () => {
    const row: Record<string, unknown> = {
      id: "p1", name: "Pousada", customDomain: "pousada.com", sitePublicado: true, appLodgeId: "uuid",
      emailContato: "c@p.com", emailRemetente: "r@p.com", emailRemetenteNome: "Pousada", latitude: -16.5, longitude: "-56.7",
    };
    for (const f of core.POUSADA_UPDATE_FIELDS) if (!(f in row)) row[f] = f === "latitude" || f === "longitude" ? 1 : `v-${f}`;
    const mapped = core.mapPousadaRow(row) as unknown as Record<string, unknown>;
    const ignorados = new Set(["images", "features", "activities", "experiences", "officialSiteImages", "rooms", "menu", "unavailableDates", "cuisineTypes", "transportOptions", "entertainmentOptions", "capacity", "pricePerNight", "verified", "hasOwnWebsite", "hasParking", "hasWifi", "sitePublicado"]);
    for (const f of core.POUSADA_UPDATE_FIELDS) {
      expect(mapped, `campo "${f}" não chega ao site`).toHaveProperty(f);
      if (!ignorados.has(f)) expect(mapped[f], `campo "${f}" perde o valor`).toBeTruthy();
    }
    expect(mapped.customDomain).toBe("pousada.com");
    expect(mapped.sitePublicado).toBe(true);
    expect(mapped.longitude).toBe(-56.7);
  });
});
