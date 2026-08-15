import { Pousada } from "../types";

// Um perfil de pousada só aparece pro público depois de ter o mínimo pra não
// parecer um cadastro vazio — foi um bug visto ao vivo numa reunião: uma
// pousada de teste, recém-criada e sem nenhuma informação, apareceu direto
// na vitrine principal do site. O admin continua vendo todos os cadastros
// (completos ou não) no painel de Gestão — esse filtro só esconde da
// vitrine pública, nunca da lista administrativa.
export function isCompletePousadaProfile(p: Pousada): boolean {
  return Boolean(
    p.description?.trim() &&
    p.location?.trim() &&
    p.images?.length > 0 &&
    p.pricePerNight > 0 &&
    p.capacity > 0
  );
}
