// Lista de países para os campos "País"/"Nacionalidade". O valor gravado é
// sempre o nome em português (mantém relatórios e o painel "Resultados"
// agrupando igual, seja qual for o idioma do turista); só o rótulo exibido
// segue o idioma da interface, via Intl.DisplayNames.

// Mercados mais comuns do Pantanal — aparecem primeiro no seletor.
export const COMMON_COUNTRY_CODES = [
  "BR", "US", "AR", "DE", "GB", "FR", "IT", "ES", "PT", "NL", "CH", "CA", "UY", "PY", "CL", "BO",
];

// ISO 3166-1 alfa-2.
export const ALL_COUNTRY_CODES = (
  "AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ " +
  "DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL " +
  "NO NP NR NZ OM PA PE PG PH PK PL PR PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM " +
  "TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW"
).split(" ");

const displayNamesCache = new Map<string, Intl.DisplayNames | null>();

export function countryName(code: string, locale = "pt-BR"): string {
  if (!displayNamesCache.has(locale)) {
    try {
      displayNamesCache.set(locale, new Intl.DisplayNames([locale], { type: "region" }));
    } catch {
      displayNamesCache.set(locale, null);
    }
  }
  return displayNamesCache.get(locale)?.of(code) ?? code;
}

export interface CountryOption {
  value: string; // nome em português (o que é gravado)
  label: string; // nome no idioma da interface
}

export function countryOptions(locale = "pt-BR"): { common: CountryOption[]; all: CountryOption[] } {
  const toOption = (code: string): CountryOption => ({ value: countryName(code, "pt-BR"), label: countryName(code, locale) });
  const common = COMMON_COUNTRY_CODES.map(toOption);
  const commonSet = new Set(COMMON_COUNTRY_CODES);
  const all = ALL_COUNTRY_CODES.filter(c => !commonSet.has(c))
    .map(toOption)
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  return { common, all };
}

// Reservas antigas gravavam "Brasileira" etc. — normaliza o gentílico mais
// comum para o nome do país, para o seletor mostrar o valor certo.
const DEMONYMS: Record<string, string> = {
  brasileira: "Brasil", brasileiro: "Brasil",
  americana: "Estados Unidos", americano: "Estados Unidos",
  argentina: "Argentina", argentino: "Argentina",
  alemã: "Alemanha", alemão: "Alemanha",
  francesa: "França", francês: "França",
  italiana: "Itália", italiano: "Itália",
  espanhola: "Espanha", espanhol: "Espanha",
  portuguesa: "Portugal", português: "Portugal",
  inglesa: "Reino Unido", inglês: "Reino Unido", britânica: "Reino Unido", britânico: "Reino Unido",
};

export function normalizeCountry(value: string): string {
  const trimmed = (value || "").trim();
  return DEMONYMS[trimmed.toLowerCase()] ?? trimmed;
}
