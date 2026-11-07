// Token do link "Descadastrar" dos e-mails de novidades: HMAC do e-mail com
// um segredo do servidor. Não precisa de tabela nem expira — só quem
// recebeu o e-mail tem o link, e ele só serve para desligar as novidades
// daquele endereço (nunca para ler ou mudar outra coisa).
import { createHmac, timingSafeEqual } from "crypto";

const normalize = (email: string) => email.trim().toLowerCase();

export function unsubscribeToken(email: string, secret: string): string {
  return createHmac("sha256", secret).update(`unsubscribe:${normalize(email)}`).digest("base64url").slice(0, 32);
}

export function verifyUnsubscribeToken(email: string, token: string, secret: string): boolean {
  if (!email || !token || !secret) return false;
  const expected = Buffer.from(unsubscribeToken(email, secret));
  const got = Buffer.from(String(token));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export function unsubscribeUrl(siteUrl: string, email: string, secret: string): string {
  const e = encodeURIComponent(normalize(email));
  return `${siteUrl.replace(/\/$/, "")}/descadastrar?e=${e}&t=${unsubscribeToken(email, secret)}`;
}
