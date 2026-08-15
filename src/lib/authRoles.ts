// Espelha isAdminUser() do server.ts: a conta é admin se app_metadata.isAdmin
// for true, com fallback pro formato antigo (role === "admin") usado por
// contas criadas antes da governança por votação dos admins-chefe existir.
// isAdmin convive com qualquer outro papel (role: "tourist"/"partner") que a
// mesma conta já tenha — um guia ou turista também pode ser admin.
export function isAdminUser(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return user?.app_metadata?.isAdmin === true || user?.app_metadata?.role === "admin";
}

export function isChiefUser(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return user?.app_metadata?.isChief === true;
}
