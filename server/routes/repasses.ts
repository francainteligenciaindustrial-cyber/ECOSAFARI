// Contrato de parceria, cancelamento do hóspede e repasse em custódia.
//
// Fluxo do dinheiro de cada reserva paga (bookings.repasseStatus):
//   custodia   → pago pelo hóspede; ainda pode ser reembolsado
//   garantido  → passou do prazo de 48 h: o hóspede não tem mais reembolso
//   liberado   → 1 dia depois do check-in: a parte da pousada pode ser paga
//   em_lote    → entrou num lote de repasse (um Pix por pousada)
//   pago       → lote pago, comprovante registrado
//   reembolsado / disputa / sem_repasse → nada a repassar (ou retido)
// A rotina diária (cron) move as etapas e monta os lotes. O pagamento em si
// passa por um "provedor" trocável: hoje "manual" (a Gestão faz o Pix e
// marca como pago); depois, Stripe Connect / Asaas sem mudar o resto.
import type { Express, Request } from "express";
import { randomUUID } from "crypto";
import PDFDocument from "pdfkit";
import type { Booking, Pousada } from "../../src/types.js";
import {
  calcularCancelamento, checkInMomento, repasseLiberaEm, reservaGarantidaEm, fimDoLancamento,
  COMISSAO_LANCAMENTO_PCT, RESUMO_CANCELAMENTO,
} from "../../src/lib/politica.js";
import { documentoValido, cpfValido, pixChaveValida, soDigitos, formatarDocumento, type PixTipo } from "../../src/lib/documentos.js";
import { renderContrato, hashContrato, CONTRATO_VERSAO } from "../contratoParceria.js";
import {
  addNotification,
  authLimiter,
  bookingHooks,
  bookingRef,
  clip,
  COMISSAO_PADRAO_PCT,
  commissionPctOf,
  EMAIL_REPLY_TO,
  escapeHtml,
  getPartnerUserFromRequest,
  getPousadaGestorEmails,
  log,
  mapPousadaRow,
  refundBookingAmount,
  requireAdmin,
  requirePartnerAccess,
  requireTourist,
  runBookingHooks,
  sendEmail,
  SITE_URL,
  stripe,
  stripeHooks,
  supabase,
  writeSkippingMissingColumns,
} from "../core.js";

const MIGRATION_MSG = "Contrato e repasses precisam da migração scripts/add-contrato-repasses.sql rodada no Supabase.";
const isMissing = (err: any) => !!err && /relation|does not exist|schema cache|column/i.test(String(err.message || ""));
const PAGOS = ["pago", "confirmado_pousada", "confirmado_guia", "confirmado_total"];
const r2 = (n: number) => Math.round(n * 100) / 100;
const brl = (n: number) => `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const br = (iso: string) => String(iso || "").slice(0, 10).split("-").reverse().join("/");
const agoraISO = () => new Date().toISOString();

// Parte da pousada numa reserva paga: total − comissão registrada nela.
export const repasseDaReserva = (b: Booking) => {
  const total = Number(b.totalPrice) || 0;
  const comissao = b.commissionAmount != null ? Number(b.commissionAmount) : r2((total * (Number(b.commissionPct) || 0)) / 100);
  return r2(total - comissao);
};

const atualizar = (id: string, row: Record<string, any>) =>
  writeSkippingMissingColumns(row, r => supabase.from("bookings").update(r).eq("id", id));

async function carregarPousada(id: string): Promise<Pousada | null> {
  const { data } = await supabase.from("pousadas").select("*").eq("id", id).maybeSingle();
  return data ? mapPousadaRow(data) : null;
}

// ----------------------------------------------------------- provedor de pagamento
// "manual": o lote fica pendente e a Gestão paga por Pix e marca como pago.
// Um provedor automático implementaria pagar() e devolveria o comprovante.
interface ProvedorRepasse { nome: string; automatico: boolean; pagar?: (lote: any) => Promise<{ ok: boolean; comprovante?: string; erro?: string }> }
const PROVEDOR: ProvedorRepasse = { nome: process.env.REPASSE_PROVEDOR || "manual", automatico: false };

// =================================================================== CONTRATO
async function contratoAtivo(pousadaId: string) {
  const { data, error } = await supabase.from("contratos_parceria").select("*").eq("pousadaId", pousadaId).eq("status", "ativo").order("aceitoEm", { ascending: false }).limit(1).maybeSingle();
  return { contrato: data, error };
}

function dadosDoBody(body: any, pousada: Pousada, email: string, dataISO: string, comLancamento: boolean) {
  return {
    pousadaNome: pousada.name,
    razaoSocial: clip(body.razaoSocial, 160),
    documento: soDigitos(body.documento),
    endereco: clip(body.endereco, 240) || pousada.location || "",
    responsavelNome: clip(body.responsavelNome, 120),
    responsavelCpf: soDigitos(body.responsavelCpf),
    responsavelCargo: clip(body.responsavelCargo, 80) || "Responsável legal",
    responsavelEmail: email,
    pixTipo: (["cpf", "cnpj", "email", "telefone", "aleatoria"].includes(body.pixTipo) ? body.pixTipo : "cnpj") as PixTipo,
    pixChave: clip(body.pixChave, 120),
    comissaoPct: typeof pousada.commissionPct === "number" ? pousada.commissionPct : COMISSAO_PADRAO_PCT,
    comLancamento,
    dataISO,
  };
}

function pdfDoContrato(texto: string, registro: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const chunks: Buffer[] = [];
    doc.on("data", c => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const [titulo, ...resto] = texto.split("\n");
    doc.fillColor("#0B1412").fontSize(14).text(titulo, { align: "left" });
    doc.moveDown(0.6);
    for (const linha of resto) {
      const ehTitulo = /^(CLÁUSULA|PARTES)/.test(linha);
      doc.fontSize(ehTitulo ? 10.5 : 9.5).fillColor(ehTitulo ? "#0B1412" : "#222").text(linha || " ", { align: "justify" });
      if (ehTitulo) doc.moveDown(0.2);
    }
    doc.moveDown(1.2);
    doc.fontSize(10).fillColor("#0B1412").text("REGISTRO DO ACEITE ELETRÔNICO");
    doc.fontSize(8.5).fillColor("#444");
    for (const r of registro) doc.text(r);
    doc.end();
  });
}

// ===================================================================== ROTAS
export function registerRepassesRoutes(app: Express) {

  // ---------------- ganchos de reserva ----------------
  // Pagou: a parte da pousada entra em custódia.
  bookingHooks.paid.push(async (b) => {
    await atualizar(b.id, { repasseStatus: "custodia", repasseValor: repasseDaReserva(b) });
  });

  // Cancelada pela pousada ou pela Gestão (o cancelamento do hóspede tem
  // rota própria): o hóspede é reembolsado integralmente (contrato, 5.1) e
  // a pousada não recebe.
  bookingHooks.cancelled.push(async (b) => {
    if ((b as any).canceladoPor === "turista") return;
    const { data: atual } = await supabase.from("bookings").select("*").eq("id", b.id).maybeSingle();
    if (!atual || !atual.repasseStatus || ["pago", "em_lote", "reembolsado", "sem_repasse"].includes(atual.repasseStatus)) {
      if (atual?.repasseStatus === "pago" || atual?.repasseStatus === "em_lote") {
        addNotification("admin", `Reserva ${bookingRef(b.id)} (${b.pousadaName}) foi cancelada depois de entrar no repasse — confira o lote e o reembolso do hóspede.`, "status_update", b.id);
      }
      return;
    }
    let reembolsou = false;
    if (atual.stripePaymentIntentId && !atual.refundedAt && stripe) {
      try {
        await refundBookingAmount(atual.stripePaymentIntentId, Number(atual.totalPrice), b.id);
        reembolsou = true;
      } catch (err: any) {
        log.error("Reembolso integral falhou:", err.message);
      }
    }
    await atualizar(b.id, {
      repasseStatus: "sem_repasse", repasseValor: 0, canceladoEm: agoraISO(), canceladoPor: atual.canceladoPor || "parceiro_ou_gestao",
      ...(reembolsou ? { refundedAt: agoraISO(), refundedAmount: Number(atual.totalPrice), reembolsoValor: Number(atual.totalPrice) } : {}),
    });
    if (!reembolsou) addNotification("admin", `Reserva ${bookingRef(b.id)} (${b.pousadaName}) cancelada pela pousada/Gestão: reembolse o hóspede integralmente (${brl(atual.totalPrice)}) — não havia pagamento online registrado ou o reembolso falhou.`, "status_update", b.id);
  });

  // Contestação de cartão (chargeback): segura o repasse e avisa.
  stripeHooks.push(async (event: any) => {
    if (event.type !== "charge.dispute.created") return;
    const dispute = event.data.object;
    const pi = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
    if (!pi) return;
    const { data: bs } = await supabase.from("bookings").select("*").eq("stripePaymentIntentId", pi);
    for (const b of bs || []) {
      const jaPago = b.repasseStatus === "pago";
      if (!jaPago) await atualizar(b.id, { repasseStatus: "disputa" });
      addNotification("admin", `CONTESTAÇÃO de cartão na reserva ${bookingRef(b.id)} (${b.pousadaName}, ${brl(b.totalPrice)}). ${jaPago ? "O repasse já foi pago: desconte do próximo (contrato, 3.4)." : "Repasse segurado até a solução."}`, "payment_received", b.id);
    }
  });

  // ---------------- contrato (portal da pousada) ----------------
  app.get("/api/pousadas/:id/contrato", requirePartnerAccess("pousada"), async (req, res) => {
    const pousada = await carregarPousada(req.params.id);
    if (!pousada) return res.status(404).json({ error: "Pousada não encontrada." });
    const { contrato, error } = await contratoAtivo(pousada.id);
    if (error && isMissing(error)) return res.status(503).json({ error: MIGRATION_MSG });
    if (contrato) {
      return res.json({
        assinado: {
          id: contrato.id, versao: contrato.versao, aceitoEm: contrato.aceitoEm, comissaoPct: contrato.comissaoPct,
          comissaoLancamentoAte: pousada.comissaoLancamentoAte, razaoSocial: contrato.razaoSocial,
          documento: formatarDocumento(contrato.documento), responsavelNome: contrato.responsavelNome,
          pixTipo: contrato.pixTipo, pixChave: contrato.pixChave, hash: contrato.textoHash,
        },
        comissaoAtual: commissionPctOf(pousada),
      });
    }
    const { count } = await supabase.from("contratos_parceria").select("id", { count: "exact", head: true }).eq("pousadaId", pousada.id);
    res.json({
      assinado: null,
      comissaoPct: typeof pousada.commissionPct === "number" ? pousada.commissionPct : COMISSAO_PADRAO_PCT,
      lancamento: !count ? { pct: COMISSAO_LANCAMENTO_PCT, ate: fimDoLancamento(agoraISO()) } : null,
      versao: CONTRATO_VERSAO,
    });
  });

  // Texto do contrato com os dados digitados (pré-visualização antes de assinar).
  app.post("/api/pousadas/:id/contrato/previa", requirePartnerAccess("pousada"), async (req, res) => {
    const pousada = await carregarPousada(req.params.id);
    if (!pousada) return res.status(404).json({ error: "Pousada não encontrada." });
    const user = res.locals.actorUser as { email?: string };
    const { count } = await supabase.from("contratos_parceria").select("id", { count: "exact", head: true }).eq("pousadaId", pousada.id);
    res.json({ texto: renderContrato(dadosDoBody(req.body, pousada, user?.email || "", agoraISO(), !count)) });
  });

  app.post("/api/pousadas/:id/contrato/assinar", requirePartnerAccess("pousada"), async (req, res) => {
    const pousada = await carregarPousada(req.params.id);
    if (!pousada) return res.status(404).json({ error: "Pousada não encontrada." });
    const user = res.locals.actorUser as { id: string; email?: string };
    if (req.body.aceite !== true) return res.status(400).json({ error: "Marque que leu e aceita o contrato." });
    const { count, error: cErr } = await supabase.from("contratos_parceria").select("id", { count: "exact", head: true }).eq("pousadaId", pousada.id);
    if (cErr && isMissing(cErr)) return res.status(503).json({ error: MIGRATION_MSG });
    const primeiro = !count;
    const agora = agoraISO();
    const d = dadosDoBody(req.body, pousada, user.email || "", agora, primeiro);

    if (!d.razaoSocial) return res.status(400).json({ error: "Informe a razão social (ou o nome completo, se pessoa física)." });
    if (!documentoValido(d.documento)) return res.status(400).json({ error: "CNPJ ou CPF da pousada inválido." });
    if (!d.responsavelNome || !cpfValido(d.responsavelCpf)) return res.status(400).json({ error: "Informe nome e CPF válidos de quem assina." });
    if (!pixChaveValida(d.pixTipo, d.pixChave)) return res.status(400).json({ error: "Chave Pix inválida para o tipo escolhido." });
    // Pix de CPF/CNPJ precisa ser do mesmo titular do contrato (evita desvio de repasse).
    if ((d.pixTipo === "cpf" || d.pixTipo === "cnpj") && soDigitos(d.pixChave) !== d.documento) {
      return res.status(400).json({ error: "A chave Pix de CPF/CNPJ precisa ser do mesmo documento da pousada no contrato." });
    }

    const texto = renderContrato(d);
    const hash = hashContrato(texto);
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    const row = {
      id: `ct_${randomUUID()}`, pousadaId: pousada.id, versao: CONTRATO_VERSAO, status: "ativo",
      comissaoPct: d.comissaoPct, comissaoLancamentoPct: primeiro ? COMISSAO_LANCAMENTO_PCT : null,
      razaoSocial: d.razaoSocial, documento: d.documento, endereco: d.endereco,
      responsavelNome: d.responsavelNome, responsavelCpf: d.responsavelCpf, responsavelCargo: d.responsavelCargo, responsavelEmail: d.responsavelEmail,
      pixTipo: d.pixTipo, pixChave: d.pixChave,
      texto, textoHash: hash, userId: user.id, ip, userAgent: clip(req.headers["user-agent"], 300), aceitoEm: agora,
    };
    await supabase.from("contratos_parceria").update({ status: "substituido" }).eq("pousadaId", pousada.id).eq("status", "ativo");
    const { error } = await supabase.from("contratos_parceria").insert(row);
    if (error) return isMissing(error) ? res.status(503).json({ error: MIGRATION_MSG }) : res.status(500).json({ error: "Não foi possível registrar o contrato." });
    await writeSkippingMissingColumns(
      { contratoId: row.id, contratoAceitoEm: agora, ...(primeiro ? { comissaoLancamentoAte: fimDoLancamento(agora) } : {}) },
      r => supabase.from("pousadas").update(r).eq("id", pousada.id)
    );

    const registro = [
      `Assinado por: ${d.responsavelNome} — CPF ${formatarDocumento(d.responsavelCpf)} — ${d.responsavelCargo}`,
      `E-mail da conta: ${d.responsavelEmail}`,
      `Data e hora (UTC): ${agora}`,
      `IP: ${ip || "não informado"}`,
      `Versão: ${CONTRATO_VERSAO} — Código de integridade (SHA-256): ${hash}`,
    ];
    const pdf = await pdfDoContrato(texto, registro).catch(() => null);
    const anexos = pdf ? [{ filename: `contrato-ipantanal-${pousada.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`, content: pdf.toString("base64") }] : undefined;
    for (const to of Array.from(new Set([d.responsavelEmail, EMAIL_REPLY_TO].filter(Boolean)))) {
      await sendEmail({
        to,
        subject: `Contrato de parceria assinado — ${pousada.name}`,
        html: `<h1 style="margin:0 0 12px;font-size:20px;color:#0B1412">Contrato assinado ✅</h1>
          <p style="margin:0 0 12px">${escapeHtml(d.responsavelNome)} assinou o Contrato de Parceria do Ipantanal em nome de <strong>${escapeHtml(d.razaoSocial)}</strong> (${escapeHtml(pousada.name)}).</p>
          <p style="margin:0 0 12px">Comissão: <strong>${primeiro ? `${COMISSAO_LANCAMENTO_PCT}% nos primeiros meses, depois ${d.comissaoPct}%` : `${d.comissaoPct}%`}</strong>. Repasse por Pix 1 dia depois do check-in de cada reserva.</p>
          <p style="margin:0;font-size:13px;color:#4F5D58">O contrato completo está em anexo e no portal do parceiro. Código de integridade: ${hash.slice(0, 16)}…</p>`,
        attachments: anexos,
      }).catch(() => {});
    }
    addNotification("admin", `${pousada.name} assinou o contrato de parceria (${primeiro ? `lançamento ${COMISSAO_LANCAMENTO_PCT}%` : `${d.comissaoPct}%`}).`, "status_update");
    res.json({ ok: true });
  });

  app.get("/api/pousadas/:id/contrato/pdf", requirePartnerAccess("pousada"), async (req, res) => {
    const { contrato } = await contratoAtivo(req.params.id);
    if (!contrato) return res.status(404).json({ error: "Contrato não encontrado." });
    const pdf = await pdfDoContrato(contrato.texto, [
      `Assinado por: ${contrato.responsavelNome} — CPF ${formatarDocumento(contrato.responsavelCpf)} — ${contrato.responsavelCargo}`,
      `E-mail da conta: ${contrato.responsavelEmail}`,
      `Data e hora (UTC): ${contrato.aceitoEm}`,
      `IP: ${contrato.ip || "não informado"}`,
      `Versão: ${contrato.versao} — Código de integridade (SHA-256): ${contrato.textoHash}`,
    ]);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="contrato-ipantanal.pdf"`);
    res.send(pdf);
  });

  // Extrato da pousada: reservas pagas e o que ela recebe de cada uma.
  app.get("/api/pousadas/:id/extrato", requirePartnerAccess("pousada"), async (req, res) => {
    const { data, error } = await supabase.from("bookings").select("*").eq("pousadaId", req.params.id).not("repasseStatus", "is", null).order("checkIn", { ascending: false }).limit(300);
    if (error) return isMissing(error) ? res.json({ reservas: [], lotes: [] }) : res.status(500).json({ error: "Erro ao buscar o extrato." });
    const { data: lotes } = await supabase.from("repasse_lotes").select("*").eq("pousadaId", req.params.id).order("criadoEm", { ascending: false }).limit(60);
    res.json({
      reservas: (data || []).map((b: any) => ({
        id: b.id, ref: bookingRef(b.id), hospede: String(b.customerName || "").split(" ")[0], checkIn: b.checkIn, checkOut: b.checkOut,
        total: Number(b.totalPrice), comissao: Number(b.commissionAmount ?? 0), comissaoPct: b.commissionPct, repasse: Number(b.repasseValor ?? 0),
        status: b.repasseStatus, previsao: b.repasseStatus === "custodia" || b.repasseStatus === "garantido" ? new Date(repasseLiberaEm(b.checkIn)).toISOString().slice(0, 10) : null,
        pagoEm: b.repassePagoEm, cancelado: b.status === "cancelado", taxaCancelamento: b.cancelamentoTaxa,
      })),
      lotes: (lotes || []).map((l: any) => ({ id: l.id, valor: Number(l.valor), status: l.status, criadoEm: l.criadoEm, pagoEm: l.pagoEm, comprovanteUrl: l.comprovanteUrl, reservas: (l.bookingIds || []).length })),
    });
  });

  // ---------------- cancelamento pelo hóspede ----------------
  async function reservaDoTurista(req: Request, res: any) {
    const user = res.locals.touristUser as { email?: string };
    const { data: b } = await supabase.from("bookings").select("*").eq("id", req.params.id).maybeSingle();
    if (!b || !user.email || b.customerEmail !== user.email) { res.status(404).json({ error: "Reserva não encontrada." }); return null; }
    return b as Booking & Record<string, any>;
  }

  app.get("/api/turista/bookings/:id/cancelamento", authLimiter, requireTourist, async (req, res) => {
    const b = await reservaDoTurista(req, res);
    if (!b) return;
    if (b.status === "cancelado") return res.status(409).json({ error: "Esta reserva já está cancelada." });
    if (Date.now() >= checkInMomento(b.checkIn)) return res.status(409).json({ error: "A estadia já começou — fale com a equipe pelo WhatsApp." });
    if (!PAGOS.includes(b.status)) return res.json({ pago: false, reembolso: 0, retido: 0, rotulo: "Reserva ainda não paga" });
    res.json({ pago: true, ...calcularCancelamento(Number(b.totalPrice), b.checkIn), total: Number(b.totalPrice), politica: RESUMO_CANCELAMENTO });
  });

  app.post("/api/turista/bookings/:id/cancelar", authLimiter, requireTourist, async (req, res) => {
    const b = await reservaDoTurista(req, res);
    if (!b) return;
    if (b.status === "cancelado") return res.status(409).json({ error: "Esta reserva já está cancelada." });
    if (Date.now() >= checkInMomento(b.checkIn)) return res.status(409).json({ error: "A estadia já começou — fale com a equipe pelo WhatsApp." });
    const agora = agoraISO();

    if (!PAGOS.includes(b.status)) {
      await supabase.from("bookings").update({ status: "cancelado" }).eq("id", b.id);
      await runBookingHooks("cancelled", { ...b, status: "cancelado", canceladoPor: "turista" } as any, req);
      return res.json({ ok: true, reembolso: 0 });
    }

    const c = calcularCancelamento(Number(b.totalPrice), b.checkIn);
    let reembolsado = false;
    let reembolsoPendente = false;
    if (c.reembolso > 0) {
      if (b.stripePaymentIntentId && stripe && !b.refundedAt) {
        try {
          await refundBookingAmount(b.stripePaymentIntentId, c.reembolso, b.id);
          reembolsado = true;
        } catch (err: any) {
          log.error("Reembolso do cancelamento falhou:", err.message);
          reembolsoPendente = true;
        }
      } else reembolsoPendente = true;
    }

    // Sem reembolso: a pousada recebe o repasse normal da reserva.
    // Com reembolso: recebe a parte dela do valor retido (contrato, 4.2).
    const repasse = c.reembolso === 0
      ? { repasseStatus: b.repasseStatus === "custodia" ? "garantido" : b.repasseStatus || "garantido", repasseValor: repasseDaReserva(b) }
      : { repasseStatus: c.retidoPousada > 0 ? "liberado" : "reembolsado", repasseValor: c.retidoPousada, repasseLiberadoEm: c.retidoPousada > 0 ? agora : null };
    await supabase.from("bookings").update({ status: "cancelado" }).eq("id", b.id);
    await atualizar(b.id, {
      canceladoPor: "turista", canceladoEm: agora, cancelamentoTaxa: c.retido, reembolsoValor: c.reembolso,
      ...(reembolsado ? { refundedAt: agora, refundedAmount: c.reembolso } : {}),
      ...repasse,
    });
    await runBookingHooks("cancelled", { ...b, status: "cancelado", canceladoPor: "turista" } as any, req);

    if (reembolsoPendente) {
      addNotification("admin", `Reembolso MANUAL pendente: ${b.customerName} cancelou a reserva ${bookingRef(b.id)} (${b.pousadaName}). Devolver ${brl(c.reembolso)}.`, "status_update", b.id);
      if (EMAIL_REPLY_TO) await sendEmail({ to: EMAIL_REPLY_TO, subject: `Reembolso manual pendente — reserva ${bookingRef(b.id)}`, html: `<p style="margin:0">${escapeHtml(b.customerName)} (${escapeHtml(b.customerEmail)}) cancelou a reserva ${bookingRef(b.id)} na ${escapeHtml(b.pousadaName)}. Devolver <strong>${brl(c.reembolso)}</strong> — a reserva não tinha pagamento online registrado ou o reembolso automático falhou.</p>` }).catch(() => {});
    }
    await sendEmail({
      to: b.customerEmail,
      subject: `Reserva ${bookingRef(b.id)} cancelada — ${b.pousadaName}`,
      html: `<h1 style="margin:0 0 12px;font-size:20px;color:#0B1412">Sua reserva foi cancelada</h1>
        <p style="margin:0 0 12px">Reserva <strong>${bookingRef(b.id)}</strong> na ${escapeHtml(b.pousadaName)} (${br(b.checkIn)} a ${br(b.checkOut)}).</p>
        <div style="margin:0 0 16px;padding:14px 16px;background:#F4F6F5;border-radius:14px;font-size:14px;line-height:1.7">
          Valor pago: ${brl(b.totalPrice)}<br/>Taxa de cancelamento (${c.rotulo.toLowerCase()}): ${brl(c.retido)}<br/><strong>Reembolso: ${brl(c.reembolso)}</strong>
        </div>
        ${c.reembolso > 0 ? `<p style="margin:0;font-size:14px">${reembolsado ? "O reembolso já foi solicitado ao meio de pagamento; o prazo para aparecer depende do banco ou cartão (geralmente de 5 a 10 dias úteis)." : "Nossa equipe vai processar o reembolso e avisar você."}</p>` : ""}`,
    }).catch(() => {});
    for (const to of await getPousadaGestorEmails(b.pousadaId).catch(() => [] as string[])) {
      await sendEmail({ to, subject: `Reserva cancelada pelo hóspede — ${bookingRef(b.id)}`, html: `<p style="margin:0 0 10px">${escapeHtml(b.customerName)} cancelou a reserva de ${br(b.checkIn)} a ${br(b.checkOut)}. As datas voltaram a ficar disponíveis.</p><p style="margin:0">${c.reembolso === 0 ? `Sem reembolso ao hóspede: você recebe o repasse normal (${brl(repasseDaReserva(b))}).` : `Você recebe ${brl(c.retidoPousada)} da taxa de cancelamento no próximo repasse.`}</p>` }).catch(() => {});
    }
    res.json({ ok: true, reembolso: c.reembolso, reembolsoAutomatico: reembolsado, taxa: c.retido });
  });

  // ---------------- Gestão ----------------
  app.get("/api/admin/repasses", requireAdmin, async (req, res) => {
    const { data: bs, error } = await supabase.from("bookings").select("id, pousadaId, pousadaName, customerName, checkIn, checkOut, totalPrice, commissionAmount, repasseStatus, repasseValor, repasseLoteId").not("repasseStatus", "is", null);
    if (error) return isMissing(error) ? res.status(503).json({ error: MIGRATION_MSG }) : res.status(500).json({ error: "Erro ao buscar." });
    const soma = (st: string) => r2((bs || []).filter((b: any) => b.repasseStatus === st).reduce((a: number, b: any) => a + Number(b.repasseValor || 0), 0));
    const { data: lotes } = await supabase.from("repasse_lotes").select("*").order("criadoEm", { ascending: false }).limit(100);
    const { data: pousadas } = await supabase.from("pousadas").select("id, name");
    const nome = new Map((pousadas || []).map((p: any) => [p.id, p.name]));
    const inicioMes = new Date().toISOString().slice(0, 7);
    res.json({
      provedor: PROVEDOR.nome,
      resumo: {
        custodia: soma("custodia"), garantido: soma("garantido"), liberado: soma("liberado"), emLote: soma("em_lote"),
        disputa: soma("disputa"),
        pagoMes: r2((lotes || []).filter((l: any) => l.status === "pago" && String(l.pagoEm || "").startsWith(inicioMes)).reduce((a: number, l: any) => a + Number(l.valor), 0)),
      },
      lotes: (lotes || []).map((l: any) => ({
        ...l, pousadaName: nome.get(l.pousadaId) || l.pousadaId,
        reservas: (bs || []).filter((b: any) => (l.bookingIds || []).includes(b.id)).map((b: any) => ({ ref: bookingRef(b.id), hospede: b.customerName, checkIn: b.checkIn, repasse: Number(b.repasseValor || 0) })),
      })),
    });
  });

  app.post("/api/admin/repasses/processar", requireAdmin, async (_req, res) => {
    res.json(await processarRepasses());
  });

  app.post("/api/admin/repasses/lotes/:id/pagar", requireAdmin, async (req, res) => {
    const { data: lote } = await supabase.from("repasse_lotes").select("*").eq("id", req.params.id).maybeSingle();
    if (!lote) return res.status(404).json({ error: "Lote não encontrado." });
    if (lote.status === "pago") return res.status(409).json({ error: "Este lote já foi pago." });
    const agora = agoraISO();
    const admin = res.locals.adminUser as { email?: string } | undefined;
    const { data: marcado } = await supabase.from("repasse_lotes")
      .update({ status: "pago", pagoEm: agora, pagoPor: admin?.email || "admin", comprovanteUrl: clip(req.body.comprovanteUrl, 500) || null, observacao: clip(req.body.observacao, 500) || null })
      .eq("id", lote.id).eq("status", "pendente").select();
    if (!marcado || marcado.length === 0) return res.status(409).json({ error: "Este lote já foi pago." });
    await supabase.from("bookings").update({ repasseStatus: "pago", repassePagoEm: agora }).in("id", lote.bookingIds || []);
    await avisarPousadaRepasse({ ...lote, pagoEm: agora, comprovanteUrl: req.body.comprovanteUrl || null });
    res.json({ ok: true });
  });

  app.post("/api/admin/pousadas/:id/repasse-bloqueio", requireAdmin, async (req, res) => {
    const { error } = await writeSkippingMissingColumns({ repasseBloqueado: req.body.bloqueado === true }, r => supabase.from("pousadas").update(r).eq("id", req.params.id));
    if (error) return res.status(500).json({ error: "Erro ao salvar." });
    res.json({ ok: true });
  });

  app.get("/api/admin/contratos", requireAdmin, async (_req, res) => {
    const { data, error } = await supabase.from("contratos_parceria").select("id, pousadaId, versao, status, comissaoPct, comissaoLancamentoPct, razaoSocial, documento, responsavelNome, responsavelEmail, pixTipo, pixChave, aceitoEm, textoHash").order("aceitoEm", { ascending: false });
    if (error) return isMissing(error) ? res.json([]) : res.status(500).json({ error: "Erro ao buscar." });
    res.json(data || []);
  });
}

async function avisarPousadaRepasse(lote: any) {
  const { data: bs } = await supabase.from("bookings").select("id, customerName, checkIn, checkOut, totalPrice, commissionAmount, repasseValor, cancelamentoTaxa, status").in("id", lote.bookingIds || []);
  const linhas = (bs || []).map((b: any) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #E6ECE9">${bookingRef(b.id)}</td><td style="padding:6px 8px;border-bottom:1px solid #E6ECE9">${escapeHtml(String(b.customerName || "").split(" ")[0])}</td><td style="padding:6px 8px;border-bottom:1px solid #E6ECE9">${br(b.checkIn)}</td><td style="padding:6px 8px;border-bottom:1px solid #E6ECE9;text-align:right">${brl(b.repasseValor)}${b.status === "cancelado" ? " (cancel.)" : ""}</td></tr>`).join("");
  for (const to of await getPousadaGestorEmails(lote.pousadaId).catch(() => [] as string[])) {
    await sendEmail({
      to,
      subject: `Repasse enviado: ${brl(lote.valor)} — Ipantanal`,
      html: `<h1 style="margin:0 0 12px;font-size:20px;color:#0B1412">Repasse enviado 💸</h1>
        <p style="margin:0 0 12px">Enviamos <strong>${brl(lote.valor)}</strong> por Pix para a chave ${escapeHtml(lote.pixChave || "cadastrada no contrato")}, referente a ${(lote.bookingIds || []).length} reserva(s):</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 14px"><tr style="text-align:left;color:#4F5D58"><th style="padding:6px 8px">Reserva</th><th style="padding:6px 8px">Hóspede</th><th style="padding:6px 8px">Check-in</th><th style="padding:6px 8px;text-align:right">Você recebe</th></tr>${linhas}</table>
        ${lote.comprovanteUrl ? `<p style="margin:0 0 12px"><a href="${escapeHtml(lote.comprovanteUrl)}" style="color:#087A55">Ver comprovante</a></p>` : ""}
        <p style="margin:0"><a href="${SITE_URL}/parceiro" style="color:#087A55">Ver o extrato completo no portal</a></p>`,
    }).catch(() => {});
  }
}

// ============================================================ ROTINA DIÁRIA
export async function processarRepasses() {
  const agora = Date.now();
  const hoje = new Date().toISOString().slice(0, 10);
  const r = { custodiaNovas: 0, garantidas: 0, liberadas: 0, lotes: 0, valorLotes: 0, pagosAutomaticamente: 0 };

  // Reservas pagas antes desta funcionalidade, com check-in futuro, entram em custódia.
  const { data: semStatus, error } = await supabase.from("bookings").select("*").in("status", PAGOS).is("repasseStatus", null).gte("checkIn", hoje);
  if (error) { if (!isMissing(error)) log.warn("Repasses:", error.message); return r; }
  for (const b of semStatus || []) { await atualizar(b.id, { repasseStatus: "custodia", repasseValor: repasseDaReserva(b as Booking) }); r.custodiaNovas++; }

  const { data: custodia } = await supabase.from("bookings").select("id, checkIn, status").eq("repasseStatus", "custodia");
  for (const b of custodia || []) {
    if (b.status === "cancelado") continue;
    if (agora >= reservaGarantidaEm(b.checkIn)) { await atualizar(b.id, { repasseStatus: "garantido" }); r.garantidas++; }
  }
  const { data: garantidos } = await supabase.from("bookings").select("id, checkIn").eq("repasseStatus", "garantido");
  for (const b of garantidos || []) {
    if (agora >= repasseLiberaEm(b.checkIn)) { await atualizar(b.id, { repasseStatus: "liberado", repasseLiberadoEm: agoraISO() }); r.liberadas++; }
  }

  // Lotes: um por pousada com tudo que está liberado.
  const { data: liberados } = await supabase.from("bookings").select("id, pousadaId, repasseValor").eq("repasseStatus", "liberado").is("repasseLoteId", null);
  const porPousada = new Map<string, { ids: string[]; valor: number }>();
  for (const b of liberados || []) {
    if (!(Number(b.repasseValor) > 0)) { await atualizar(b.id, { repasseStatus: "pago", repassePagoEm: agoraISO() }); continue; }
    const g = porPousada.get(b.pousadaId) || { ids: [], valor: 0 };
    g.ids.push(b.id);
    g.valor = r2(g.valor + Number(b.repasseValor));
    porPousada.set(b.pousadaId, g);
  }
  const avisos: string[] = [];
  for (const [pousadaId, g] of porPousada) {
    const pousada = await carregarPousada(pousadaId);
    if (!pousada || pousada.repasseBloqueado) continue;
    const { contrato } = await contratoAtivo(pousadaId);
    if (!contrato) { avisos.push(`${pousada.name}: ${brl(g.valor)} liberado, mas sem contrato/Pix cadastrado.`); continue; }
    const lote = { id: `rl_${randomUUID()}`, pousadaId, valor: g.valor, bookingIds: g.ids, status: "pendente", pixTipo: contrato.pixTipo, pixChave: contrato.pixChave, titular: contrato.razaoSocial, documento: contrato.documento, provedor: PROVEDOR.nome, criadoEm: agoraISO() };
    const { error: lErr } = await supabase.from("repasse_lotes").insert(lote);
    if (lErr) { log.warn("Erro ao criar lote de repasse:", lErr.message); continue; }
    await supabase.from("bookings").update({ repasseStatus: "em_lote", repasseLoteId: lote.id }).in("id", g.ids);
    r.lotes++;
    r.valorLotes = r2(r.valorLotes + g.valor);
    avisos.push(`${pousada.name}: ${brl(g.valor)} (${g.ids.length} reserva(s)) — Pix ${contrato.pixTipo} ${contrato.pixChave}`);
    if (PROVEDOR.automatico && PROVEDOR.pagar) {
      const p: { ok: boolean; comprovante?: string; erro?: string } = await PROVEDOR.pagar(lote).catch(e => ({ ok: false, erro: e.message }));
      if (p.ok) {
        await supabase.from("repasse_lotes").update({ status: "pago", pagoEm: agoraISO(), comprovanteUrl: p.comprovante || null }).eq("id", lote.id);
        await supabase.from("bookings").update({ repasseStatus: "pago", repassePagoEm: agoraISO() }).in("id", g.ids);
        await avisarPousadaRepasse({ ...lote, comprovanteUrl: p.comprovante });
        r.pagosAutomaticamente++;
      }
    }
  }
  if (avisos.length) {
    addNotification("admin", `Repasses do dia: ${r.lotes} lote(s), ${brl(r.valorLotes)}. Pague e marque como pago em Gestão → Repasses.`, "payment_received");
    if (EMAIL_REPLY_TO) {
      await sendEmail({ to: EMAIL_REPLY_TO, subject: `Repasses a pagar hoje: ${brl(r.valorLotes)}`, html: `<p style="margin:0 0 10px">Lotes de repasse prontos (pague por Pix e marque como pago em <a href="${SITE_URL}/admin" style="color:#087A55">Gestão → Repasses</a>):</p><ul style="margin:0;padding-left:18px">${avisos.map(a => `<li style="margin:0 0 4px">${escapeHtml(a)}</li>`).join("")}</ul>` }).catch(() => {});
    }
  }
  return r;
}
