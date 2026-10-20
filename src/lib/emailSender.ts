// Montagem do remetente dos e-mails de reserva (usado por server/core.ts).
// Puro, sem dependências do servidor, para poder ser testado.

export const EMAIL_ADDRESS = /^[^\s@<>"]+@([a-z0-9-]+\.)+[a-z]{2,}$/i;

// "EcoSafari Brasil <contato@dominio>" -> nome e endereço separados.
export function parseFromHeader(header: string): { name: string; address: string } {
  const m = header.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim(), address: m[2].trim() } : { name: "", address: header.trim() };
}

// Nome exibido vem do cadastro da pousada: tira o que quebraria o cabeçalho.
export const displayName = (s: unknown) =>
  String(s ?? "").replace(/[<>"\\\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

export const fromHeader = (name: string, address: string) => (name ? `"${name}" <${address}>` : address);

// Regra do remetente: domínio próprio da pousada (se o admin configurou) ou
// "Pousada via EcoSafari <endereço da plataforma>".
export function buildPousadaSender(opts: {
  pousadaName: string;
  platformFrom: string;
  ownAddress?: string | null;
  ownName?: string | null;
}): string {
  const own = String(opts.ownAddress || "").trim();
  if (EMAIL_ADDRESS.test(own)) return fromHeader(displayName(opts.ownName || opts.pousadaName), own);
  const platform = parseFromHeader(opts.platformFrom);
  return fromHeader(displayName(`${opts.pousadaName} via ${platform.name || "EcoSafari Brasil"}`), platform.address);
}

// Primeiro e-mail válido da lista vira o "Responder para".
export const pickReplyTo = (...candidates: (string | null | undefined)[]) =>
  candidates.map(c => String(c || "").trim()).find(c => EMAIL_ADDRESS.test(c));
