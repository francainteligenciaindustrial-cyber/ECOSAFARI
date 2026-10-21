// WhatsApp Business (API oficial da Meta — Cloud API). Mensagens iniciadas
// pela empresa só podem usar MODELOS aprovados pela Meta; os textos a
// cadastrar estão no RUNBOOK.md (seção WhatsApp). Sem WHATSAPP_TOKEN e
// WHATSAPP_PHONE_NUMBER_ID, nada é enviado — os e-mails continuam valendo.

const TOKEN = process.env.WHATSAPP_TOKEN || "";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const LANG = process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR";

export const whatsappConfigured = () => !!(TOKEN && PHONE_NUMBER_ID);

// "+55 (65) 99999-8888" → "5565999998888". Com "+" o DDI já está no número
// (estrangeiro incluso); sem "+", até 11 dígitos é número brasileiro e
// ganha o 55.
export function normalizeWhatsAppNumber(raw: string | undefined | null): string | null {
  const text = String(raw || "").trim();
  const digits = text.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  if (text.startsWith("+") || text.startsWith("00")) return digits.replace(/^00/, "");
  return digits.length <= 11 ? `55${digits}` : digits;
}

export async function sendWhatsAppTemplate(to: string | undefined | null, template: string, params: string[]): Promise<boolean> {
  if (!whatsappConfigured()) return false;
  const number = normalizeWhatsAppNumber(to);
  if (!number) return false;
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: number,
        type: "template",
        template: {
          name: template,
          language: { code: LANG },
          components: params.length ? [{ type: "body", parameters: params.map(text => ({ type: "text", text: String(text).slice(0, 200) })) }] : [],
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.warn(`WhatsApp recusou o modelo "${template}" para ${number}: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn("Falha ao enviar WhatsApp:", err?.message);
    return false;
  }
}
