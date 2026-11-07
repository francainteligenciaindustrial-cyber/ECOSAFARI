// Validação de CPF, CNPJ e chave Pix (contrato de parceria e repasse).
// Sem imports: também é usado pelo servidor.

export const soDigitos = (s: string) => String(s || "").replace(/\D/g, "");

export function cpfValido(v: string): boolean {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (len: number) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(d[i]) * (len + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function cnpjValido(v: string): boolean {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (len: number) => {
    const pesos = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

export const documentoValido = (v: string) => cpfValido(v) || cnpjValido(v);

export function formatarDocumento(v: string): string {
  const d = soDigitos(v);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return v;
}

export type PixTipo = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";

export function pixChaveValida(tipo: PixTipo, chave: string): boolean {
  const c = String(chave || "").trim();
  switch (tipo) {
    case "cpf": return cpfValido(c);
    case "cnpj": return cnpjValido(c);
    case "email": return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) && c.length <= 77;
    case "telefone": { const d = soDigitos(c); return d.length >= 10 && d.length <= 13; }
    case "aleatoria": return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c);
    default: return false;
  }
}
