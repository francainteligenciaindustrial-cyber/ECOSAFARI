// Serviços de prestador: o passeio da pousada diz o que precisa ("Guia
// turístico", "Piloteiro", "Cozinheiro(a)"...) e o prestador marca no
// cadastro o que faz ("Piloteiro(a)", "Guia local", "Artista (música...)").
// Os nomes não batem letra a letra, então os dois lados viram uma chave.
// Sem imports: também é usado pelo servidor.

export type ServicoKey =
  | "guia" | "piloteiro" | "cozinheiro" | "fotografo" | "artista"
  | "camareira" | "motorista" | "garcom" | "recepcao" | "manutencao" | "diarista" | "outro";

const RULES: [ServicoKey, RegExp][] = [
  ["guia", /\bguia/],
  ["piloteiro", /pilot|barqueir/],
  ["cozinheiro", /cozinh|chef/],
  ["fotografo", /fotograf/],
  ["artista", /artista|music|cantor|danca|artesa/],
  ["camareira", /camareir/],
  ["motorista", /motorista|transfer/],
  ["garcom", /garco|garconete/],
  ["recepcao", /recep/],
  ["manutencao", /manuten/],
  ["diarista", /diarist|limpeza/],
];

const plain = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function servicoKey(label: string): ServicoKey {
  const s = plain(label);
  for (const [key, re] of RULES) if (re.test(s)) return key;
  return "outro";
}

export const isServicoGuia = (label: string) => servicoKey(label) === "guia";

// O prestador faz este serviço? "Outro" só casa com o mesmo texto.
export function prestaServico(servicosDoPrestador: string[], servicoPedido: string): boolean {
  const key = servicoKey(servicoPedido);
  return (servicosDoPrestador || []).some(s => {
    const k = servicoKey(s);
    return key === "outro" ? k === "outro" && plain(s).trim() === plain(servicoPedido).trim() : k === key;
  });
}

// Datas [checkIn, checkOut) se cruzam? (mesmo dia de saída e entrada não conflita)
export const datasCruzam = (aIn: string, aOut: string, bIn: string, bOut: string) => aIn < bOut && bIn < aOut;

// Alguma data bloqueada pelo prestador cai dentro da estadia?
export const temDataBloqueada = (bloqueadas: string[] | undefined, checkIn: string, checkOut: string) =>
  (bloqueadas || []).some(d => d >= checkIn && d < checkOut);

export const RAIO_PADRAO_KM = 150;
