// Contrato de Parceria Ipantanal × Pousada — texto gerado com os dados de
// quem assina e a política vigente (src/lib/politica.ts). O texto exato
// que foi aceito fica guardado com um hash SHA-256, para provar depois que
// não foi alterado. MODELO: revisar com advogado antes do uso comercial.
import { createHash } from "crypto";
import {
  COMISSAO_LANCAMENTO_PCT, MESES_LANCAMENTO, FAIXAS_CANCELAMENTO, RETIDO_POUSADA_PCT,
} from "../src/lib/politica.js";
import { formatarDocumento } from "../src/lib/documentos.js";

export const CONTRATO_VERSAO = "2026-11-v1";

export interface DadosContrato {
  pousadaNome: string;
  razaoSocial: string;
  documento: string;
  endereco?: string;
  responsavelNome: string;
  responsavelCpf: string;
  responsavelCargo: string;
  responsavelEmail: string;
  pixTipo: string;
  pixChave: string;
  comissaoPct: number;
  comLancamento: boolean;
  dataISO: string;
}

const IPANTANAL = {
  nome: process.env.IPANTANAL_RAZAO_SOCIAL || "IPANTANAL",
  cnpj: process.env.VITE_COMPANY_CNPJ || "[CNPJ do Ipantanal]",
  endereco: process.env.VITE_COMPANY_ADDRESS || "[endereço do Ipantanal]",
  foro: process.env.IPANTANAL_FORO || "Cuiabá/MT",
};

const br = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function renderContrato(d: DadosContrato): string {
  const faixas = FAIXAS_CANCELAMENTO.map(f => `   • ${f.rotulo}: reembolso de ${f.reembolsoPct}% ao hóspede.`).join("\n");
  const lancamento = d.comLancamento
    ? ` Nos ${MESES_LANCAMENTO} (${MESES_LANCAMENTO === 6 ? "seis" : MESES_LANCAMENTO}) primeiros meses contados da assinatura, a comissão será de ${COMISSAO_LANCAMENTO_PCT}% (condição de lançamento), passando automaticamente a ${d.comissaoPct}% após esse período.`
    : "";
  return `CONTRATO DE PARCERIA E INTERMEDIAÇÃO DE RESERVAS — IPANTANAL
Versão ${CONTRATO_VERSAO}

PARTES
INTERMEDIADORA: ${IPANTANAL.nome}, inscrita no CNPJ ${IPANTANAL.cnpj}, com sede em ${IPANTANAL.endereco}, operadora da plataforma ipantanal.com.br ("IPANTANAL").
PARCEIRA: ${d.razaoSocial}, inscrita no ${d.documento.replace(/\D/g, "").length === 14 ? "CNPJ" : "CPF"} ${formatarDocumento(d.documento)}, responsável pelo estabelecimento "${d.pousadaNome}"${d.endereco ? `, localizado em ${d.endereco}` : ""}, neste ato representada por ${d.responsavelNome}, CPF ${formatarDocumento(d.responsavelCpf)}, ${d.responsavelCargo} ("PARCEIRA").

CLÁUSULA 1 — OBJETO
1.1. A IPANTANAL divulga o estabelecimento da PARCEIRA em sua plataforma e intermedeia a venda de hospedagens, pacotes e experiências, recebendo dos hóspedes o pagamento em nome da PARCEIRA e repassando-lhe o valor devido nos termos deste contrato.
1.2. A PARCEIRA é a única responsável pela prestação dos serviços de hospedagem e experiências vendidos, pela veracidade das informações, fotos, preços e disponibilidade cadastrados, e pelo cumprimento da legislação aplicável à sua atividade.

CLÁUSULA 2 — COMISSÃO
2.1. Pela intermediação, a IPANTANAL fará jus a uma comissão de ${d.comissaoPct}% (${d.comissaoPct} por cento) sobre o valor total de cada reserva paga pelo hóspede.${lancamento}
2.2. O percentual vigente no momento do pagamento de cada reserva é registrado nela e não muda depois, ainda que a comissão seja alterada.
2.3. Eventuais repasses a afiliados (indicações) e a projetos de conservação saem da comissão da IPANTANAL, sem custo adicional à PARCEIRA.
2.4. Alterações de comissão dependem de novo aceite da PARCEIRA (nova versão deste contrato) e só valem para reservas pagas depois dele.

CLÁUSULA 3 — PAGAMENTO E CUSTÓDIA
3.1. O hóspede paga a reserva à IPANTANAL pela plataforma. O valor fica em custódia da IPANTANAL até o início da hospedagem, para garantir reembolsos e cancelamentos.
3.2. O valor devido à PARCEIRA (valor da reserva menos a comissão) é liberado 1 (um) dia após a data de check-in e pago em lote, por Pix, na chave abaixo, em nome da PARCEIRA:
   Chave Pix (${d.pixTipo}): ${d.pixChave}
3.3. A PARCEIRA recebe extrato de cada repasse, com as reservas incluídas, e pode acompanhá-los no portal do parceiro.
3.4. A IPANTANAL só repassa valores efetivamente recebidos do meio de pagamento. Contestações de cartão (chargeback), fraudes ou reembolsos determinados por lei ou por decisão judicial relativos a reservas já repassadas poderão ser descontados de repasses futuros, com aviso prévio à PARCEIRA.
3.5. Em caso de disputa, suspeita de fraude ou descumprimento deste contrato, a IPANTANAL poderá reter repasses relacionados até a solução, informando o motivo à PARCEIRA.

CLÁUSULA 4 — CANCELAMENTO PELO HÓSPEDE
4.1. A política de cancelamento abaixo é exibida e aceita pelo hóspede antes do pagamento:
${faixas}
4.2. Do valor retido nos cancelamentos, ${RETIDO_POUSADA_PCT}% cabe à PARCEIRA, como compensação pela vaga reservada e pela preparação, e ${100 - RETIDO_POUSADA_PCT}% à IPANTANAL, para cobrir as tarifas de processamento não devolvidas pelo meio de pagamento. Quando não há reembolso, a PARCEIRA recebe o repasse integral da reserva (valor menos a comissão).
4.3. Os reembolsos são processados automaticamente pela plataforma, no mesmo meio de pagamento usado pelo hóspede.
4.4. Fica ressalvado o direito do hóspede previsto no Código de Defesa do Consumidor e demais normas aplicáveis; reembolsos decorrentes dessas normas seguem a cláusula 3.4.

CLÁUSULA 5 — CANCELAMENTO PELA PARCEIRA
5.1. Se a PARCEIRA cancelar uma reserva paga, o hóspede é reembolsado integralmente e a PARCEIRA não recebe repasse dessa reserva.
5.2. Cancelamentos feitos pela PARCEIRA com menos de 45 (quarenta e cinco) dias do check-in afetam seu índice de confiabilidade na plataforma e, se recorrentes, podem levar à suspensão das vendas.
5.3. A PARCEIRA deve manter seu calendário de disponibilidade atualizado na plataforma para evitar vendas de vagas inexistentes.

CLÁUSULA 6 — OBRIGAÇÕES DA PARCEIRA
6.1. Honrar as reservas confirmadas, nas condições anunciadas.
6.2. Não oferecer ao hóspede trazido pela plataforma condições para fechar fora dela.
6.3. Manter regularizadas as licenças, cadastros (incluindo o Cadastur, quando exigido) e obrigações fiscais da sua atividade, emitindo ao hóspede os documentos fiscais referentes aos serviços prestados.

CLÁUSULA 7 — DADOS PESSOAIS (LGPD)
7.1. As partes tratarão os dados pessoais dos hóspedes apenas para a execução das reservas, conforme a Lei 13.709/2018, adotando medidas de segurança adequadas e não os utilizando para outras finalidades sem base legal.

CLÁUSULA 8 — VIGÊNCIA E RESCISÃO
8.1. Este contrato vigora por prazo indeterminado a partir do aceite e pode ser rescindido por qualquer das partes com aviso de 30 (trinta) dias, preservadas as reservas já pagas, que seguem as regras deste contrato até sua conclusão.

CLÁUSULA 9 — ACEITE ELETRÔNICO E FORO
9.1. As partes reconhecem a validade do aceite eletrônico deste contrato, nos termos da MP 2.200-2/2001 (art. 10, § 2º) e da Lei 14.063/2020, registrados nome, CPF, cargo, e-mail, data e hora, endereço IP e o código de integridade (hash) do texto aceito.
9.2. Fica eleito o foro da comarca de ${IPANTANAL.foro} para dirimir questões deste contrato.

Aceito eletronicamente por ${d.responsavelNome} (${d.responsavelEmail}), em nome de ${d.razaoSocial}, em ${br(d.dataISO)}.`;
}

export const hashContrato = (texto: string) => createHash("sha256").update(texto, "utf8").digest("hex");
