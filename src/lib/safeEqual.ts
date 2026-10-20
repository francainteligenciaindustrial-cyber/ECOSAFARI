import { createHash, timingSafeEqual } from "crypto";

// Comparação de segredos em tempo constante. `a !== b` termina no primeiro
// caractere diferente, o que permite descobrir um token caractere por
// caractere medindo o tempo de resposta. Comparar os hashes SHA-256 deixa
// os dois lados com o mesmo tamanho (exigência do timingSafeEqual) sem
// vazar o tamanho do segredo.
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}
