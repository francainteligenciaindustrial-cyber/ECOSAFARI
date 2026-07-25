import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import InfoPageLayout from "./InfoPageLayout";

const FAQS: { category: string; items: { q: string; a: string }[] }[] = [
  {
    category: "Segurança",
    items: [
      {
        q: "É seguro observar animais silvestres de perto, como a onça-pintada?",
        a: "Sim. Todas as expedições são conduzidas por guias credenciados que seguem protocolos de distância segura e leem o comportamento dos animais. Nunca há alimentação artificial ou aproximação forçada — a observação acontece a partir de barcos, veículos ou pontos fixos, respeitando o espaço do animal."
      },
      {
        q: "As pousadas têm estrutura médica ou de emergência?",
        a: "As pousadas parceiras ficam em regiões remotas, então mantêm kits de primeiros socorros e contato direto com serviços de resgate regionais. Recomendamos fortemente contratar um seguro viagem antes da expedição, especialmente para roteiros na Amazônia e no Pantanal profundo."
      }
    ]
  },
  {
    category: "Preparação para a viagem",
    items: [
      {
        q: "O que devo levar para um safári fotográfico?",
        a: "Roupas leves de manga comprida (proteção contra sol e insetos), repelente, protetor solar, chapéu, binóculos, uma capa de chuva e calçado fechado confortável. Se for fotografar, uma teleobjetiva (200mm+) faz muita diferença para os registros de fauna."
      },
      {
        q: "Preciso tomar alguma vacina antes de viajar?",
        a: "Para roteiros na Amazônia, a vacina de febre amarela é recomendada (idealmente tomada com pelo menos 10 dias de antecedência). Para o Pantanal e o Cerrado, não há exigência específica, mas consulte sempre um médico de viagem antes de qualquer expedição."
      },
      {
        q: "Qual a melhor época do ano para ver a onça-pintada?",
        a: "A temporada seca no Pantanal (aproximadamente de julho a outubro) costuma ter os melhores índices de avistamento, já que os animais se concentram perto dos rios remanescentes."
      }
    ]
  },
  {
    category: "Reservas e pagamento",
    items: [
      {
        q: "Como funciona o processo de reserva?",
        a: "Você escolhe a pousada e a experiência, conversa com a nossa assistente virtual (ou diretamente com nossa equipe) pelo WhatsApp para confirmar disponibilidade, e finaliza o pagamento. Após a confirmação, você recebe o voucher da reserva."
      },
      {
        q: "Qual a política de cancelamento?",
        a: "Cancelamentos com mais de 15 dias de antecedência têm reembolso integral. Entre 7 e 15 dias, reembolso de 50%. Com menos de 7 dias, não há reembolso, mas é possível remarcar a data sujeito à disponibilidade. Casos de força maior são avaliados individualmente."
      },
      {
        q: "Quais formas de pagamento vocês aceitam?",
        a: "Cartão de crédito e Pix. Os detalhes de pagamento são enviados durante a conversa de reserva."
      }
    ]
  },
  {
    category: "Parcerias",
    items: [
      {
        q: "Sou guia turístico ou tenho uma pousada, como me cadastro?",
        a: "Acesse a página \"Seja um Parceiro\" no rodapé do site, preencha o formulário com suas informações e nossa equipe entrará em contato para os próximos passos."
      }
    ]
  }
];

export default function FaqPage() {
  const [openIndex, setOpenIndex] = useState<string | null>(null);

  return (
    <InfoPageLayout kicker="Dúvidas Frequentes" title="Perguntas Frequentes">
      <p className="mb-6">Reunimos aqui as dúvidas mais comuns antes de uma expedição. Não encontrou o que procurava? Fale com a gente pelo WhatsApp.</p>

      {FAQS.map(section => (
        <div key={section.category} className="mb-8">
          <h3 className="text-xs uppercase tracking-widest font-bold text-editorial-primary mb-3">{section.category}</h3>
          <div className="space-y-2">
            {section.items.map((item, i) => {
              const key = `${section.category}-${i}`;
              const isOpen = openIndex === key;
              return (
                <div key={key} className="border border-editorial-border bg-white">
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : key)}
                    className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left text-sm font-semibold cursor-pointer"
                  >
                    {item.q}
                    <ChevronDown className={`h-4 w-4 flex-shrink-0 text-editorial-primary transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <p className="px-4 pb-4 text-editorial-muted text-sm leading-relaxed">{item.a}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </InfoPageLayout>
  );
}
