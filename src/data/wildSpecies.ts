import type { Lang } from "../i18n/I18nProvider";

// Conteúdo educativo das espécies-símbolo do Pantanal Norte — usado na
// vitrine da home enquanto o admin não cadastrou espécies próprias, e como
// fonte do calendário de "melhor época" e das áreas de avistamento do mapa
// (para espécies cadastradas no banco, o casamento é feito pelo nome).
//
// season: Jan..Dez — 2 = pico, 1 = boa chance, 0 = baixa. No Pantanal a
// seca (jul–out) baixa a água e concentra a fauna nas margens dos rios; na
// cheia (dez–mar) os bichos se espalham e parte das estradas alaga.
// areas: pontos conhecidos de avistamento (coordenadas aproximadas).

export type SeasonLevel = 0 | 1 | 2;

export interface SpeciesText {
  name: string;
  category: string;
  description: string;
  details: string;
}

export interface SightingArea {
  name: string;
  lat: number;
  lng: number;
}

export interface WildSpeciesInfo {
  id: string;
  scientificName: string;
  image: string;
  sightingRate: string; // ex: "95%+"
  aliases: string[]; // nomes usados para casar com espécies cadastradas no banco
  season: SeasonLevel[];
  areas: SightingArea[];
  text: Record<Lang, SpeciesText>;
}

export const AREAS = {
  portoJofre: { name: "Porto Jofre — Rio Cuiabá", lat: -17.36, lng: -56.77 },
  tresIrmaos: { name: "Rio Três Irmãos", lat: -17.25, lng: -56.95 },
  transpantaneira: { name: "Rodovia Transpantaneira", lat: -16.5, lng: -56.74 },
  pixaim: { name: "Rio Pixaim", lat: -16.77, lng: -56.83 },
  poconeCampos: { name: "Campos de Poconé", lat: -16.3, lng: -56.62 },
  baraoMelgaco: { name: "Barão de Melgaço — Rio Cuiabá", lat: -16.19, lng: -55.97 },
  caceres: { name: "Cáceres — Rio Paraguai", lat: -16.07, lng: -57.68 },
} satisfies Record<string, SightingArea>;

export const WILD_SPECIES: WildSpeciesInfo[] = [
  {
    id: "capivara",
    scientificName: "Hydrochoerus hydrochaeris",
    image: "/species/capivara.png",
    sightingRate: "95%+",
    aliases: ["capivara", "capybara", "carpincho"],
    season: [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1],
    areas: [AREAS.transpantaneira, AREAS.pixaim],
    text: {
      pt: { name: "Capivara", category: "MAMÍFERO TERRESTRE", description: "O maior roedor do mundo vive harmoniosamente em grandes grupos familiares ao longo das margens ensolaradas do Rio Cuiabá.", details: "As capivaras são animais extremamente sociáveis e excelentes nadadoras. No Pantanal, elas desempenham um papel crucial no ecossistema, servindo como uma das principais presas para jacarés e onças-pintadas. Podem permanecer submersas por até 5 minutos para escapar de predadores." },
      en: { name: "Capybara", category: "LAND MAMMAL", description: "The world's largest rodent lives peacefully in big family groups along the sunny banks of the Cuiabá River.", details: "Capybaras are highly social animals and excellent swimmers. In the Pantanal they play a key role in the ecosystem as one of the main prey of caimans and jaguars. They can stay underwater for up to 5 minutes to escape predators." },
      es: { name: "Carpincho", category: "MAMÍFERO TERRESTRE", description: "El roedor más grande del mundo vive en armonía en grandes grupos familiares a orillas del soleado río Cuiabá.", details: "Los carpinchos son muy sociables y excelentes nadadores. En el Pantanal cumplen un papel clave en el ecosistema como una de las principales presas de yacarés y jaguares. Pueden permanecer sumergidos hasta 5 minutos para escapar de los depredadores." },
    },
  },
  {
    id: "jacare",
    scientificName: "Caiman yacare",
    image: "/species/jacare-do-pantanal.png",
    sightingRate: "95%+",
    aliases: ["jacare", "jacare-do-pantanal", "jacare do pantanal", "caiman", "yacare"],
    season: [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1],
    areas: [AREAS.transpantaneira, AREAS.portoJofre],
    text: {
      pt: { name: "Jacaré-do-Pantanal", category: "RÉPTIL PREDADOR", description: "Soberano das águas calmas, é comumente visto regulando sua temperatura sob o sol quente nas praias de areia branca.", details: "O jacaré-do-pantanal alimenta-se principalmente de peixes e moluscos. Após quase serem extintos devido à caça ilegal nas décadas de 1970 e 1980, hoje a população está totalmente recuperada e estimada em milhões de indivíduos, sendo um dos maiores casos de sucesso em conservação ambiental no Brasil." },
      en: { name: "Yacare Caiman", category: "PREDATORY REPTILE", description: "Ruler of the calm waters, often seen basking under the hot sun on white sandy river beaches.", details: "The yacare caiman feeds mainly on fish and snails. Nearly wiped out by illegal hunting in the 1970s and 1980s, its population has fully recovered to an estimated millions of animals — one of Brazil's biggest conservation success stories." },
      es: { name: "Yacaré del Pantanal", category: "REPTIL DEPREDADOR", description: "Señor de las aguas tranquilas, se lo ve a menudo tomando sol en las playas de arena blanca.", details: "El yacaré se alimenta sobre todo de peces y moluscos. Tras casi extinguirse por la caza ilegal en las décadas de 1970 y 1980, hoy su población está totalmente recuperada y se estima en millones de individuos: uno de los mayores éxitos de conservación de Brasil." },
    },
  },
  {
    id: "tucano",
    scientificName: "Ramphastos toco",
    image: "/species/tucano-toco.png",
    sightingRate: "90%+",
    aliases: ["tucano", "tucano-toco", "toco toucan", "tucan"],
    season: [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1],
    areas: [AREAS.transpantaneira, AREAS.pixaim],
    text: {
      pt: { name: "Tucano-Toco", category: "AVE ICÔNICA", description: "Com seu bico laranja vibrante, é a ave mais reconhecível do Pantanal, avistada com frequência nas copas das árvores à beira-rio.", details: "O bico do tucano, embora pareça pesado, é extremamente leve pois sua estrutura interna é esponjosa. Ele funciona como um sofisticado regulador térmico, dissipando o calor do corpo em dias quentes. Alimentam-se de frutos, mas também de ovos e filhotes de outras aves." },
      en: { name: "Toco Toucan", category: "ICONIC BIRD", description: "With its bright orange bill it is the Pantanal's most recognizable bird, often seen in treetops along the rivers.", details: "Although it looks heavy, the toucan's bill is very light thanks to its spongy inner structure. It works as a sophisticated heat regulator, releasing body heat on hot days. Toucans eat fruit, but also eggs and chicks of other birds." },
      es: { name: "Tucán Toco", category: "AVE ICÓNICA", description: "Con su pico naranja intenso es el ave más reconocible del Pantanal, vista a menudo en las copas de los árboles junto al río.", details: "Aunque parece pesado, el pico del tucán es muy liviano gracias a su estructura interna esponjosa. Funciona como un regulador térmico que disipa el calor en días calurosos. Come frutos, pero también huevos y pichones de otras aves." },
    },
  },
  {
    id: "cardeal",
    scientificName: "Paroaria coronata",
    image: "/species/cardeal.png",
    sightingRate: "85%+",
    aliases: ["cardeal", "cardeal-de-crista-vermelha", "red-crested cardinal", "cardenal"],
    season: [1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1],
    areas: [AREAS.baraoMelgaco, AREAS.transpantaneira],
    text: {
      pt: { name: "Cardeal-de-crista-vermelha", category: "AVE CANTORA", description: "Reconhecível por seu topete vermelho vibrante contrastando com o peito branco, é presença certa nas margens arborizadas do Pantanal.", details: "Esta pequena ave destaca-se pela crista vermelha pontiaguda e canto melodioso. Vivem em pares ou pequenos bandos familiares e habitam vegetações arbustivas próximas à água, onde alimentam-se de sementes, insetos e pequenos frutos caídos." },
      en: { name: "Red-crested Cardinal", category: "SONGBIRD", description: "Easy to spot thanks to its bright red crest against a white chest, it is a regular along the wooded banks of the Pantanal.", details: "This small bird stands out for its pointed red crest and melodic song. It lives in pairs or small family flocks in shrubby vegetation near water, feeding on seeds, insects and small fallen fruit." },
      es: { name: "Cardenal Común", category: "AVE CANORA", description: "Reconocible por su copete rojo intenso que contrasta con el pecho blanco, es habitual en las orillas arboladas del Pantanal.", details: "Esta pequeña ave se destaca por su cresta roja puntiaguda y su canto melodioso. Vive en parejas o pequeños grupos familiares en vegetación arbustiva cerca del agua, donde come semillas, insectos y frutos caídos." },
    },
  },
  {
    id: "arara",
    scientificName: "Ara ararauna",
    image: "/species/arara-caninde.png",
    sightingRate: "95%+",
    aliases: ["arara", "arara-caninde", "caninde", "arara caninde", "blue-and-yellow macaw", "guacamayo"],
    season: [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1],
    areas: [AREAS.transpantaneira, AREAS.pixaim],
    text: {
      pt: { name: "Arara-Canindé", category: "AVE ICÔNICA", description: "Com plumagem azul e amarela vibrante, voa em casais que permanecem juntos por toda a vida, um símbolo de fidelidade na natureza pantaneira.", details: "As araras-canindé utilizam seus bicos fortes como um terceiro membro para escaladas e para quebrar sementes duras de palmeiras. Elas nidificam em troncos ocos de palmeiras mortas e o casal divide todas as tarefas de cuidado com os ovos e filhotes." },
      en: { name: "Blue-and-yellow Macaw", category: "ICONIC BIRD", description: "With vivid blue and yellow plumage, it flies in pairs that stay together for life — a symbol of loyalty in the Pantanal.", details: "Macaws use their strong bills as a third limb for climbing and to crack hard palm seeds. They nest in hollow trunks of dead palms, and both partners share every task of caring for eggs and chicks." },
      es: { name: "Guacamayo Azulamarillo", category: "AVE ICÓNICA", description: "De plumaje azul y amarillo intenso, vuela en parejas que permanecen juntas toda la vida: un símbolo de fidelidad en el Pantanal.", details: "Usan su fuerte pico como un tercer miembro para trepar y romper semillas duras de palmeras. Anidan en troncos huecos de palmeras muertas y la pareja comparte todo el cuidado de huevos y pichones." },
    },
  },
  {
    id: "onca",
    scientificName: "Panthera onca",
    image: "/species/onca-pintada.png",
    sightingRate: "95%+",
    aliases: ["onca", "onca-pintada", "onca pintada", "jaguar"],
    season: [0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 1, 0],
    areas: [AREAS.portoJofre, AREAS.tresIrmaos],
    text: {
      pt: { name: "Onça-Pintada", category: "PREDADOR TOPO", description: "A rainha indiscutível do Pantanal, observada espreitando entre a folhagem densa — o avistamento mais desejado de toda expedição.", details: "A onça-pintada é o maior felino das Américas. No Pantanal, devido à abundância de presas e proteção estrita, elas atingem quase o dobro do peso de suas parentes amazônicas. São excelentes nadadoras e caçam jacarés e capivaras diretamente nas margens dos rios." },
      en: { name: "Jaguar", category: "APEX PREDATOR", description: "The undisputed queen of the Pantanal, seen stalking through dense foliage — the most wanted sighting of any expedition.", details: "The jaguar is the largest cat in the Americas. In the Pantanal, with plenty of prey and strict protection, they reach almost twice the weight of their Amazon relatives. They are excellent swimmers and hunt caimans and capybaras right on the riverbanks." },
      es: { name: "Jaguar", category: "DEPREDADOR TOPE", description: "La reina indiscutida del Pantanal, observada acechando entre el follaje denso: el avistamiento más deseado de toda expedición.", details: "El jaguar es el felino más grande de América. En el Pantanal, por la abundancia de presas y la protección estricta, alcanza casi el doble de peso que sus parientes amazónicos. Es un excelente nadador y caza yacarés y carpinchos en las mismas orillas." },
    },
  },
  {
    id: "coruja",
    scientificName: "Athene cunicularia",
    image: "/species/coruja-buraqueira.png",
    sightingRate: "90%+",
    aliases: ["coruja", "coruja-buraqueira", "coruja buraqueira", "burrowing owl", "lechucita"],
    season: [1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1],
    areas: [AREAS.poconeCampos, AREAS.transpantaneira],
    text: {
      pt: { name: "Coruja-Buraqueira", category: "AVE NOTURNA", description: "Ao contrário da maioria das corujas, é ativa também durante o dia e vive em tocas no chão, observando o campo com seus olhos amarelos atentos.", details: "As corujas-buraqueiras escavam seus próprios ninhos no solo ou aproveitam buracos abandonados de tatu. Elas acumulam esterco ao redor de suas tocas para atrair besouros, que servem de alimento fácil, demonstrando um comportamento incrivelmente astuto de uso de ferramentas." },
      en: { name: "Burrowing Owl", category: "NOCTURNAL BIRD", description: "Unlike most owls it is also active by day and lives in burrows in the ground, watching the fields with sharp yellow eyes.", details: "Burrowing owls dig their own nests or reuse abandoned armadillo holes. They pile dung around the burrow to attract beetles — easy food — a remarkably clever form of tool use." },
      es: { name: "Lechucita Vizcachera", category: "AVE NOCTURNA", description: "A diferencia de la mayoría de los búhos, también está activa de día y vive en madrigueras en el suelo, vigilando el campo con sus ojos amarillos.", details: "Excava sus propios nidos o aprovecha cuevas abandonadas de armadillo. Acumula estiércol alrededor de la madriguera para atraer escarabajos, alimento fácil: un uso de herramientas sorprendentemente astuto." },
    },
  },
  {
    id: "curicaca",
    scientificName: "Theristicus caudatus",
    image: "/species/curicaca.png",
    sightingRate: "95%+",
    aliases: ["curicaca", "buff-necked ibis", "bandurria"],
    season: [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1],
    areas: [AREAS.transpantaneira, AREAS.caceres],
    text: {
      pt: { name: "Curicaca", category: "AVE RÚSTICA", description: "De canto forte e característico ao amanhecer, é vista em campos abertos e praias fluviais com seu bico longo e curvado perfeito para alimentação.", details: "A curicaca possui um grito metálico muito alto e inconfundível, frequentemente ouvido no raiar do dia. Seu bico longo e curvado é perfeitamente adaptado para sondar o solo úmido e lodo em busca de insetos, aranhas, anfíbios e pequenos répteis." },
      en: { name: "Buff-necked Ibis", category: "GRASSLAND BIRD", description: "With a loud, distinctive call at dawn, it is seen in open fields and on river beaches, probing with its long curved bill.", details: "The buff-necked ibis has a very loud metallic call, often heard at daybreak. Its long curved bill is perfectly adapted to probe wet soil and mud for insects, spiders, amphibians and small reptiles." },
      es: { name: "Bandurria Mora", category: "AVE DE CAMPO", description: "De canto fuerte y característico al amanecer, se la ve en campos abiertos y playas de río con su largo pico curvo.", details: "La bandurria tiene un grito metálico muy fuerte e inconfundible, que suele oírse al amanecer. Su pico largo y curvo está adaptado para sondear el suelo húmedo y el barro en busca de insectos, arañas, anfibios y pequeños reptiles." },
    },
  },
];

const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Casa uma espécie cadastrada no banco (nome livre) com o conteúdo daqui —
// é assim que espécies do admin ganham calendário e áreas no mapa.
export function findWildSpecies(nameOrId: string): WildSpeciesInfo | undefined {
  const n = normalize(nameOrId);
  return WILD_SPECIES.find(s => s.id === n || s.aliases.some(a => normalize(a) === n) || normalize(s.text.pt.name) === n);
}

// Mês (1–12) mais próximo, a partir de hoje, com nível "pico" (ou "boa",
// se a espécie não tiver pico).
export function nextBestMonth(season: SeasonLevel[], from = new Date()): { year: number; month: number } {
  const target = season.includes(2) ? 2 : 1;
  for (let i = 0; i < 12; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
    if (season[d.getMonth()] === target) return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }
  return { year: from.getFullYear(), month: from.getMonth() + 1 };
}
