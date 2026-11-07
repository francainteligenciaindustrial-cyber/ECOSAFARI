// Antes de uma reserva paga, as mensagens turista ↔ guia não podem trocar
// contato direto (telefone, email, links, @ de rede social) — é o que
// protege a comissão e mantém a conversa visível para a plataforma em caso
// de problema (mesma regra de Airbnb Experiências, GetYourGuide e Viator).

export const HIDDEN = "[contato oculto até a reserva]";

const PATTERNS: RegExp[] = [
  // emails (inclusive "fulano arroba gmail ponto com")
  /[\w.+-]+\s*(?:@|\(at\)|\[at\]|\barroba\b)\s*[\w-]+(?:\s*(?:\.|\bponto\b)\s*[a-z]{2,})+/gi,
  // links e domínios
  /\b(?:https?:\/\/|www\.)\S+/gi,
  /\b(?:wa\.me|whatsapp\.com|chat\.whatsapp\.com|t\.me|instagram\.com|facebook\.com|fb\.me)\/?\S*/gi,
  /\b[\w-]+\.(?:com|com\.br|net|org|br|me|io|app)\b(?:\/\S*)?/gi,
  // @usuario de redes sociais
  /(^|[\s(])@[a-z0-9_.]{3,}/gi,
  // telefones: 8+ dígitos com espaços, pontos, traços, parênteses ou +55
  /(?:\+?\d[\s().-]*){8,}/g,
];

export function maskContact(text: string): { text: string; masked: boolean } {
  let out = text;
  for (const re of PATTERNS) {
    out = out.replace(re, (m: string, lead?: string) => (typeof lead === "string" && m.startsWith(lead) && lead.length < m.length && /@/.test(m) ? `${lead}${HIDDEN}` : HIDDEN));
  }
  // Dígitos escritos por extenso em sequência ("nove nove oito...") — 8+ palavras de número seguidas.
  out = out.replace(/\b(?:(?:zero|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove)\b[\s,.-]*){8,}/gi, HIDDEN);
  return { text: out, masked: out !== text };
}
