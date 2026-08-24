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

// Mesma lógica de isAdminUser, mas pro papel de turista: isTourist convive
// com isAdmin/role de parceiro que a conta já tenha (ver POST
// /api/turista/upgrade em server.ts, que deixa um admin ou parceiro virar
// turista com a MESMA conta em vez de precisar criar uma segunda). role ===
// "tourist" continua valendo pras contas de turista "puras" já existentes.
export function isTouristUser(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return user?.app_metadata?.isTourist === true || user?.app_metadata?.role === "tourist";
}

// Parceiro (pousada/atração/guia) nunca ganhou um flag booleano próprio como
// isAdmin/isTourist — continua identificado só pelo campo legado role, já
// que a conta é sempre provisionada por convite/candidatura aprovada, nunca
// auto-cadastro. Usado no cabeçalho (App.tsx) pra saber se mostra "Meu
// Painel" (link pra /parceiro) em vez de "Entrar".
export function isPartnerUser(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return user?.app_metadata?.role === "partner";
}
