// Moldura única de todos os e-mails do Ipantanal: cabeçalho com a marca,
// conteúdo, rodapé com quem envia e — nos e-mails de novidades — o link
// de descadastro. Tabelas e estilos inline porque é o que Gmail, Outlook e
// Apple Mail entendem igual. Sem imports: arquivo puro, fácil de testar.

export interface EmailFrame {
  // Texto curto que o programa de e-mail mostra ao lado do assunto.
  preheader?: string;
  // Só nos e-mails de novidades (marketing): link de descadastro no rodapé.
  unsubscribeUrl?: string;
  siteUrl?: string;
  companyLine?: string;
}

const GRAFITE = "#0B1412";
const SINAL = "#2EE59D";
const NEVOA = "#F4F6F5";
const LODO = "#4F5D58";

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// Já é um documento completo? Então não embrulha de novo.
export const isFullDocument = (html: string) => /<html[\s>]/i.test(html);

export function wrapEmail(contentHtml: string, frame: EmailFrame = {}): string {
  if (isFullDocument(contentHtml)) return contentHtml;
  const site = (frame.siteUrl || "https://www.ipantanal.com.br").replace(/\/$/, "");
  const pre = frame.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeAttr(frame.preheader)}</div>`
    : "";
  const unsubscribe = frame.unsubscribeUrl
    ? `<p style="margin:12px 0 0;font-size:12px;color:${LODO}">Você recebe este e-mail porque aceitou receber novidades do Ipantanal. <a href="${escapeAttr(frame.unsubscribeUrl)}" style="color:${LODO};text-decoration:underline">Descadastrar</a></p>`
    : "";
  const company = frame.companyLine ? `<p style="margin:6px 0 0;font-size:12px;color:${LODO}">${escapeAttr(frame.companyLine)}</p>` : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>Ipantanal</title>
</head>
<body style="margin:0;padding:0;background:${NEVOA};font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:${GRAFITE}">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NEVOA}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 20px">
<a href="${escapeAttr(site)}" style="text-decoration:none;color:${GRAFITE}">
<span style="display:inline-block;vertical-align:middle;width:10px;height:10px;border-radius:50%;background:${SINAL};margin-right:8px"></span><span style="font-family:'Space Grotesk',Inter,Arial,sans-serif;font-weight:600;font-size:16px;letter-spacing:4px;vertical-align:middle"><span style="color:#0B9467">I</span>PANTANAL</span>
</a>
</td></tr>
<tr><td style="background:#FFFFFF;border:1px solid #D6E0DC;border-radius:20px;padding:32px 28px;font-size:15px;line-height:1.6">
${contentHtml}
</td></tr>
<tr><td style="padding:20px 8px 0;text-align:center">
<p style="margin:0;font-size:12px;color:${LODO}">Ipantanal · <a href="${escapeAttr(site)}" style="color:${LODO}">${escapeAttr(site.replace(/^https?:\/\//, ""))}</a></p>
${company}
${unsubscribe}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// Versão em texto puro (melhora a entrega e é o que alguns leitores mostram).
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
      const text = label.replace(/<[^>]+>/g, "").trim();
      return text && text !== href ? `${text} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Botão padrão (os e-mails antigos montam o próprio; os novos usam este).
export function emailButton(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeAttr(href)}" style="display:inline-block;background:${GRAFITE};color:#FFFFFF;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">${label}</a></p>`;
}
