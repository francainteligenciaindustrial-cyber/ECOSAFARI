// Oportunidades para prestadores: quando uma reserva paga inclui um passeio
// que precisa de guia, piloteiro, cozinheiro etc., os prestadores certos
// recebem um e-mail ("acabou de aparecer um passeio perto de você") com
// Aceitar/Recusar. O primeiro que aceita fica com o serviço; o contato do
// hóspede só é liberado para ele.
//
// Quem é chamado:
//  - Guias (cadastro de guia): status "disponível", com área de atuação
//    (cidade-base + raio) cobrindo a pousada, livres nas datas.
//  - Prestadores aprovados pela pousada (piloteiro, cozinheiro, artista,
//    guia local...): os que fazem o serviço pedido.
import type { Express, Request } from "express";
import { randomBytes, randomUUID } from "crypto";
import type { Booking, Guide, Pousada } from "../../src/types.js";
import { distanceKm } from "../../src/lib/mapsLinks.js";
import { prestaServico, isServicoGuia, datasCruzam, temDataBloqueada, RAIO_PADRAO_KM } from "../../src/lib/servicos.js";
import {
  addNotification,
  applyBookingStatusUpdate,
  authLimiter,
  bookingHooks,
  bookingRef,
  EMAIL_REPLY_TO,
  escapeHtml,
  getPartnerUserFromRequest,
  getPousadaGestorEmails,
  loadPacote,
  log,
  mapColaborador,
  mapGuideRow,
  mapPousadaRow,
  requireAdmin,
  sendEmail,
  SITE_URL,
  supabase,
} from "../core.js";

const MAX_CONVITES = 40;
const MIGRATION_MSG = "As oportunidades para prestadores precisam da migração scripts/add-oportunidades.sql rodada no Supabase.";
const isMissing = (err: any) => !!err && /relation|does not exist|schema cache|column/i.test(String(err.message || ""));
const br = (iso: string) => String(iso || "").slice(0, 10).split("-").reverse().join("/");
const firstName = (n: string) => (String(n || "").trim().split(/\s+/)[0] || "Prestador");
const waLink = (phone?: string) => {
  const d = String(phone || "").replace(/\D/g, "");
  return d ? `https://wa.me/${d.length <= 11 ? `55${d}` : d}` : null;
};

type PrestadorTipo = "guia" | "colaborador";
interface Candidato { tipo: PrestadorTipo; id: string; nome: string; email: string; telefone?: string; distanciaKm?: number }

// ---------------------------------------------------------------- serviços
// Que prestadores esta reserva precisa: os passeios escolhidos marcados
// como "precisa de prestador" no cadastro da pousada.
export async function servicosDaReserva(booking: Booking, pousada: Pousada): Promise<string[]> {
  const titulos = String(booking.experienceType || "").split(" + ").map(s => s.trim()).filter(Boolean);
  const servicos = (pousada.experiences || [])
    .filter(e => titulos.includes(e.title) && e.requiresProvider)
    .map(e => e.providerType || "Guia turístico");
  // Pacote com guia fixo já tem guia: não abre vaga de guia.
  let temGuiaFixo = !!booking.guideId;
  if (booking.pacoteId && !temGuiaFixo) {
    const pacote = await loadPacote(booking.pacoteId).catch(() => null);
    temGuiaFixo = !!pacote?.guideId;
  }
  const unicos: string[] = [];
  for (const s of servicos) {
    if (isServicoGuia(s) && temGuiaFixo) continue;
    if (!unicos.some(u => u.toLowerCase() === s.toLowerCase())) unicos.push(s);
  }
  return unicos;
}

// ----------------------------------------------------------- candidatos
async function candidatos(servico: string, booking: Booking, pousada: Pousada, excluir: string[] = []): Promise<Candidato[]> {
  const out: Candidato[] = [];

  if (isServicoGuia(servico) && typeof pousada.latitude === "number" && typeof pousada.longitude === "number") {
    const { data: guias } = await supabase.from("guides").select("*").eq("status", "disponivel");
    const lista = (guias || []).map(mapGuideRow) as (Guide & { baseLatitude?: number; baseLongitude?: number; raioKm?: number })[];
    // Guias já ocupados nessas datas com outra reserva.
    const { data: ocupados } = await supabase.from("bookings").select("guideId, checkIn, checkOut, status").not("guideId", "is", null).neq("status", "cancelado").lt("checkIn", booking.checkOut).gt("checkOut", booking.checkIn);
    const ocupadosIds = new Set((ocupados || []).filter((b: any) => datasCruzam(b.checkIn, b.checkOut, booking.checkIn, booking.checkOut)).map((b: any) => b.guideId));
    for (const g of lista) {
      const lat = Number(g.baseLatitude);
      const lng = Number(g.baseLongitude);
      if (!g.email || !Number.isFinite(lat) || !Number.isFinite(lng) || g.baseLatitude == null) continue;
      if (ocupadosIds.has(g.id) || temDataBloqueada(g.unavailableDates, booking.checkIn, booking.checkOut)) continue;
      const d = distanceKm(lat, lng, pousada.latitude, pousada.longitude);
      if (d > (Number(g.raioKm) || RAIO_PADRAO_KM)) continue;
      out.push({ tipo: "guia", id: g.id, nome: g.name, email: g.email, telefone: g.phone, distanciaKm: Math.round(d) });
    }
  }

  // Prestadores aprovados pela própria pousada que fazem este serviço.
  const { data: colabs } = await supabase.from("colaboradores").select("*").eq("pousadaId", pousada.id).eq("status", "aprovado");
  for (const c of (colabs || []).map(mapColaborador)) {
    if (!c.email || !prestaServico(c.services || [], servico)) continue;
    out.push({ tipo: "colaborador", id: c.id, nome: c.name, email: c.email, telefone: c.phone });
  }

  return out
    .filter(c => !excluir.includes(`${c.tipo}:${c.id}`))
    .sort((a, b) => (a.tipo === b.tipo ? (a.distanciaKm ?? 0) - (b.distanciaKm ?? 0) : a.tipo === "colaborador" ? -1 : 1))
    .slice(0, MAX_CONVITES);
}

// ------------------------------------------------------------- e-mails
const linkDoConvite = (opId: string, token: string) => `${SITE_URL}/oportunidade/${encodeURIComponent(opId)}?t=${encodeURIComponent(token)}`;

function detalhesHtml(op: any, pousada: Pousada | null, distanciaKm?: number) {
  const linhas = [
    ["Serviço", escapeHtml(op.servico)],
    ["Passeio", escapeHtml(op.experiencia || "—")],
    ["Onde", `${escapeHtml(pousada?.name || op.pousadaName || "")}${pousada?.location ? ` — ${escapeHtml(pousada.location)}` : ""}${typeof distanciaKm === "number" ? ` (cerca de ${distanciaKm} km de você)` : ""}`],
    ["Datas", `${br(op.checkIn)} a ${br(op.checkOut)}`],
    ["Grupo", `${op.pessoas} pessoa(s)${op.idioma ? ` · idioma/país: ${escapeHtml(op.idioma)}` : ""}`],
  ];
  return `<div style="margin:0 0 18px;padding:16px;background:#F4F6F5;border-radius:14px">${linhas.map(([k, v]) => `<p style="margin:0 0 6px;font-size:14px"><strong>${k}:</strong> ${v}</p>`).join("")}</div>`;
}

async function enviarConvite(op: any, convite: any, pousada: Pousada | null, distanciaKm?: number) {
  const link = linkDoConvite(op.id, convite.token);
  const r = await sendEmail({
    to: convite.email,
    subject: `Olá ${firstName(convite.nome)}, acabou de aparecer um passeio turístico perto de você`,
    preheader: `${op.servico} · ${br(op.checkIn)} a ${br(op.checkOut)} · ${pousada?.name || ""}. Aceite antes que outro prestador pegue.`,
    html: `
      <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;color:#0B1412">Olá, ${escapeHtml(firstName(convite.nome))}! Acabou de aparecer um passeio turístico perto de você 🌿</h1>
      <p style="margin:0 0 16px">Um hóspede pagou uma reserva que precisa de <strong>${escapeHtml(op.servico.toLowerCase())}</strong>. Veja os detalhes:</p>
      ${detalhesHtml(op, pousada, distanciaKm)}
      <p style="margin:0 0 8px;font-size:14px">O primeiro prestador que aceitar fica com o serviço. Depois de aceitar, você recebe o contato do hóspede e da pousada.</p>
      <p style="margin:24px 0 8px">
        <a href="${link}&acao=aceitar" style="display:inline-block;background:#0B9467;color:#FFFFFF;padding:12px 26px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px;margin:0 8px 8px 0">Aceitar</a>
        <a href="${link}&acao=recusar" style="display:inline-block;background:#FFFFFF;color:#0B1412;border:1px solid #D6E0DC;padding:12px 26px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px;margin:0 0 8px 0">Recusar</a>
      </p>
      <p style="margin:0;font-size:12px;color:#4F5D58">Os botões abrem o site do Ipantanal para você confirmar. Você também vê todas as oportunidades no seu portal de parceiro.</p>
    `,
  }).catch(() => ({ ok: false }));
  if (r && (r as any).ok !== false) await supabase.from("oportunidade_convites").update({ enviadoEm: new Date().toISOString() }).eq("id", convite.id);
}

// Arquivo de calendário (.ics) com lembrete na véspera.
function icsDoServico(op: any, booking: Booking, pousada: Pousada | null) {
  const d = (iso: string) => String(iso).slice(0, 10).replace(/-/g, "");
  const esc = (s: string) => String(s || "").replace(/[\\;,]/g, m => `\\${m}`).replace(/\n/g, "\\n");
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ipantanal//Oportunidades//PT", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${op.id}@ipantanal.com.br`, `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${d(booking.checkIn)}`, `DTEND;VALUE=DATE:${d(booking.checkOut)}`,
    `SUMMARY:${esc(`${op.servico} — ${booking.pousadaName} (reserva ${bookingRef(booking.id)})`)}`,
    `LOCATION:${esc(`${pousada?.name || booking.pousadaName}${pousada?.location ? `, ${pousada.location}` : ""}`)}`,
    `DESCRIPTION:${esc(`Hóspede: ${booking.customerName} (${booking.customerPhone || "sem telefone"}). ${op.pessoas} pessoa(s). ${op.experiencia || ""}`)}`,
    "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Passeio amanhã", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

async function emailConfirmacaoPrestador(op: any, convite: any, booking: Booking, pousada: Pousada | null) {
  const wa = waLink(booking.customerPhone);
  await sendEmail({
    to: convite.email,
    subject: `Serviço confirmado: ${op.servico} em ${br(booking.checkIn)} · ${booking.pousadaName}`,
    preheader: "Você ficou com o serviço. Contato do hóspede e evento de calendário neste e-mail.",
    html: `
      <h1 style="margin:0 0 8px;font-size:22px;color:#0B1412">Pronto, ${escapeHtml(firstName(convite.nome))}! O serviço é seu ✅</h1>
      <p style="margin:0 0 16px">Reserva <strong>${bookingRef(booking.id)}</strong>. Adicione ao seu calendário pelo arquivo em anexo (lembrete na véspera).</p>
      ${detalhesHtml(op, pousada)}
      <div style="margin:0 0 18px;padding:14px 16px;border:1px solid #D6E0DC;border-radius:14px">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#4F5D58;font-weight:700">Hóspede</p>
        <p style="margin:0 0 4px;font-weight:600">${escapeHtml(booking.customerName)}</p>
        ${wa ? `<p style="margin:0 0 4px;font-size:14px">WhatsApp: <a href="${wa}" style="color:#087A55;font-weight:600">${escapeHtml(booking.customerPhone || "")}</a></p>` : ""}
        ${booking.nationality ? `<p style="margin:0;font-size:14px">País: ${escapeHtml(booking.nationality)}</p>` : ""}
      </div>
      <p style="margin:0 0 8px;font-size:14px">Combine com o hóspede o horário e o ponto de encontro. Se não puder mais atender, cancele pelo portal o quanto antes para chamarmos outro prestador.</p>
      <p style="margin:24px 0"><a href="${SITE_URL}/parceiro" style="display:inline-block;background:#0B1412;color:#FFFFFF;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">Abrir meu portal</a></p>
    `,
    attachments: [{ filename: `servico-${bookingRef(booking.id)}.ics`, content: Buffer.from(icsDoServico(op, booking, pousada)).toString("base64") }],
  }).catch(() => {});
}

async function emailHospedePrestador(op: any, convite: any, booking: Booking) {
  if (!booking.customerEmail) return;
  const wa = waLink(convite.telefone);
  await sendEmail({
    to: booking.customerEmail,
    subject: `${op.servico} confirmado(a) para a sua viagem · Reserva ${bookingRef(booking.id)}`,
    preheader: `${convite.nome} vai atender você na ${booking.pousadaName}.`,
    html: `
      <h1 style="margin:0 0 12px;font-size:22px;color:#0B1412">${escapeHtml(op.servico)} confirmado(a)</h1>
      <p style="margin:0 0 16px"><strong>${escapeHtml(convite.nome)}</strong> vai atender você na <strong>${escapeHtml(booking.pousadaName)}</strong> (reserva ${bookingRef(booking.id)}, ${br(booking.checkIn)} a ${br(booking.checkOut)}).</p>
      ${wa ? `<p style="margin:24px 0"><a href="${wa}" style="display:inline-block;background:#0B9467;color:#FFFFFF;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">Falar com ${escapeHtml(firstName(convite.nome))} no WhatsApp</a></p><p style="margin:0 0 14px;font-size:14px">Telefone: ${escapeHtml(convite.telefone || "")}</p>` : ""}
    `,
  }).catch(() => {});
}

async function alertarGestao(texto: string, bookingId?: string) {
  addNotification("admin", texto, "status_update", bookingId);
  if (EMAIL_REPLY_TO) {
    await sendEmail({ to: EMAIL_REPLY_TO, subject: "Ipantanal — passeio sem prestador", html: `<p style="margin:0">${escapeHtml(texto)}</p><p style="margin:16px 0 0"><a href="${SITE_URL}/admin" style="color:#087A55">Abrir a Gestão</a></p>` }).catch(() => {});
  }
}

// ---------------------------------------------------------- criação
async function carregarPousada(id: string): Promise<Pousada | null> {
  const { data } = await supabase.from("pousadas").select("*").eq("id", id).maybeSingle();
  return data ? mapPousadaRow(data) : null;
}

// Convida (ou reconvida) os candidatos de uma oportunidade aberta.
async function convidar(op: any, booking: Booking, pousada: Pousada, excluir: string[] = []) {
  const { data: existentes } = await supabase.from("oportunidade_convites").select("*").eq("oportunidadeId", op.id);
  const recusaram = (existentes || []).filter((c: any) => c.resposta === "recusou").map((c: any) => `${c.prestadorTipo}:${c.prestadorId}`);
  const lista = await candidatos(op.servico, booking, pousada, [...excluir, ...recusaram]);
  if (lista.length === 0) {
    await alertarGestao(`Nenhum prestador encontrado para "${op.servico}" na reserva ${bookingRef(booking.id)} (${booking.pousadaName}, ${br(booking.checkIn)}). Escale manualmente ou cadastre prestadores na região.`, booking.id);
    return 0;
  }
  let enviados = 0;
  for (const c of lista) {
    let convite = (existentes || []).find((e: any) => e.prestadorTipo === c.tipo && e.prestadorId === c.id);
    if (!convite) {
      convite = {
        id: `oc_${randomUUID()}`, oportunidadeId: op.id, prestadorTipo: c.tipo, prestadorId: c.id,
        nome: c.nome, email: c.email, telefone: c.telefone || null, distanciaKm: c.distanciaKm ?? null,
        token: randomBytes(24).toString("base64url"), createdAt: new Date().toISOString(),
      };
      const { error } = await supabase.from("oportunidade_convites").insert(convite);
      if (error) { log.warn("Erro ao criar convite:", error.message); continue; }
    } else if (convite.resposta) continue;
    await enviarConvite(op, convite, pousada, c.distanciaKm);
    enviados++;
  }
  return enviados;
}

export async function abrirOportunidade(booking: Booking, servico: string) {
  const pousada = await carregarPousada(booking.pousadaId);
  if (!pousada) return null;
  const { data: jaExiste } = await supabase.from("oportunidades").select("*").eq("bookingId", booking.id).eq("servico", servico).in("status", ["aberta", "preenchida"]).maybeSingle();
  if (jaExiste) return jaExiste;
  const op = {
    id: `op_${randomUUID()}`, bookingId: booking.id, pousadaId: booking.pousadaId, pousadaName: booking.pousadaName,
    servico, status: "aberta", checkIn: booking.checkIn, checkOut: booking.checkOut,
    pessoas: (booking.adults || 0) + (booking.children || 0),
    experiencia: booking.experienceType || null, idioma: booking.nationality || null,
    createdAt: new Date().toISOString(),
  };
  const { error } = await supabase.from("oportunidades").insert(op);
  if (error) {
    if (isMissing(error)) log.warn(MIGRATION_MSG);
    else log.warn("Erro ao abrir oportunidade:", error.message);
    return null;
  }
  await convidar(op, booking, pousada);
  return op;
}

// --------------------------------------------------------- resposta
async function responder(convite: any, resposta: "aceitou" | "recusou", req: Request): Promise<{ status: number; body: any }> {
  const { data: op } = await supabase.from("oportunidades").select("*").eq("id", convite.oportunidadeId).maybeSingle();
  if (!op) return { status: 404, body: { error: "Oportunidade não encontrada." } };
  if (op.status === "preenchida" && op.aceitaTipo === convite.prestadorTipo && op.aceitaId === convite.prestadorId) {
    return { status: 200, body: { ok: true, status: "aceita_por_voce" } };
  }
  if (op.status !== "aberta") {
    const msg = op.status === "preenchida" ? "Este passeio já foi preenchido por outro prestador." : "Este passeio não está mais disponível.";
    return { status: 409, body: { error: msg, status: op.status } };
  }

  if (resposta === "recusou") {
    await supabase.from("oportunidade_convites").update({ resposta: "recusou", respondidoEm: new Date().toISOString() }).eq("id", convite.id);
    const { data: todos } = await supabase.from("oportunidade_convites").select("resposta").eq("oportunidadeId", op.id);
    if ((todos || []).length > 0 && (todos || []).every((c: any) => c.resposta === "recusou")) {
      await alertarGestao(`Todos os prestadores convidados recusaram "${op.servico}" na reserva ${bookingRef(op.bookingId)} (${op.pousadaName}, ${br(op.checkIn)}).`, op.bookingId);
    }
    return { status: 200, body: { ok: true, status: "recusada" } };
  }

  const { data: booking } = await supabase.from("bookings").select("*").eq("id", op.bookingId).maybeSingle();
  if (!booking || booking.status === "cancelado") return { status: 409, body: { error: "A reserva deste passeio foi cancelada." } };
  // Vaga de guia já preenchida por fora (Gestão escalou à mão, por exemplo).
  const ehOProprioGuia = convite.prestadorTipo === "guia" && booking.guideId === convite.prestadorId;
  if (isServicoGuia(op.servico) && booking.guideId && !ehOProprioGuia) {
    await supabase.from("oportunidades").update({ status: "preenchida" }).eq("id", op.id);
    return { status: 409, body: { error: "Este passeio já foi preenchido por outro guia." } };
  }

  // Quem chega primeiro fica: só atualiza se ainda estiver "aberta".
  const agora = new Date().toISOString();
  const { data: ganhou } = await supabase.from("oportunidades")
    .update({ status: "preenchida", aceitaTipo: convite.prestadorTipo, aceitaId: convite.prestadorId, aceitaNome: convite.nome, aceitaEm: agora })
    .eq("id", op.id).eq("status", "aberta").select();
  if (!ganhou || ganhou.length === 0) return { status: 409, body: { error: "Este passeio acabou de ser preenchido por outro prestador." } };
  await supabase.from("oportunidade_convites").update({ resposta: "aceitou", respondidoEm: agora }).eq("id", convite.id);

  const pousada = await carregarPousada(op.pousadaId);
  if (convite.prestadorTipo === "guia") {
    // Vincula o guia na reserva (status, calendário e e-mail ao hóspede
    // "Seu guia está confirmado" saem do fluxo de sempre).
    await applyBookingStatusUpdate(op.bookingId, { status: "confirmado_guia", guideId: convite.prestadorId }, req, { skipGuideEmail: true });
  } else {
    await emailHospedePrestador(op, convite, booking as Booking);
  }
  await emailConfirmacaoPrestador(op, convite, booking as Booking, pousada);
  for (const email of await getPousadaGestorEmails(op.pousadaId).catch(() => [] as string[])) {
    await sendEmail({
      to: email,
      subject: `${convite.nome} vai atender a reserva ${bookingRef(op.bookingId)} (${op.servico})`,
      html: `<p style="margin:0 0 12px"><strong>${escapeHtml(convite.nome)}</strong> aceitou o serviço de <strong>${escapeHtml(op.servico.toLowerCase())}</strong> para ${escapeHtml(booking.customerName)} (${br(op.checkIn)} a ${br(op.checkOut)}).</p><p style="margin:0"><a href="${SITE_URL}/parceiro" style="color:#087A55">Ver na agenda</a></p>`,
    }).catch(() => {});
  }
  addNotification("admin", `${convite.nome} aceitou "${op.servico}" na reserva ${bookingRef(op.bookingId)} (${op.pousadaName}).`, "status_update", op.bookingId);
  return { status: 200, body: { ok: true, status: "aceita_por_voce" } };
}

// Detalhes que o prestador vê. Contato do hóspede só para quem ficou com o serviço.
async function detalhesParaConvite(op: any, convite: any) {
  const pousada = await carregarPousada(op.pousadaId);
  const aceitaPorVoce = op.status === "preenchida" && op.aceitaTipo === convite.prestadorTipo && op.aceitaId === convite.prestadorId;
  let hospede: any = null;
  if (aceitaPorVoce) {
    const { data: b } = await supabase.from("bookings").select("customerName, customerPhone, nationality").eq("id", op.bookingId).maybeSingle();
    if (b) hospede = { nome: b.customerName, telefone: b.customerPhone || null, whatsapp: waLink(b.customerPhone), pais: b.nationality || null };
  }
  return {
    id: op.id,
    servico: op.servico,
    status: aceitaPorVoce ? "aceita_por_voce" : op.status,
    checkIn: op.checkIn,
    checkOut: op.checkOut,
    pessoas: op.pessoas,
    experiencia: op.experiencia,
    idioma: op.idioma,
    reserva: bookingRef(op.bookingId),
    pousada: pousada ? { nome: pousada.name, local: pousada.location, imagem: pousada.images?.[0] || null } : { nome: op.pousadaName },
    distanciaKm: convite.distanciaKm ?? null,
    prestador: { nome: firstName(convite.nome) },
    resposta: convite.resposta || null,
    hospede,
  };
}

// Identidades de prestador da conta logada (guia e/ou colaborador).
async function prestadorDaConta(req: Request) {
  const user = await getPartnerUserFromRequest(req);
  if (!user) return null;
  const ids: { tipo: PrestadorTipo; id: string }[] = [];
  const md = user.app_metadata || {};
  if (md.partnerType === "guia" && md.partnerId) ids.push({ tipo: "guia", id: md.partnerId });
  const { data: colabs } = await supabase.from("colaboradores").select("id").eq("userId", user.id);
  for (const c of colabs || []) ids.push({ tipo: "colaborador", id: c.id });
  return ids;
}

// --------------------------------------------------------- cron diário
export async function processarOportunidadesCron() {
  const hoje = new Date().toISOString().slice(0, 10);
  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const em3dias = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const ha48h = new Date(Date.now() - 48 * 3600000).toISOString();
  const resultado = { expiradas: 0, alertas: 0, lembretes: 0 };

  const { error: expErr, data: exp } = await supabase.from("oportunidades").update({ status: "expirada" }).eq("status", "aberta").lt("checkIn", hoje).select("id");
  if (expErr) { if (!isMissing(expErr)) log.warn("Cron oportunidades:", expErr.message); return resultado; }
  resultado.expiradas = (exp || []).length;

  // Sem ninguém depois de 48 h, ou faltando 3 dias: a Gestão escala à mão.
  const { data: abertas } = await supabase.from("oportunidades").select("*").eq("status", "aberta").is("alertaGestaoEm", null);
  for (const op of abertas || []) {
    if (op.createdAt < ha48h || op.checkIn <= em3dias) {
      await alertarGestao(`Ainda sem prestador para "${op.servico}" na reserva ${bookingRef(op.bookingId)} (${op.pousadaName}, check-in ${br(op.checkIn)}).`, op.bookingId);
      await supabase.from("oportunidades").update({ alertaGestaoEm: new Date().toISOString() }).eq("id", op.id);
      resultado.alertas++;
    }
  }

  // Lembrete na véspera para quem aceitou.
  const { data: amanhaOps } = await supabase.from("oportunidades").select("*").eq("status", "preenchida").eq("checkIn", amanha).is("lembreteEm", null);
  for (const op of amanhaOps || []) {
    const { data: convite } = await supabase.from("oportunidade_convites").select("*").eq("oportunidadeId", op.id).eq("prestadorTipo", op.aceitaTipo).eq("prestadorId", op.aceitaId).maybeSingle();
    if (convite?.email) {
      await sendEmail({
        to: convite.email,
        subject: `Lembrete: amanhã tem ${op.servico.toLowerCase()} na ${op.pousadaName}`,
        html: `<p style="margin:0 0 12px">Olá, ${escapeHtml(firstName(convite.nome))}! Amanhã (${br(op.checkIn)}) começa o serviço da reserva <strong>${bookingRef(op.bookingId)}</strong> na ${escapeHtml(op.pousadaName)} — ${op.pessoas} pessoa(s).</p><p style="margin:0"><a href="${linkDoConvite(op.id, convite.token)}" style="color:#087A55;font-weight:600">Ver detalhes e contato do hóspede</a></p>`,
      }).catch(() => {});
      resultado.lembretes++;
    }
    await supabase.from("oportunidades").update({ lembreteEm: new Date().toISOString() }).eq("id", op.id);
  }
  return resultado;
}

// ------------------------------------------------------------- rotas
export function registerOportunidadesRoutes(app: Express) {

  // Reserva paga → abre uma oportunidade por serviço necessário.
  bookingHooks.paid.push(async (booking) => {
    const pousada = await carregarPousada(booking.pousadaId);
    if (!pousada) return;
    for (const servico of await servicosDaReserva(booking, pousada)) await abrirOportunidade(booking, servico);
  });

  // Reserva cancelada → fecha as oportunidades e avisa quem tinha aceitado.
  bookingHooks.cancelled.push(async (booking) => {
    const { data: ops } = await supabase.from("oportunidades").select("*").eq("bookingId", booking.id).in("status", ["aberta", "preenchida"]);
    for (const op of ops || []) {
      await supabase.from("oportunidades").update({ status: "cancelada" }).eq("id", op.id);
      if (op.status !== "preenchida") continue;
      const { data: c } = await supabase.from("oportunidade_convites").select("*").eq("oportunidadeId", op.id).eq("prestadorTipo", op.aceitaTipo).eq("prestadorId", op.aceitaId).maybeSingle();
      if (c?.email) {
        await sendEmail({ to: c.email, subject: `Reserva cancelada: ${op.servico} em ${br(op.checkIn)} · ${op.pousadaName}`, html: `<p style="margin:0">Olá, ${escapeHtml(firstName(c.nome))}. A reserva <strong>${bookingRef(op.bookingId)}</strong> foi cancelada, então o serviço de ${escapeHtml(op.servico.toLowerCase())} de ${br(op.checkIn)} a ${br(op.checkOut)} não vai mais acontecer. Essas datas voltam a ficar livres para você.</p>` }).catch(() => {});
      }
    }
  });

  // Guia desistiu pelo portal → a vaga reabre para os outros.
  bookingHooks.guideLeft.push(async (booking, _req, guideId: string) => {
    const { data: op } = await supabase.from("oportunidades").select("*").eq("bookingId", booking.id).eq("status", "preenchida").eq("aceitaTipo", "guia").eq("aceitaId", guideId).maybeSingle();
    const pousada = await carregarPousada(booking.pousadaId);
    if (!pousada) return;
    if (op) {
      await supabase.from("oportunidades").update({ status: "aberta", aceitaTipo: null, aceitaId: null, aceitaNome: null, aceitaEm: null, alertaGestaoEm: null }).eq("id", op.id);
      await supabase.from("oportunidade_convites").update({ resposta: "recusou", respondidoEm: new Date().toISOString() }).eq("oportunidadeId", op.id).eq("prestadorTipo", "guia").eq("prestadorId", guideId);
      await convidar({ ...op, status: "aberta" }, booking, pousada, [`guia:${guideId}`]);
    } else {
      // Guia tinha sido escalado à mão: abre a vaga agora.
      const servico = (await servicosDaReserva({ ...booking, guideId: undefined }, pousada)).find(isServicoGuia) || "Guia turístico";
      const nova = await abrirOportunidade({ ...booking, guideId: undefined } as Booking, servico);
      if (nova) await supabase.from("oportunidade_convites").update({ resposta: "recusou" }).eq("oportunidadeId", nova.id).eq("prestadorTipo", "guia").eq("prestadorId", guideId);
    }
  });

  // Página aberta pelo link do e-mail (o token do convite é a autorização).
  app.get("/api/oportunidades/:id", authLimiter, async (req, res) => {
    const token = String(req.query.t || "");
    if (!token) return res.status(400).json({ error: "Link incompleto." });
    const { data: convite, error } = await supabase.from("oportunidade_convites").select("*").eq("oportunidadeId", req.params.id).eq("token", token).maybeSingle();
    if (error && isMissing(error)) return res.status(503).json({ error: MIGRATION_MSG });
    if (!convite) return res.status(404).json({ error: "Convite não encontrado ou link inválido." });
    const { data: op } = await supabase.from("oportunidades").select("*").eq("id", req.params.id).maybeSingle();
    if (!op) return res.status(404).json({ error: "Oportunidade não encontrada." });
    res.json(await detalhesParaConvite(op, convite));
  });

  app.post("/api/oportunidades/:id/responder", authLimiter, async (req, res) => {
    const resposta = req.body.resposta === "aceitar" ? "aceitou" : req.body.resposta === "recusar" ? "recusou" : null;
    if (!resposta) return res.status(400).json({ error: "Resposta inválida." });
    let convite: any = null;
    if (req.body.t) {
      const { data } = await supabase.from("oportunidade_convites").select("*").eq("oportunidadeId", req.params.id).eq("token", String(req.body.t)).maybeSingle();
      convite = data;
    } else {
      // Pelo portal (logado): o convite tem que ser de uma das identidades da conta.
      const ids = await prestadorDaConta(req);
      if (!ids) return res.status(401).json({ error: "Entre na sua conta de parceiro." });
      const { data } = await supabase.from("oportunidade_convites").select("*").eq("oportunidadeId", req.params.id);
      convite = (data || []).find((c: any) => ids.some(i => i.tipo === c.prestadorTipo && i.id === c.prestadorId));
    }
    if (!convite) return res.status(404).json({ error: "Convite não encontrado." });
    const r = await responder(convite, resposta, req);
    if (r.status !== 200) return res.status(r.status).json(r.body);
    const { data: op } = await supabase.from("oportunidades").select("*").eq("id", req.params.id).maybeSingle();
    res.json({ ...r.body, oportunidade: op ? await detalhesParaConvite(op, { ...convite, resposta }) : null });
  });

  // Portal do guia / prestador: oportunidades abertas e serviços aceitos.
  app.get("/api/prestador/oportunidades", authLimiter, async (req, res) => {
    const ids = await prestadorDaConta(req);
    if (!ids) return res.status(401).json({ error: "Entre na sua conta de parceiro." });
    if (ids.length === 0) return res.json([]);
    const lista: any[] = [];
    for (const i of ids) {
      const { data: convites, error } = await supabase.from("oportunidade_convites").select("*").eq("prestadorTipo", i.tipo).eq("prestadorId", i.id).order("createdAt", { ascending: false }).limit(50);
      if (error) return isMissing(error) ? res.json([]) : res.status(500).json({ error: "Erro ao buscar oportunidades." });
      for (const c of convites || []) {
        const { data: op } = await supabase.from("oportunidades").select("*").eq("id", c.oportunidadeId).maybeSingle();
        if (!op) continue;
        const hoje = new Date().toISOString().slice(0, 10);
        if (op.checkOut < hoje) continue;
        lista.push({ ...(await detalhesParaConvite(op, c)), token: c.token });
      }
    }
    lista.sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1));
    res.json(lista);
  });

  // Gestão: chamar prestadores para uma reserva paga (qualquer serviço).
  app.post("/api/admin/bookings/:id/oportunidades", requireAdmin, async (req, res) => {
    const servico = String(req.body.servico || "").trim().slice(0, 60);
    if (!servico) return res.status(400).json({ error: "Escolha o serviço." });
    const { data: b } = await supabase.from("bookings").select("*").eq("id", req.params.id).maybeSingle();
    if (!b) return res.status(404).json({ error: "Reserva não encontrada." });
    if (!["pago", "confirmado_pousada", "confirmado_guia", "confirmado_total"].includes(b.status)) return res.status(400).json({ error: "Só reservas pagas chamam prestadores." });
    const op = await abrirOportunidade(b as Booking, servico);
    if (!op) return res.status(503).json({ error: MIGRATION_MSG });
    const { count } = await supabase.from("oportunidade_convites").select("id", { count: "exact", head: true }).eq("oportunidadeId", op.id);
    res.json({ ok: true, convidados: count || 0, status: op.status });
  });

  // Gestão: oportunidades de uma reserva (quem foi chamado, quem respondeu).
  app.get("/api/admin/bookings/:id/oportunidades", requireAdmin, async (req, res) => {
    const { data: ops, error } = await supabase.from("oportunidades").select("*").eq("bookingId", req.params.id).order("createdAt");
    if (error) return isMissing(error) ? res.json([]) : res.status(500).json({ error: "Erro ao buscar." });
    const out = [];
    for (const op of ops || []) {
      const { data: convites } = await supabase.from("oportunidade_convites").select("nome, prestadorTipo, resposta, enviadoEm, distanciaKm").eq("oportunidadeId", op.id);
      out.push({ ...op, convites: convites || [] });
    }
    res.json(out);
  });
}
