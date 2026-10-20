// Caminho pra onde levar o turista depois do login/confirmação de email
// (ex: a reserva que ele começou antes de ter cadastro).
export const RETURN_TO_KEY = "ecosafari_return_to";

export function consumeReturnTo(): string | null {
  try {
    const path = localStorage.getItem(RETURN_TO_KEY);
    localStorage.removeItem(RETURN_TO_KEY);
    // Só caminhos internos — nunca um endereço externo.
    return path && /^\/[a-z0-9/_-]*$/i.test(path) ? path : null;
  } catch {
    return null;
  }
}
