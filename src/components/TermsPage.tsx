import React from "react";
import InfoPageLayout from "./InfoPageLayout";

export default function TermsPage() {
  return (
    <InfoPageLayout kicker="Condições de Uso" title="Termos de Uso e Política de Cancelamento">
      <p className="text-editorial-muted text-xs italic">Última atualização: julho de 2026. Este documento é um modelo de referência e deve ser revisado por um advogado antes de qualquer uso comercial definitivo.</p>

      <h3 className="text-lg font-serif font-bold text-editorial-primary pt-2">1. Sobre o serviço</h3>
      <p>
        A EcoSafari Brasil atua como plataforma de intermediação entre viajantes e pousadas/guias parceiros para experiências de turismo ecológico. A prestação direta do serviço de hospedagem e condução das expedições é realizada pelas pousadas e guias parceiros, que são responsáveis pela qualidade e segurança da execução no local.
      </p>

      <h3 className="text-lg font-serif font-bold text-editorial-primary pt-2">2. Reservas</h3>
      <p>
        Toda reserva está sujeita à disponibilidade de vagas na pousada e na agenda dos guias. A reserva só é considerada confirmada após a confirmação de pagamento e o aceite formal da pousada e do guia designado.
      </p>

      <h3 className="text-lg font-serif font-bold text-editorial-primary pt-2">3. Política de Cancelamento</h3>
      <ul className="list-disc pl-5 space-y-2">
        <li><strong>Mais de 15 dias antes do check-in:</strong> reembolso de 100% do valor pago.</li>
        <li><strong>Entre 7 e 15 dias antes do check-in:</strong> reembolso de 50% do valor pago.</li>
        <li><strong>Menos de 7 dias antes do check-in:</strong> sem reembolso; é possível solicitar remarcação de data, sujeita à disponibilidade da pousada e do guia.</li>
        <li><strong>Cancelamento por parte da pousada/guia:</strong> reembolso integral garantido, com apoio da nossa equipe para realocação em outra unidade parceira, se desejado.</li>
        <li><strong>Casos de força maior</strong> (desastres naturais, emergências de saúde documentadas, restrições oficiais de viagem): avaliados individualmente pela nossa equipe.</li>
      </ul>
      <p>Solicitações de cancelamento devem ser feitas por escrito, pelo WhatsApp ou email de contato, informando o número da reserva.</p>

      <h3 className="text-lg font-serif font-bold text-editorial-primary pt-2">4. Responsabilidades do viajante</h3>
      <ul className="list-disc pl-5 space-y-2">
        <li>Fornecer informações verdadeiras e completas no momento da reserva.</li>
        <li>Seguir as orientações de segurança dos guias durante as expedições.</li>
        <li>Providenciar documentação de viagem, vacinação recomendada e seguro viagem por conta própria.</li>
        <li>Respeitar a fauna e flora local, sem alimentar, tocar ou perturbar animais silvestres.</li>
      </ul>

      <h3 className="text-lg font-serif font-bold text-editorial-primary pt-2">5. Cadastro de parceiros</h3>
      <p>
        Guias e pousadas que se cadastram através do formulário "Seja um Parceiro" concordam que suas informações sejam avaliadas pela nossa equipe para fins de triagem, podendo ser aprovadas, rejeitadas ou requerer contato adicional antes da publicação no catálogo.
      </p>

      <h3 className="text-lg font-serif font-bold text-editorial-primary pt-2">6. Limitação de responsabilidade</h3>
      <p>
        A EcoSafari Brasil não se responsabiliza por eventos fora de seu controle direto, incluindo condições climáticas, comportamento imprevisível da fauna silvestre, ou decisões operacionais tomadas pelas pousadas e guias parceiros durante a execução da experiência.
      </p>

      <h3 className="text-lg font-serif font-bold text-editorial-primary pt-2">7. Contato</h3>
      <p>
        Dúvidas sobre estes termos podem ser enviadas para{" "}
        <a href="mailto:francainteligenciaindustrial@gmail.com" className="text-editorial-primary font-semibold hover:underline">francainteligenciaindustrial@gmail.com</a>{" "}
        ou pelo WhatsApp <a href="https://wa.me/5565999868334" className="text-editorial-primary font-semibold hover:underline">+55 65 99986-8334</a>.
      </p>
    </InfoPageLayout>
  );
}
