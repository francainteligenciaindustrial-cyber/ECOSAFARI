// E-mails que não pertencem a um fluxo específico: descadastro das
// novidades, alerta de senha alterada e os comunicados (novidades e
// notícias) enviados pela Gestão.
import type { Express } from "express";
import {
  supabase,
  supabaseAdminAuth,
  resend,
  requireAdmin,
  requireAnyAuth,
  publicFormLimiter,
  sendEmail,
  buildEmailPayload,
  escapeHtml,
  clip,
  log,
  SITE_URL,
  EMAIL_FROM,
  EMAIL_TOKEN_SECRET,
  logAdminAction,
} from "../core.js";
import { verifyUnsubscribeToken } from "../emailTokens.js";

type Audience = "turistas" | "parceiros";

// Texto simples do comunicado → HTML: parágrafos por linha em branco,
// quebra de linha simples vira <br>, links viram clicáveis.
export function comunicadoToHtml(title: string, body: string, cta?: { label: string; url: string }): string {
  const linkify = (s: string) => s.replace(/https?:\/\/[^\s<]+/g, url => `<a href="${url}" style="color:#087A55">${url}</a>`);
  const paragraphs = escapeHtml(body.trim())
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 14px">${linkify(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const button = cta && /^https:\/\//.test(cta.url)
    ? `<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#0B1412;color:#FFFFFF;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">${escapeHtml(cta.label)}</a></p>`
    : "";
  return `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0B1412">${escapeHtml(title)}</h1>${paragraphs}${button}`;
}

async function audienceEmails(audience: Audience): Promise<{ emails: string[]; error?: string }> {
  if (audience === "turistas") {
    // Só quem aceitou receber novidades (LGPD).
    const { data, error } = await supabase.from("turistas").select("email").eq("marketingOptIn", true);
    if (error) {
      const pending = error.code === "42703" || /marketingOptIn/.test(error.message || "");
      return { emails: [], error: pending ? "Rode a migração scripts/add-emails-preferencias.sql no Supabase para usar os comunicados." : "Erro ao buscar os turistas." };
    }
    return { emails: (data || []).map((r: any) => String(r.email || "").toLowerCase()).filter(Boolean) };
  }
  // Parceiros: contas de gestor (pousada, atração, guia) — comunicação da
  // plataforma com quem tem contrato, não marketing.
  if (!supabaseAdminAuth) return { emails: [], error: "SUPABASE_SERVICE_ROLE_KEY não configurada." };
  const emails = new Set<string>();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdminAuth.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { emails: [], error: "Erro ao listar os parceiros." };
    for (const u of data.users as any[]) if (u.app_metadata?.role === "partner" && u.email) emails.add(u.email.toLowerCase());
    if (data.users.length < 1000) break;
  }
  return { emails: [...emails] };
}

export function registerEmailRoutes(app: Express) {

// Descadastro das novidades (link do rodapé). GET para a página
// /descadastrar e POST para o "Cancelar inscrição" do Gmail (one-click).
const unsubscribe = async (email: string, token: string) => {
  if (!EMAIL_TOKEN_SECRET || !verifyUnsubscribeToken(email, token, EMAIL_TOKEN_SECRET)) return false;
  const { error } = await supabase.from("turistas").update({ marketingOptIn: false, marketingOptInAt: null }).ilike("email", email.trim());
  if (error) log.warn("Falha ao descadastrar:", error.message);
  return !error;
};
app.get("/api/email/unsubscribe", publicFormLimiter, async (req, res) => {
  const ok = await unsubscribe(String(req.query.e || ""), String(req.query.t || ""));
  res.status(ok ? 200 : 400).json(ok ? { success: true } : { error: "Link de descadastro inválido." });
});
app.post("/api/email/unsubscribe", publicFormLimiter, async (req, res) => {
  const ok = await unsubscribe(String(req.query.e || req.body?.e || ""), String(req.query.t || req.body?.t || ""));
  res.status(ok ? 200 : 400).json(ok ? { success: true } : { error: "Link de descadastro inválido." });
});

// Alerta de segurança: avisa o dono da conta que a senha mudou (o site
// chama depois de definir uma senha nova). Se não foi ele, sabe na hora.
app.post("/api/auth/password-changed", requireAnyAuth, async (req, res) => {
  const user = res.locals.authUser as { email?: string };
  if (!user?.email) return res.json({ success: true });
  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Cuiaba", dateStyle: "long", timeStyle: "short" });
  await sendEmail({
    to: user.email,
    subject: "Sua senha foi alterada — Ipantanal",
    preheader: "Se não foi você, redefina a senha agora.",
    html: `
      <h1 style="margin:0 0 12px;font-size:22px;color:#0B1412">Sua senha foi alterada</h1>
      <p style="margin:0 0 14px">A senha da sua conta Ipantanal (${escapeHtml(user.email)}) foi alterada em <strong>${escapeHtml(quando)}</strong> (horário de Cuiabá).</p>
      <p style="margin:0 0 14px">Foi você? Então está tudo certo, não precisa fazer nada.</p>
      <p style="margin:0 0 14px"><strong>Não foi você?</strong> Redefina a senha agora pelo "Esqueci minha senha" na tela de login e responda este e-mail para avisarmos a equipe.</p>
      <p style="margin:24px 0"><a href="${SITE_URL}/entrar" style="display:inline-block;background:#0B1412;color:#FFFFFF;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">Ir para o login</a></p>
    `,
  });
  res.json({ success: true });
});

// Quantos destinatários cada público tem (para a Gestão ver antes de enviar).
app.get("/api/admin/comunicados/publico", requireAdmin, async (_req, res) => {
  const [t, p] = await Promise.all([audienceEmails("turistas"), audienceEmails("parceiros")]);
  res.json({ turistas: t.emails.length, parceiros: p.emails.length, avisos: [t.error, p.error].filter(Boolean) });
});

// Envia um comunicado (novidades/notícias). "teste: true" manda só para o
// e-mail de quem está na Gestão, para conferir antes do envio real.
app.post("/api/admin/comunicados", requireAdmin, async (req, res) => {
  if (!resend) return res.status(503).json({ error: "Resend não configurado." });
  const subject = clip(req.body.subject, 150);
  const title = clip(req.body.title, 150) || subject;
  const body = clip(req.body.body, 8000);
  const audience = (req.body.audience === "parceiros" ? "parceiros" : "turistas") as Audience;
  const ctaLabel = clip(req.body.ctaLabel, 60);
  const ctaUrl = clip(req.body.ctaUrl, 500);
  const teste = req.body.teste === true;
  if (!subject || !body) return res.status(400).json({ error: "Preencha o assunto e o texto." });
  if (ctaUrl && !/^https:\/\//.test(ctaUrl)) return res.status(400).json({ error: "O link do botão precisa começar com https://" });

  const html = comunicadoToHtml(title, body, ctaLabel && ctaUrl ? { label: ctaLabel, url: ctaUrl } : undefined);
  const category = audience === "turistas" ? "novidades" : "transacional";
  const admin = res.locals.adminUser as { email?: string } | undefined;

  if (teste) {
    if (!admin?.email) return res.status(400).json({ error: "Sua conta não tem e-mail." });
    const r = await sendEmail({ to: admin.email, subject: `[TESTE] ${subject}`, html, preheader: title, category });
    return r.ok ? res.json({ success: true, enviados: 1, teste: true }) : res.status(502).json({ error: r.error || "O Resend recusou o envio." });
  }

  const { emails, error } = await audienceEmails(audience);
  if (error) return res.status(503).json({ error });
  if (emails.length === 0) return res.status(400).json({ error: "Nenhum destinatário neste público ainda." });

  // Lotes de 100 (limite do envio em lote do Resend); cada pessoa recebe o
  // próprio e-mail, com o próprio link de descadastro.
  let enviados = 0;
  const falhas: string[] = [];
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100);
    try {
      const { error: batchErr } = await resend.batch.send(chunk.map(to => buildEmailPayload({ to, subject, html, preheader: title, category }, EMAIL_FROM)) as any);
      if (batchErr) falhas.push(batchErr.message);
      else enviados += chunk.length;
    } catch (err: any) {
      falhas.push(err?.message || "erro");
    }
  }
  await logAdminAction(res.locals.adminUser, "create", "comunicado", subject.slice(0, 60), `${audience}: ${enviados}/${emails.length} enviados`);
  if (enviados === 0) return res.status(502).json({ error: `O Resend recusou o envio: ${falhas[0] || "erro desconhecido"}` });
  res.json({ success: true, enviados, total: emails.length, falhas: falhas.length });
});
}
