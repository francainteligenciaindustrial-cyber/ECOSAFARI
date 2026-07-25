import React from "react";
import InfoPageLayout from "./InfoPageLayout";

export default function PrivacyPolicyPage() {
  return (
    <InfoPageLayout kicker="Proteção de Dados" title="Política de Privacidade">
      <p className="text-editorial-muted text-xs italic">Última atualização: julho de 2026. Este documento é um modelo de referência e deve ser revisado por um advogado antes de qualquer uso comercial definitivo.</p>

      <p>
        A EcoSafari Brasil ("nós") respeita a privacidade de quem visita este site, reserva experiências, se cadastra como parceiro ou entra em contato conosco. Esta política explica quais dados coletamos, por que coletamos, e quais direitos você tem sobre eles, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
      </p>

      <h3 className="text-lg font-serif font-bold text-editorial-primary pt-2">1. Quais dados coletamos</h3>
      <ul className="list-disc pl-5 space-y-2">
        <li><strong>Dados de reserva:</strong> nome, email, telefone/WhatsApp, nacionalidade, número de hóspedes, restrições alimentares e necessidades especiais informadas voluntariamente.</li>
        <li><strong>Dados de cadastro de parceiros (guias e pousadas):</strong> nome, email, telefone, idade, idiomas, disponibilidade, localidade e demais informações fornecidas no formulário "Seja um Parceiro".</li>
        <li><strong>Dados de navegação:</strong> páginas visitadas e interações no site, usados apenas para melhorar a experiência (ex: contadores de visualização).</li>
        <li><strong>Conversas com nossa assistente virtual:</strong> o conteúdo trocado durante o atendimento via chatbot para fins de orçamento e reserva.</li>
      </ul>

      <h3 className="text-lg font-serif font-bold text-editorial-primary pt-2">2. Por que coletamos (finalidade e base legal)</h3>
      <ul className="list-disc pl-5 space-y-2">
        <li>Processar reservas e viabilizar a prestação do serviço contratado (execução de contrato).</li>
        <li>Entrar em contato sobre candidaturas de parceria (procedimentos preliminares/execução de contrato).</li>
        <li>Cumprir obrigações legais e regulatórias, quando aplicável.</li>
        <li>Melhorar nossos serviços e comunicação, com base no seu consentimento ou em nosso legítimo interesse, sempre respeitando seus direitos.</li>
      </ul>

      <h3 className="text-lg font-serif font-bold text-editorial-primary pt-2">3. Com quem compartilhamos dados</h3>
      <p>Usamos os seguintes fornecedores para operar o site, que podem processar seus dados em nosso nome:</p>
      <ul className="list-disc pl-5 space-y-2">
        <li><strong>Supabase</strong> — armazenamento do banco de dados.</li>
        <li><strong>Google Calendar</strong> — sincronização de agenda de reservas (quando ativado pela equipe administrativa).</li>
        <li><strong>WhatsApp</strong> — canal de comunicação para atendimento e confirmação de reservas.</li>
        <li><strong>Google Gemini</strong> — processamento das conversas com a assistente virtual de atendimento.</li>
        <li><strong>Processadores de pagamento</strong> (quando o checkout online estiver ativo) — para processar transações com segurança.</li>
      </ul>
      <p>Não vendemos seus dados pessoais a terceiros.</p>

      <h3 className="text-lg font-serif font-bold text-editorial-primary pt-2">4. Por quanto tempo guardamos seus dados</h3>
      <p>
        Mantemos os dados de reserva pelo tempo necessário para cumprir finalidades fiscais e contratuais. Candidaturas de parceiros recusadas ou não respondidas podem ser mantidas por até 12 meses para eventual novo contato, salvo solicitação de exclusão antecipada.
      </p>

      <h3 className="text-lg font-serif font-bold text-editorial-primary pt-2">5. Seus direitos como titular de dados</h3>
      <p>De acordo com a LGPD, você pode a qualquer momento solicitar:</p>
      <ul className="list-disc pl-5 space-y-2">
        <li>Confirmação da existência de tratamento e acesso aos seus dados;</li>
        <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
        <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade com a lei;</li>
        <li>Portabilidade dos dados a outro fornecedor de serviço;</li>
        <li>Eliminação dos dados tratados com o seu consentimento;</li>
        <li>Revogação do consentimento a qualquer momento.</li>
      </ul>
      <p>
        Para exercer qualquer um desses direitos, entre em contato pelo email{" "}
        <a href="mailto:francainteligenciaindustrial@gmail.com" className="text-editorial-primary font-semibold hover:underline">francainteligenciaindustrial@gmail.com</a>.
      </p>

      <h3 className="text-lg font-serif font-bold text-editorial-primary pt-2">6. Segurança</h3>
      <p>
        Adotamos medidas técnicas razoáveis para proteger seus dados, incluindo criptografia em trânsito (TLS) e em repouso, fornecidas pela nossa infraestrutura de banco de dados. Nenhum sistema é 100% imune a incidentes, e nos comprometemos a notificar titulares e autoridades competentes em caso de incidentes de segurança relevantes, conforme exigido pela LGPD.
      </p>

      <h3 className="text-lg font-serif font-bold text-editorial-primary pt-2">7. Contato</h3>
      <p>
        Dúvidas sobre esta política podem ser enviadas para{" "}
        <a href="mailto:francainteligenciaindustrial@gmail.com" className="text-editorial-primary font-semibold hover:underline">francainteligenciaindustrial@gmail.com</a>{" "}
        ou pelo WhatsApp <a href="https://wa.me/5565999868334" className="text-editorial-primary font-semibold hover:underline">+55 65 99986-8334</a>.
      </p>
    </InfoPageLayout>
  );
}
