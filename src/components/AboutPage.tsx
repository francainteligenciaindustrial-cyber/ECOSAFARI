import React from "react";
import InfoPageLayout from "./InfoPageLayout";

export default function AboutPage() {
  return (
    <InfoPageLayout kicker="Nossa História" title="Sobre a EcoSafari Brasil">
      <p>
        A EcoSafari Brasil nasceu da vontade de conectar viajantes do mundo todo à biodiversidade brasileira sem abrir mão da responsabilidade ambiental. Trabalhamos como uma ponte entre pousadas parceiras, guias especializados e visitantes que querem viver experiências reais de observação de vida selvagem — no Pantanal, no Cerrado e na Amazônia.
      </p>
      <p>
        Cada pousada e cada guia que fazem parte da nossa rede passam por uma triagem antes de aparecer no catálogo: verificamos localização, estrutura, práticas de sustentabilidade e o histórico de atuação na região. Isso significa que, quando você reserva conosco, está reservando com quem realmente conhece o território.
      </p>

      <h3 className="text-lg font-serif font-bold text-editorial-primary pt-2">Nossa Missão</h3>
      <p>
        Acreditamos que o turismo de observação de vida selvagem, quando bem feito, é uma das ferramentas mais poderosas de conservação: transforma animais selvagens em ativos econômicos vivos para comunidades locais, o que reduz a caça predatória e financia a proteção de habitats. Cada reserva feita através da EcoSafari contribui direta ou indiretamente para a manutenção de áreas de conservação e para a renda de famílias que vivem do turismo responsável.
      </p>

      <h3 className="text-lg font-serif font-bold text-editorial-primary pt-2">Como trabalhamos</h3>
      <ul className="list-disc pl-5 space-y-2">
        <li>Selecionamos pousadas com infraestrutura adequada e compromisso ambiental verificável.</li>
        <li>Trabalhamos apenas com guias que têm registro de atuação comprovado na região.</li>
        <li>Priorizamos atividades de baixo impacto: observação à distância segura, sem alimentação artificial de animais silvestres.</li>
        <li>Damos transparência total de preços, sem taxas escondidas na hora da reserva.</li>
      </ul>

      <h3 className="text-lg font-serif font-bold text-editorial-primary pt-2">Parcerias e conservação</h3>
      <p>
        Estamos construindo parcerias com organizações de conservação ambiental atuantes nos biomas onde operamos, para direcionar parte da nossa receita a projetos de proteção de espécies como a onça-pintada e o lobo-guará. Se você representa uma ONG de conservação e quer conversar sobre parceria, entre em contato pelo nosso WhatsApp.
      </p>
    </InfoPageLayout>
  );
}
