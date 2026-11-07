// Ciclo de publicação da pousada (padrão Booking/Airbnb):
//   em_preparacao → (pousada envia) → em_revisao → (Gestão publica) → publicada
//   a Gestão pode devolver (volta para em_preparacao com um comentário)
//   publicada ⇄ pausada (pela pousada ou pela Gestão)
// Só aparece no site quem está "publicada" E tem o contrato assinado.
// Sem imports: também é usado pelo servidor.

export type StatusPublicacao = "em_preparacao" | "em_revisao" | "publicada" | "pausada";

export const ROTULO_PUBLICACAO: Record<StatusPublicacao, string> = {
  em_preparacao: "Em preparação",
  em_revisao: "Em revisão",
  publicada: "Publicada",
  pausada: "Pausada",
};

export const MIN_FOTOS_PUBLICACAO = 5;

export interface ItemChecklist { id: string; label: string; ok: boolean; aba: string }

export function checklistPublicacao(p: {
  images?: string[]; description?: string; pricePerNight?: number; rooms?: unknown[]; capacity?: number;
  latitude?: number | null; longitude?: number | null; whatsappContato?: string; contratoId?: string | null;
}): ItemChecklist[] {
  const fotos = (p.images || []).filter(Boolean).length;
  const zap = String(p.whatsappContato || "").replace(/\D/g, "");
  return [
    { id: "fotos", label: `Pelo menos ${MIN_FOTOS_PUBLICACAO} fotos (você tem ${fotos})`, ok: fotos >= MIN_FOTOS_PUBLICACAO, aba: "galeria" },
    { id: "descricao", label: "Descrição da pousada (pelo menos 80 caracteres)", ok: String(p.description || "").trim().length >= 80, aba: "sobre" },
    { id: "preco", label: "Preço da diária", ok: Number(p.pricePerNight) > 0, aba: "sobre" },
    { id: "quartos", label: "Quartos cadastrados ou capacidade", ok: (p.rooms || []).length > 0 || Number(p.capacity) > 0, aba: "acomodacoes" },
    { id: "localizacao", label: "Localização no mapa", ok: typeof p.latitude === "number" && typeof p.longitude === "number", aba: "sobre" },
    { id: "whatsapp", label: "WhatsApp da recepção", ok: zap.length >= 10, aba: "sobre" },
    { id: "contrato", label: "Contrato de parceria assinado", ok: !!p.contratoId, aba: "contrato" },
  ];
}

export const prontaParaEnviar = (p: Parameters<typeof checklistPublicacao>[0]) => checklistPublicacao(p).every(i => i.ok);
