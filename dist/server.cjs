var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server.ts
var server_exports = {};
__export(server_exports, {
  default: () => server_default
});
module.exports = __toCommonJS(server_exports);
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_googleapis = require("googleapis");
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
var import_supabase_js = require("@supabase/supabase-js");
var import_stripe = __toESM(require("stripe"), 1);
var import_resend = require("resend");
var import_pdfkit = __toESM(require("pdfkit"), 1);

// src/lib/slug.ts
function slugify(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// server.ts
import_dotenv.default.config();
var app = (0, import_express.default)();
app.use(import_express.default.json());
var PORT = process.env.PORT ? Number(process.env.PORT) : 3e3;
var isProd = process.env.NODE_ENV === "production";
var distPath = import_path.default.join(process.cwd(), "dist");
var dataSyncPromise = null;
function ensureDataSynced() {
  if (!dataSyncPromise) {
    dataSyncPromise = syncFromSupabase().catch((err) => {
      console.error("Falha ao sincronizar com o Supabase:", err);
    });
  }
  return dataSyncPromise;
}
app.use((req, res, next) => {
  ensureDataSynced().then(() => next(), next);
});
var viteDevServer = null;
var SUPABASE_URL = process.env.SUPABASE_URL || "https://yqgyjfcygulolwxcuwow.supabase.co";
var SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxZ3lqZmN5Z3Vsb2x3eGN1d293Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjM5NTMsImV4cCI6MjA5ODkzOTk1M30.GkjTJNzqK85Lftzy-g9aPBJ5D7x8utMiqJXBT-ACJIg";
var SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
var supabase = SUPABASE_SERVICE_ROLE_KEY ? (0, import_supabase_js.createClient)(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : (0, import_supabase_js.createClient)(SUPABASE_URL, SUPABASE_ANON_KEY);
if (SUPABASE_SERVICE_ROLE_KEY) {
  console.log("Supabase: usando service_role key (RLS bypassada para o backend confi\xE1vel).");
} else {
  console.warn("Supabase: SUPABASE_SERVICE_ROLE_KEY n\xE3o configurada \u2014 usando anon key. Tabelas com RLS restrita ficar\xE3o inacess\xEDveis ao backend at\xE9 essa chave ser definida.");
}
var supabaseAdminAuth = SUPABASE_SERVICE_ROLE_KEY ? (0, import_supabase_js.createClient)(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Autentica\xE7\xE3o necess\xE1ria." });
  }
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user || data.user.app_metadata?.role !== "admin") {
      return res.status(403).json({ error: "Acesso restrito a administradores." });
    }
    next();
  } catch (err) {
    res.status(401).json({ error: "Token inv\xE1lido." });
  }
}
var GEMINI_API_KEY = process.env.GEMINI_API_KEY;
var ai = null;
if (GEMINI_API_KEY && GEMINI_API_KEY !== "MY_GEMINI_API_KEY") {
  try {
    ai = new import_genai.GoogleGenAI({
      apiKey: GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
    console.log("Gemini API initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize Gemini client:", err);
  }
}
var STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
var stripe = null;
if (STRIPE_SECRET_KEY && STRIPE_SECRET_KEY !== "MY_STRIPE_SECRET_KEY") {
  try {
    stripe = new import_stripe.default(STRIPE_SECRET_KEY);
    console.log("Stripe initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize Stripe client:", err);
  }
}
var RESEND_API_KEY = process.env.RESEND_API_KEY;
var resend = null;
if (RESEND_API_KEY && RESEND_API_KEY !== "MY_RESEND_API_KEY") {
  try {
    resend = new import_resend.Resend(RESEND_API_KEY);
    console.log("Resend initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize Resend client:", err);
  }
}
var DEFAULT_POUSADAS = [
  {
    id: "1",
    name: "Araras Eco Lodge",
    description: "Um ref\xFAgio r\xFAstico e sofisticado no cora\xE7\xE3o do Pantanal Norte, focado em conserva\xE7\xE3o e imers\xE3o ecol\xF3gica.",
    longDescription: "A Araras Eco Lodge foi constru\xEDda em harmonia com o ambiente, oferecendo uma experi\xEAncia \xFAnica no Pantanal. Com foco na sustentabilidade, a pousada desenvolve projetos de preserva\xE7\xE3o e permite que os h\xF3spedes observem a biodiversidade pantaneira bem de perto, acompanhados de guias altamente qualificados.",
    location: "Pantanal Norte, Mato Grosso",
    rating: 4.9,
    pricePerNight: 1800,
    images: [
      "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80"
    ],
    features: ["Wi-Fi", "Piscina Ecol\xF3gica", "Ar Condicionado", "Restaurante Regional", "Torre de Observa\xE7\xE3o"],
    activities: ["Focagem Noturna de Jacar\xE9s", "Saf\xE1ri Fotogr\xE1fico", "Canoagem no Rio", "Cavalgada Pantaneira"],
    experiences: [
      { title: "Saf\xE1ri On\xE7a-Pintada", description: "Saf\xE1ri fotogr\xE1fico em jipe aberto ou barco em busca da rainha do Pantanal.", price: 450 },
      { title: "Observa\xE7\xE3o de Jacar\xE9s", description: "Caminhada suspensa e focagem noturna nos olhos avermelhados dos jacar\xE9s.", price: 200 }
    ],
    capacity: 12
  },
  {
    id: "2",
    name: "Pousada Trijun\xE7\xE3o",
    description: "Vivencie o fascinante e misterioso Cerrado brasileiro na divisa de tr\xEAs estados, onde o luxo encontra a preserva\xE7\xE3o.",
    longDescription: "Localizada na divisa entre Bahia, Goi\xE1s e Minas Gerais, a Pousada Trijun\xE7\xE3o oferece acomoda\xE7\xF5es de alt\xEDssimo padr\xE3o e expedi\xE7\xF5es cient\xEDficas para conhecer a fauna e a flora do Cerrado, incluindo o lobo-guar\xE1 e o pato-mergulh\xE3o.",
    location: "Divisa BA / GO / MG, Cerrado",
    rating: 4.8,
    pricePerNight: 2400,
    images: [
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=800&q=80"
    ],
    features: ["Piscina Aquecida", "Jacuzzi Externa", "Pens\xE3o Completa", "Ar Condicionado", "Mirante Estelar"],
    activities: ["Rastreamento de Lobo-Guar\xE1", "Saf\xE1ri Noturno com Vis\xE3o T\xE9rmica", "Trilha das Tr\xEAs Divisas", "Caiaque na Lagoa das Marreca"],
    experiences: [
      { title: "Rastreamento do Lobo-Guar\xE1", description: "Expedi\xE7\xE3o cient\xEDfica para buscar lobos-guar\xE1s com r\xE1dio-colar.", price: 500 },
      { title: "Saf\xE1ri Noturno de Biodiversidade", description: "Uso de lanternas t\xE9rmicas para ver tamandu\xE1s-bandeira e lobos.", price: 350 }
    ],
    capacity: 8
  },
  {
    id: "3",
    name: "Anavilhanas Jungle Lodge",
    description: "Um hotel de selva exclusivo e intimista na margem do Rio Negro, em frente ao maior arquip\xE9lago fluvial do mundo.",
    longDescription: "Projetada para causar o m\xEDnimo impacto ecol\xF3gico, a pousada combina eleg\xE2ncia r\xFAstica com a exuber\xE2ncia da Floresta Amaz\xF4nica. Com bangal\xF4s suspensos em palafitas no meio da mata, os h\xF3spedes acordam com os sons dos p\xE1ssaros e desfrutam da alta gastronomia amaz\xF4nica.",
    location: "Novo Air\xE3o, Amaz\xF4nia (Rio Negro)",
    rating: 5,
    pricePerNight: 3200,
    images: [
      "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80"
    ],
    features: ["Piscina com borda infinita para o Rio Negro", "Bangal\xF4s de luxo", "Ar Condicionado", "Deck de Contempla\xE7\xE3o", "Bar Flutuante"],
    activities: ["Visita aos Botos Cor-de-Rosa", "Focagem de Jacar\xE9s e Animais Noturnos", "Canoagem nos Igap\xF3s", "Trekking de Sobreviv\xEAncia na Selva"],
    experiences: [
      { title: "Intera\xE7\xE3o com Botos", description: "Visita \xE9tica monitorada para avistamento e intera\xE7\xE3o com os botos-cor-de-rosa livres.", price: 300 },
      { title: "Caminhada de Sobreviv\xEAncia", description: "Instru\xE7\xE3o de sobreviv\xEAncia na floresta prim\xE1ria com guia nativo.", price: 400 }
    ],
    capacity: 15
  },
  {
    id: "4",
    name: "Pousada do Cerrado (Jalap\xE3o)",
    description: "A base perfeita para explorar as \xE1guas azuis cristalinas dos fervedouros e as dunas douradas do Jalap\xE3o.",
    longDescription: "Aconchegante e focada na cultura local, a Pousada do Cerrado oferece conforto ap\xF3s longas expedi\xE7\xF5es de 4x4 pelos fervedouros, c\xE2nions e dunas do Jalap\xE3o, proporcionando jantares caseiros ao redor da fogueira.",
    location: "Mateiros, Jalap\xE3o, Tocantins",
    rating: 4.7,
    pricePerNight: 1200,
    images: [
      "https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=800&q=80"
    ],
    features: ["Ar Condicionado", "Fogueira Sob as Estrelas", "Comida Caseira Fog\xE3o a Lenha", "Ducha Externa", "Estacionamento 4x4"],
    activities: ["Banho nos Fervedouros", "P\xF4r do sol nas Dunas", "Rafting no Rio Novo", "Trilha da Serra do Esp\xEDrito Santo"],
    experiences: [
      { title: "Expedi\xE7\xE3o Fervedouros Noturna", description: "Acesso exclusivo e agendado a fervedouros iluminados sob as estrelas.", price: 150 },
      { title: "P\xF4r do sol nas Dunas", description: "Transporte e guia para as dunas de areia dourada na hora dourada.", price: 180 }
    ],
    capacity: 20
  },
  {
    id: "5",
    name: "Ref\xFAgio Ecol\xF3gico Caiman",
    description: "Pioneiro no ecoturismo do Pantanal Sul, lar do renomado Projeto On\xE7afari de conserva\xE7\xE3o de on\xE7as-pintadas.",
    longDescription: "O Ref\xFAgio Ecol\xF3gico Caiman estende-se por uma \xE1rea de 53 mil hectares no Pantanal Sul. Al\xE9m de oferecer hospedagem de alt\xEDssimo padr\xE3o com culin\xE1ria pantaneira aut\xEAntica, \xE9 a base operacional do Projeto On\xE7afari. Os h\xF3spedes t\xEAm a oportunidade \xFAnica de acompanhar bi\xF3logos em campo e vivenciar de perto o rastreamento de on\xE7as habituadas e lobos-guar\xE1.",
    location: "Pantanal Sul, Mato Grosso do Sul",
    rating: 4.9,
    pricePerNight: 2900,
    images: [
      "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&w=800&q=80"
    ],
    features: ["Wi-Fi de Alta Velocidade", "Piscina Panor\xE2mica", "Ar Condicionado", "Biblioteca Cient\xEDfica", "Pens\xE3o Completa Gourmet"],
    activities: ["Rastreamento de On\xE7as (On\xE7afari)", "Saf\xE1ri Noturno de Jipe", "Canoagem no Rio Aquidauana", "Caminhada de Interpreta\xE7\xE3o Ambiental"],
    experiences: [
      { title: "Dia de Pesquisador On\xE7afari", description: "Acompanhe cientistas do Projeto On\xE7afari no monitoramento de on\xE7as-pintadas com telemetria.", price: 650 },
      { title: "Cavalgada pelos Alagados", description: "Explore \xE1reas de dif\xEDcil acesso montado em cavalos pantaneiros treinados.", price: 300 }
    ],
    capacity: 10
  },
  {
    id: "6",
    name: "Cristalino Lodge",
    description: "Um dos melhores hot\xE9is ecol\xF3gicos do mundo, inserido em uma vasta reserva particular na Floresta Amaz\xF4nica.",
    longDescription: "Localizado no sul da Amaz\xF4nia brasileira, o Cristalino Lodge est\xE1 situado em uma Reserva Particular do Patrim\xF4nio Natural (RPPN) de 11.399 hectares. Conhecido internacionalmente pelo design sustent\xE1vel e pelas torres de observa\xE7\xE3o de 50 metros que sobressaem da copa das \xE1rvores, o lodge oferece acesso inigual\xE1vel \xE0 avifauna e fauna amaz\xF4nica.",
    location: "Alta Floresta, Amaz\xF4nia Meridional",
    rating: 4.9,
    pricePerNight: 2600,
    images: [
      "https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=800&q=80"
    ],
    features: ["Torres de Observa\xE7\xE3o (50m)", "Deck Flutuante no Rio Cristalino", "Energia Solar Integrada", "Restaurante Org\xE2nico", "Acomoda\xE7\xF5es Ventiladas Ecologicamente"],
    activities: ["Observa\xE7\xE3o de Aves do Dossel", "Canoagem no Rio Cristalino", "Trilha Ecol\xF3gica da Castanheira", "Focagem de Fauna Aqu\xE1tica Noturna"],
    experiences: [
      { title: "Amanhecer na Torre de Observa\xE7\xE3o", description: "Suba na torre de 50 metros antes do amanhecer para observar a floresta acordando acima das nuvens.", price: 250 },
      { title: "Trilha Bot\xE2nica Guiada", description: "Aprenda sobre \xE1rvores gigantescas, plantas medicinais e insetos raros com bi\xF3logos residentes.", price: 150 }
    ],
    capacity: 18
  },
  {
    id: "7",
    name: "Pousada Canto das \xC1guas",
    description: "Hospedagem sustent\xE1vel \xE0s margens do Rio Len\xE7\xF3is, a base perfeita para desvendar as cachoeiras da Chapada Diamantina.",
    longDescription: "Constru\xEDda de forma integrada \xE0 natureza, a Pousada Canto das \xC1guas \xE9 o primeiro hotel do Brasil a obter a certifica\xE7\xE3o de sustentabilidade da ABNT. Localizada em Len\xE7\xF3is, na Chapada Diamantina, seus jardins sinuosos acompanham as curvas do rio, oferecendo um o\xE1sis de tranquilidade ap\xF3s um dia inteiro de caminhadas por c\xE2nions e cachoeiras espetaculares.",
    location: "Len\xE7\xF3is, Chapada Diamantina, Bahia",
    rating: 4.8,
    pricePerNight: 1500,
    images: [
      "https://images.unsplash.com/photo-1432406186267-30a30b27ae27?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80"
    ],
    features: ["Jardins Paisag\xEDsticos de Burle Marx", "Piscina de \xC1gua Corrente", "Restaurante de Cozinha Autoral", "Espa\xE7o de Massagem e Medita\xE7\xE3o", "Selo de Sustentabilidade ABNT"],
    activities: ["Trilha ao C\xE2nion do Mixila", "Visita \xE0 Cachoeira da Fuma\xE7a", "Flutua\xE7\xE3o no Po\xE7o Azul", "P\xF4r do sol no Pai In\xE1cio"],
    experiences: [
      { title: "Trilha Exclusiva Cachoeira do Sossego", description: "Caminhada guiada pelo leito de pedras do rio at\xE9 a imponente cachoeira e po\xE7o para banho.", price: 220 },
      { title: "Medita\xE7\xE3o e Yoga ao Som do Rio", description: "Sess\xE3o matinal particular conduzida no deck do rio com ch\xE1 de ervas locais.", price: 120 }
    ],
    capacity: 22
  }
];
var DEFAULT_SPECIES = [
  {
    id: "capivara",
    name: "Capivara",
    scientificName: "Hydrochoerus hydrochaeris",
    category: "MAM\xCDFERO TERRESTRE",
    description: "O maior roedor do mundo vive harmoniosamente em grandes grupos familiares ao longo das margens ensolaradas do Rio Cuiab\xE1.",
    details: "As capivaras s\xE3o animais extremamente soci\xE1veis e excelentes nadadoras. No Pantanal, elas desempenham um papel crucial no ecossistema, servindo como uma das principais presas para jacar\xE9s e on\xE7as-pintadas. Podem permanecer submersas por at\xE9 5 minutos para escapar de predadores.",
    sightings: "95%+ AVISTAMENTOS",
    image: "/species/capivara.png",
    bestPousadaId: "1",
    bestPousadaName: "Araras Eco Lodge"
  },
  {
    id: "jacare",
    name: "Jacar\xE9-do-Pantanal",
    scientificName: "Caiman yacare",
    category: "R\xC9PTIL PREDADOR",
    description: "Soberano das \xE1guas calmas, \xE9 comumente visto regulando sua temperatura sob o sol quente nas praias de areia branca.",
    details: "O jacar\xE9-do-pantanal alimenta-se principalmente de peixes e moluscos. Ap\xF3s quase serem extintos devido \xE0 ca\xE7a ilegal nas d\xE9cadas de 1970 e 1980, hoje a population est\xE1 totalmente recuperada e estimada em milh\xF5es de indiv\xEDduos, sendo um dos maiores casos de sucesso em conserva\xE7\xE3o ambiental no Brasil.",
    sightings: "95%+ AVISTAMENTOS",
    image: "/species/jacare-do-pantanal.png",
    bestPousadaId: "1",
    bestPousadaName: "Araras Eco Lodge"
  },
  {
    id: "tucano",
    name: "Tucano-Toco",
    scientificName: "Ramphastos toco",
    category: "AVE IC\xD4NICA",
    description: "Com seu bico laranja vibrante, \xE9 a ave mais reconhec\xEDvel do Pantanal, avistada com frequ\xEAncia nas copas das \xE1rvores \xE0 beira-rio.",
    details: "O bico do tucano, embora pare\xE7a pesado, \xE9 extremamente leve pois sua estrutura interna \xE9 esponjosa. Ele funciona como um sofisticado regulador t\xE9rmico, dissipando o calor do corpo em dias quentes. Alimentam-se de frutos, mas tamb\xE9m de ovos e filhotes de outras aves.",
    sightings: "90%+ AVISTAMENTOS",
    image: "/species/tucano-toco.png",
    bestPousadaId: "6",
    bestPousadaName: "Cristalino Lodge"
  },
  {
    id: "cardeal",
    name: "Cardeal-de-crista-vermelha",
    scientificName: "Paroaria coronata",
    category: "AVE CANTORA",
    description: "Reconhec\xEDvel por seu topete vermelho vibrante contrastando com o peito branco, \xE9 presen\xE7a certa nas margens arborizadas do Pantanal.",
    details: "Esta pequena ave destaca-se pela crista vermelha pontiaguda e canto melodioso. Vivem em pares ou pequenos bandos familiares e habitam vegeta\xE7\xF5es arbustivas pr\xF3ximas \xE0 \xE1gua, onde alimentam-se de sementes, insetos e pequenos frutos ca\xEDdos.",
    sightings: "85%+ AVISTAMENTOS",
    image: "/species/cardeal.png",
    bestPousadaId: "1",
    bestPousadaName: "Araras Eco Lodge"
  },
  {
    id: "arara",
    name: "Arara-Canind\xE9",
    scientificName: "Ara ararauna",
    category: "AVE IC\xD4NICA",
    description: "Com plumagem azul e amarela vibrante, voa em casais que permanecem juntos por toda a vida, um s\xEDmbolo de fidelidade na natureza pantaneira.",
    details: "As araras-canind\xE9 utilizam seus bicos fortes como um terceiro membro para escaladas e para quebrar sementes duras de palmeiras. Elas nidificam em troncos ocos de palmeiras mortas e o casal divide todas as tarefas de cuidado com os ovos e filhotes.",
    sightings: "95%+ AVISTAMENTOS",
    image: "/species/arara-caninde.png",
    bestPousadaId: "5",
    bestPousadaName: "Ref\xFAgio Ecol\xF3gico Caiman"
  },
  {
    id: "onca",
    name: "On\xE7a-Pintada",
    scientificName: "Panthera onca",
    category: "PREDADOR TOPO",
    description: "A rainha indiscut\xEDvel do Pantanal, observada espreitando entre a folhagem densa \u2014 o avistamento mais desejado de toda expedi\xE7\xE3o.",
    details: "A on\xE7a-pintada \xE9 o maior felino das Am\xE9ricas. No Pantanal, devido \xE0 abund\xE2ncia de presas e prote\xE7\xE3o estrita, elas atingem quase o dobro do peso de suas parentes amaz\xF4nicas. S\xE3o excelentes nadadoras e ca\xE7am jacar\xE9s e capivaras diretamente nas margens dos rios.",
    sightings: "95%+ AVISTAMENTOS",
    image: "/species/onca-pintada.png",
    bestPousadaId: "5",
    bestPousadaName: "Ref\xFAgio Ecol\xF3gico Caiman"
  },
  {
    id: "coruja",
    name: "Coruja-Buraqueira",
    scientificName: "Athene cunicularia",
    category: "AVE NOTURNA",
    description: "Ao contr\xE1rio da maioria das corujas, \xE9 ativa tamb\xE9m durante o dia e vive em tocas no ch\xE3o, observando o campo com seus olhos amarelos atentos.",
    details: "As corujas-buraqueiras escavam seus pr\xF3prios ninhos no solo ou aproveitam buracos abandonados de tatu. Elas acumulam esterco ao redor de suas tocas para atrair besouros, que servem de alimento f\xE1cil, demonstrando um comportamento incrivelmente astuto de uso de ferramentas.",
    sightings: "90%+ AVISTAMENTOS",
    image: "/species/coruja-buraqueira.png",
    bestPousadaId: "7",
    bestPousadaName: "Pousada Canto das \xC1guas"
  },
  {
    id: "curicaca",
    name: "Curicaca",
    scientificName: "Theristicus caudatus",
    category: "AVE R\xDASTICA",
    description: "De canto forte e caracter\xEDstico ao amanhecer, \xE9 vista em campos abertos e praias fluviais com seu bico longo e curvado perfeito para alimenta\xE7\xE3o.",
    details: "A curicaca possui um grito met\xE1lico muito alto e inconfund\xEDvel, frequentemente ouvido no raiar do dia. Seu bico longo e curvado \xE9 perfeitamente adaptado para sondar o solo \xFAmido e lodo em busca de insetos, aranhas, anf\xEDbios e pequenos r\xE9pteis.",
    sightings: "95%+ AVISTAMENTOS",
    image: "/species/curicaca.png",
    bestPousadaId: "1",
    bestPousadaName: "Araras Eco Lodge"
  }
];
var pousadas = [...DEFAULT_POUSADAS];
var species = [...DEFAULT_SPECIES];
var guides = [
  { id: "g1", name: "Carlos Silva", languages: ["Portugu\xEAs", "Ingl\xEAs"], specialty: ["Rastreamento de On\xE7a-pintada", "Saf\xE1ris de Jipe"], status: "disponivel", email: "carlos.guiapantanal@gmail.com", phone: "+55 65 99912-3456" },
  { id: "g2", name: "Elena Torres", languages: ["Portugu\xEAs", "Espanhol", "Ingl\xEAs"], specialty: ["Observa\xE7\xE3o de Aves (Ornitologia)", "Identifica\xE7\xE3o de Anf\xEDbios"], status: "disponivel", email: "elena.bioguia@hotmail.com", phone: "+55 61 98821-4321" },
  { id: "g3", name: "Thiago Rocha", languages: ["Portugu\xEAs", "Franc\xEAs"], specialty: ["Trilhas de Sobreviv\xEAncia na Selva", "Canoagem"], status: "disponivel", email: "thiago.amazonguide@yahoo.com", phone: "+55 92 98115-9988" },
  { id: "g4", name: "Sofia Almeida", languages: ["Portugu\xEAs", "Ingl\xEAs", "Alem\xE3o"], specialty: ["Fotografia de Natureza", "Bot\xE2nica Aplicada"], status: "disponivel", email: "sofia.photo.guide@gmail.com", phone: "+55 63 99201-1122" }
];
var bookings = [
  {
    id: "b1",
    pousadaId: "1",
    pousadaName: "Araras Eco Lodge",
    customerName: "Mariana Souza",
    customerEmail: "mariana.souza@gmail.com",
    customerPhone: "+55 11 98765-4321",
    nationality: "Brasileira",
    adults: 2,
    children: 1,
    childAges: "8 anos",
    dietaryRestrictions: "Vegetariana",
    specialNeeds: "Nenhuma",
    checkIn: "2026-07-20",
    checkOut: "2026-07-25",
    experienceType: "Saf\xE1ri On\xE7a-Pintada",
    totalPrice: 9450,
    // 5 noites * 1800 + 450 exp
    status: "confirmado_total",
    guideId: "g1",
    guideName: "Carlos Silva",
    dateCreated: "2026-07-10T14:30:00.000Z",
    googleCalendarEventId: "gc_event_b1"
  },
  {
    id: "b2",
    pousadaId: "3",
    pousadaName: "Anavilhanas Jungle Lodge",
    customerName: "John Doe",
    customerEmail: "john.doe@gmail.com",
    customerPhone: "+1 202-555-0143",
    nationality: "Norte-Americano",
    adults: 2,
    children: 0,
    dietaryRestrictions: "Nenhuma",
    specialNeeds: "Nenhuma",
    checkIn: "2026-08-01",
    checkOut: "2026-08-04",
    experienceType: "Intera\xE7\xE3o com Botos",
    totalPrice: 9900,
    // 3 noites * 3200 + 300 exp
    status: "pago",
    dateCreated: "2026-07-14T09:15:00.000Z"
  }
];
var reviews = [
  { id: "r1", pousadaId: "1", userName: "Fernanda Lima", rating: 5, comment: "Uma experi\xEAncia extraordin\xE1ria! Vimos a on\xE7a-pintada no primeiro dia de saf\xE1ri com o guia Carlos. A comida \xE9 deliciosa e as passarelas suspensas s\xE3o incr\xEDveis.", date: "2026-06-15" },
  { id: "r2", pousadaId: "1", userName: "Marcus Schmidt", rating: 4.8, comment: "Excelente infraestrutura sustent\xE1vel. \xC9 fascinante acordar cercado por araras-azuis e tuiui\xFAs.", date: "2026-06-20" },
  { id: "r3", pousadaId: "3", userName: "Ana Paula Silva", rating: 5, comment: "O melhor hotel de selva que j\xE1 visitei. Os bangal\xF4s t\xEAm uma vista incr\xEDvel e o atendimento \xE9 impec\xE1vel. Nadar pr\xF3ximo aos botos foi inesquec\xEDvel.", date: "2026-07-01" }
];
var sightings = [
  { id: "s1", pousadaId: "1", pousadaName: "Araras Eco Lodge", userName: "Bruno Rezende", animalName: "On\xE7a-Pintada (Panthera onca)", imageUrl: "https://images.unsplash.com/photo-1575550959106-5a7defe28b56?auto=format&fit=crop&w=600&q=80", location: "Rio Clarinho, Pantanal", timestamp: "2026-07-15T10:00:00.000Z", likes: 24 },
  { id: "s2", pousadaId: "2", pousadaName: "Pousada Trijun\xE7\xE3o", userName: "Leticia Castro", animalName: "Lobo-Guar\xE1 (Chrysocyon brachyurus)", imageUrl: "https://images.unsplash.com/photo-1590005354167-6da97870c913?auto=format&fit=crop&w=600&q=80", location: "Veredas das Tr\xEAs Divisas", timestamp: "2026-07-14T18:40:00.000Z", likes: 18 },
  { id: "s3", pousadaId: "3", pousadaName: "Anavilhanas Jungle Lodge", userName: "Alice Dupont", animalName: "Boto-Cor-de-Rosa (Inia geoffrensis)", imageUrl: "https://images.unsplash.com/photo-1550411294-b3b1bd5fce12?auto=format&fit=crop&w=600&q=80", location: "Margens do Rio Negro", timestamp: "2026-07-13T14:20:00.000Z", likes: 32 }
];
var notifications = [
  { id: "n1", target: "admin", message: "Nova reserva criada para Mariana Souza na Araras Eco Lodge.", type: "booking_new", timestamp: "2026-07-10T14:30:00.000Z", read: true, bookingId: "b1" },
  { id: "n2", target: "admin", message: "Pagamento confirmado para a reserva de John Doe na Anavilhanas Jungle Lodge.", type: "payment_received", timestamp: "2026-07-14T09:15:00.000Z", read: false, bookingId: "b2" }
];
var turistas = [
  { id: "t1", name: "Mariana Souza", email: "mariana.souza@gmail.com", whatsapp: "+55 11 98765-4321", country: "Brasil", age: 34, preferences: "Observa\xE7\xE3o de aves, fotografia de natureza" },
  { id: "t2", name: "John Doe", email: "john.doe@gmail.com", whatsapp: "+1 202-555-0143", country: "Estados Unidos", age: 41, preferences: "Saf\xE1ri fotogr\xE1fico, trilhas" }
];
var roteiros = [
  { id: "rt1", name: "Saf\xE1ri Fotogr\xE1fico da On\xE7a-Pintada", duration: "5 dias / 4 noites", price: 4500, difficulty: "moderado", capacity: 8, description: "Expedi\xE7\xE3o di\xE1ria de jipe e barco em busca da on\xE7a-pintada no Pantanal Norte, com guias especializados em rastreamento." },
  { id: "rt2", name: "Trilha do Lobo-Guar\xE1 no Cerrado", duration: "3 dias / 2 noites", price: 2200, difficulty: "facil", capacity: 12, description: "Caminhadas guiadas pelas veredas do Cerrado em busca do lobo-guar\xE1 e outras esp\xE9cies end\xEAmicas." },
  { id: "rt3", name: "Imers\xE3o na Selva Amaz\xF4nica", duration: "6 dias / 5 noites", price: 5800, difficulty: "dificil", capacity: 6, description: "Canoagem, trilhas de selva e observa\xE7\xE3o de botos cor-de-rosa nas margens do Rio Negro." }
];
var reservas = [
  { id: "rv1", turistaId: "t1", roteiroId: "rt1", date: "2026-07-20", status: "confirmada", totalPrice: 4500 },
  { id: "rv2", turistaId: "t2", roteiroId: "rt3", date: "2026-08-01", status: "pendente", totalPrice: 5800 }
];
var pagamentos = [
  { id: "pg1", reservaId: "rv1", amount: 4500, date: "2026-07-10", method: "pix", status: "aprovado" },
  { id: "pg2", reservaId: "rv2", amount: 2900, date: "2026-07-14", method: "cartao", status: "pendente" }
];
var guiasTuristicos = [
  { id: "gt1", name: "Carlos Silva", specialty: "Rastreamento de On\xE7a-Pintada", phone: "+55 65 99912-3456", availability: true, rating: 4.9 },
  { id: "gt2", name: "Elena Torres", specialty: "Observa\xE7\xE3o de Aves", phone: "+55 61 98821-4321", availability: true, rating: 4.8 },
  { id: "gt3", name: "Thiago Rocha", specialty: "Trilhas na Selva Amaz\xF4nica", phone: "+55 92 98115-9988", availability: false, rating: 4.7 }
];
var candidaturas = [];
var referralSources = [];
function addNotification(target, message, type, bookingId) {
  const newNotif = {
    id: `n_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    target,
    message,
    type,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    read: false,
    bookingId
  };
  notifications.unshift(newNotif);
  supabase.from("notifications").insert(newNotif).then(({ error }) => {
    if (error) console.warn("Erro ao salvar notifica\xE7\xE3o no Supabase:", error.message);
  });
}
function resolveTranslation(val, lang = "pt") {
  if (!val) return "";
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === "object") {
        return parsed[lang] || parsed["pt"] || parsed["en"] || parsed["es"] || Object.values(parsed)[0] || val;
      }
    } catch {
      return val;
    }
    return val;
  }
  if (typeof val === "object") {
    return val[lang] || val["pt"] || val["en"] || val["es"] || Object.values(val)[0] || "";
  }
  return String(val);
}
async function syncFromSupabase() {
  console.log("Sincronizando dados com o Supabase...");
  const parseJSONSafe = (val) => {
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    }
    return val;
  };
  try {
    const { data, error } = await supabase.from("pousadas").select("*");
    if (error) throw error;
    if (data && data.length > 0) {
      pousadas = data.map((p) => {
        const rawExperiences = parseJSONSafe(p.experiences) || [];
        const experiencesMapped = Array.isArray(rawExperiences) ? rawExperiences.map((exp) => ({
          title: resolveTranslation(exp.title),
          description: resolveTranslation(exp.description),
          price: typeof exp.price === "number" ? exp.price : parseFloat(exp.price || "0")
        })) : [
          { title: "Saf\xE1ri On\xE7a-Pintada", description: "Saf\xE1ri fotogr\xE1fico em busca da rainha do Pantanal.", price: 450 }
        ];
        return {
          id: p.id,
          name: resolveTranslation(p.name) || "Araras Eco Lodge",
          description: resolveTranslation(p.description) || "Um ref\xFAgio r\xFAstico e sofisticado no cora\xE7\xE3o do Pantanal Norte.",
          longDescription: resolveTranslation(p.longDescription) || "A Araras Eco Lodge foi constru\xEDda em harmonia com o ambiente, oferecendo uma experi\xEAncia \xFAnica no Pantanal.",
          location: resolveTranslation(p.location) || "Pantanal Norte, Mato Grosso",
          rating: typeof p.rating === "number" ? p.rating : p.rating ? parseFloat(p.rating) : 4.9,
          pricePerNight: typeof p.pricePerNight === "number" ? p.pricePerNight : p.pricePerNight ? parseFloat(p.pricePerNight) : 1800,
          images: parseJSONSafe(p.images) || [
            "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80"
          ],
          features: parseJSONSafe(p.features) || ["Wi-Fi", "Piscina Ecol\xF3gica", "Ar Condicionado"],
          activities: parseJSONSafe(p.activities) || ["Focagem Noturna", "Saf\xE1ri Fotogr\xE1fico"],
          experiences: experiencesMapped,
          capacity: typeof p.capacity === "number" ? p.capacity : p.capacity ? parseInt(p.capacity) : 12,
          videoUrl: p.videoUrl || "",
          verified: typeof p.verified === "boolean" ? p.verified : true,
          viewCount: typeof p.viewCount === "number" ? p.viewCount : p.viewCount ? parseInt(p.viewCount) : 0,
          officialSiteUrl: p.officialSiteUrl || "",
          teamPhotoUrl: p.teamPhotoUrl || "",
          teamSectionTitle: p.teamSectionTitle || "",
          teamSectionText: p.teamSectionText || ""
        };
      });
      console.log(`Carregadas ${pousadas.length} pousadas do Supabase com mappers de seguran\xE7a.`);
      const loadedIds = new Set(pousadas.map((p) => String(p.id)));
      const missingPousadas = DEFAULT_POUSADAS.filter((p) => !loadedIds.has(String(p.id)));
      if (missingPousadas.length > 0) {
        console.log(`Identificadas ${missingPousadas.length} novas pousadas est\xE1ticas para semear no Supabase.`);
        const seedNewData = missingPousadas.map((p) => ({
          ...p,
          images: JSON.stringify(p.images),
          features: JSON.stringify(p.features),
          activities: JSON.stringify(p.activities),
          experiences: JSON.stringify(p.experiences)
        }));
        const { error: seedNewErr } = await supabase.from("pousadas").insert(seedNewData);
        if (seedNewErr) {
          console.warn("Erro ao semear novas pousadas no Supabase:", seedNewErr.message);
        } else {
          console.log(`${missingPousadas.length} novas pousadas semeadas com sucesso.`);
          pousadas.push(...missingPousadas);
        }
      }
    } else {
      console.log("Nenhuma pousada encontrada no Supabase. Semeando dados iniciais...");
      const seedData = DEFAULT_POUSADAS.map((p) => ({
        ...p,
        images: JSON.stringify(p.images),
        features: JSON.stringify(p.features),
        activities: JSON.stringify(p.activities),
        experiences: JSON.stringify(p.experiences)
      }));
      const { error: seedErr } = await supabase.from("pousadas").insert(seedData);
      if (seedErr) console.warn("Erro ao semear pousadas no Supabase:", seedErr.message);
      pousadas = [...DEFAULT_POUSADAS];
    }
  } catch (err) {
    console.warn("Supabase pousadas sync fallback:", err.message);
  }
  try {
    const { data, error } = await supabase.from("guides").select("*");
    if (error) throw error;
    if (data && data.length > 0) {
      guides = data.map((g) => ({
        ...g,
        name: resolveTranslation(g.name),
        languages: parseJSONSafe(g.languages) || [],
        specialty: (parseJSONSafe(g.specialty) || []).map((s) => resolveTranslation(s))
      }));
      console.log(`Carregados ${guides.length} guias do Supabase.`);
    } else {
      console.log("Nenhum guia encontrado no Supabase. Semeando dados iniciais...");
      const seedData = guides.map((g) => ({
        ...g,
        languages: JSON.stringify(g.languages),
        specialty: JSON.stringify(g.specialty)
      }));
      const { error: seedErr } = await supabase.from("guides").insert(seedData);
      if (seedErr) console.warn("Erro ao semear guias no Supabase:", seedErr.message);
    }
  } catch (err) {
    console.warn("Supabase guides sync fallback:", err.message);
  }
  try {
    const { data, error } = await supabase.from("bookings").select("*");
    if (error) throw error;
    if (data && data.length > 0) {
      bookings = data.map((b) => ({
        ...b,
        pousadaName: resolveTranslation(b.pousadaName),
        customerName: resolveTranslation(b.customerName),
        experienceType: resolveTranslation(b.experienceType),
        guideName: resolveTranslation(b.guideName)
      }));
      console.log(`Carregadas ${bookings.length} reservas do Supabase.`);
    } else {
      console.log("Nenhuma reserva encontrada no Supabase. Semeando dados iniciais...");
      const { error: seedErr } = await supabase.from("bookings").insert(bookings);
      if (seedErr) console.warn("Erro ao semear reservas no Supabase:", seedErr.message);
    }
  } catch (err) {
    console.warn("Supabase bookings sync fallback:", err.message);
  }
  try {
    const { data, error } = await supabase.from("reviews").select("*");
    if (error) throw error;
    if (data && data.length > 0) {
      reviews = data.map((r) => ({
        ...r,
        userName: resolveTranslation(r.userName),
        comment: resolveTranslation(r.comment)
      }));
      console.log(`Carregadas ${reviews.length} avalia\xE7\xF5es do Supabase.`);
    } else {
      console.log("Nenhuma avalia\xE7\xE3o encontrada no Supabase. Semeando dados iniciais...");
      const { error: seedErr } = await supabase.from("reviews").insert(reviews);
      if (seedErr) console.warn("Erro ao semear avalia\xE7\xF5es no Supabase:", seedErr.message);
    }
  } catch (err) {
    console.warn("Supabase reviews sync fallback:", err.message);
  }
  try {
    const { data, error } = await supabase.from("sightings").select("*");
    if (error) throw error;
    if (data && data.length > 0) {
      sightings = data.map((s) => ({
        ...s,
        animalName: resolveTranslation(s.animalName),
        pousadaName: resolveTranslation(s.pousadaName),
        location: resolveTranslation(s.location)
      }));
      console.log(`Carregados ${sightings.length} avistamentos do Supabase.`);
    } else {
      console.log("Nenhum avistamento encontrado no Supabase. Semeando dados iniciais...");
      const { error: seedErr } = await supabase.from("sightings").insert(sightings);
      if (seedErr) console.warn("Erro ao semear avistamentos no Supabase:", seedErr.message);
    }
  } catch (err) {
    console.warn("Supabase sightings sync fallback:", err.message);
  }
  try {
    const { data, error } = await supabase.from("notifications").select("*");
    if (error) throw error;
    if (data && data.length > 0) {
      notifications = data.map((n) => ({
        ...n,
        message: resolveTranslation(n.message)
      }));
      console.log(`Carregadas ${notifications.length} notifica\xE7\xF5es do Supabase.`);
    } else {
      console.log("Nenhuma notifica\xE7\xE3o encontrada no Supabase. Semeando dados iniciais...");
      const { error: seedErr } = await supabase.from("notifications").insert(notifications);
      if (seedErr) console.warn("Erro ao semear notifica\xE7\xF5es no Supabase:", seedErr.message);
    }
  } catch (err) {
    console.warn("Supabase notifications sync fallback:", err.message);
  }
  try {
    const { data, error } = await supabase.from("species").select("*");
    if (error) throw error;
    if (data && data.length > 0) {
      species = data.map((s) => ({
        ...s,
        name: resolveTranslation(s.name),
        scientificName: resolveTranslation(s.scientificName),
        category: resolveTranslation(s.category),
        description: resolveTranslation(s.description),
        details: resolveTranslation(s.details),
        sightings: resolveTranslation(s.sightings),
        bestPousadaName: resolveTranslation(s.bestPousadaName)
      }));
      console.log(`Carregadas ${species.length} esp\xE9cies do Supabase.`);
    } else {
      console.log("Nenhuma esp\xE9cie encontrada no Supabase. Semeando dados iniciais...");
      const { error: seedErr } = await supabase.from("species").insert(DEFAULT_SPECIES);
      if (seedErr) console.warn("Erro ao semear esp\xE9cies no Supabase:", seedErr.message);
    }
  } catch (err) {
    console.warn("Supabase species sync fallback:", err.message);
  }
  try {
    const { data, error } = await supabase.from("turistas").select("*");
    if (error) throw error;
    if (data && data.length > 0) {
      turistas = data.map((t) => ({ ...t, name: resolveTranslation(t.name) }));
      console.log(`Carregados ${turistas.length} turistas do Supabase.`);
    } else {
      console.log("Nenhum turista encontrado no Supabase. Semeando dados iniciais...");
      const { error: seedErr } = await supabase.from("turistas").insert(turistas);
      if (seedErr) console.warn("Erro ao semear turistas no Supabase:", seedErr.message);
    }
  } catch (err) {
    console.warn("Supabase turistas sync fallback:", err.message);
  }
  try {
    const { data, error } = await supabase.from("roteiros").select("*");
    if (error) throw error;
    if (data && data.length > 0) {
      roteiros = data.map((r) => ({ ...r, name: resolveTranslation(r.name), description: resolveTranslation(r.description) }));
      console.log(`Carregados ${roteiros.length} roteiros do Supabase.`);
    } else {
      console.log("Nenhum roteiro encontrado no Supabase. Semeando dados iniciais...");
      const { error: seedErr } = await supabase.from("roteiros").insert(roteiros);
      if (seedErr) console.warn("Erro ao semear roteiros no Supabase:", seedErr.message);
    }
  } catch (err) {
    console.warn("Supabase roteiros sync fallback:", err.message);
  }
  try {
    const { data, error } = await supabase.from("reservas").select("*");
    if (error) throw error;
    if (data && data.length > 0) {
      reservas = data;
      console.log(`Carregadas ${reservas.length} reservas de roteiro do Supabase.`);
    } else {
      console.log("Nenhuma reserva de roteiro encontrada no Supabase. Semeando dados iniciais...");
      const { error: seedErr } = await supabase.from("reservas").insert(reservas);
      if (seedErr) console.warn("Erro ao semear reservas de roteiro no Supabase:", seedErr.message);
    }
  } catch (err) {
    console.warn("Supabase reservas sync fallback:", err.message);
  }
  try {
    const { data, error } = await supabase.from("pagamentos").select("*");
    if (error) throw error;
    if (data && data.length > 0) {
      pagamentos = data;
      console.log(`Carregados ${pagamentos.length} pagamentos do Supabase.`);
    } else {
      console.log("Nenhum pagamento encontrado no Supabase. Semeando dados iniciais...");
      const { error: seedErr } = await supabase.from("pagamentos").insert(pagamentos);
      if (seedErr) console.warn("Erro ao semear pagamentos no Supabase:", seedErr.message);
    }
  } catch (err) {
    console.warn("Supabase pagamentos sync fallback:", err.message);
  }
  try {
    const { data, error } = await supabase.from("guias").select("*");
    if (error) throw error;
    if (data && data.length > 0) {
      guiasTuristicos = data.map((g) => ({ ...g, name: resolveTranslation(g.name), specialty: resolveTranslation(g.specialty) }));
      console.log(`Carregados ${guiasTuristicos.length} guias tur\xEDsticos do Supabase.`);
    } else {
      console.log("Nenhum guia tur\xEDstico encontrado no Supabase. Semeando dados iniciais...");
      const { error: seedErr } = await supabase.from("guias").insert(guiasTuristicos);
      if (seedErr) console.warn("Erro ao semear guias tur\xEDsticos no Supabase:", seedErr.message);
    }
  } catch (err) {
    console.warn("Supabase guias sync fallback:", err.message);
  }
  try {
    const { data, error } = await supabase.from("candidaturas").select("*");
    if (error) throw error;
    if (data) {
      candidaturas = data.map((c) => ({ ...c, name: resolveTranslation(c.name), message: resolveTranslation(c.message) }));
      console.log(`Carregadas ${candidaturas.length} candidaturas de parceiros do Supabase.`);
    }
  } catch (err) {
    console.warn("Supabase candidaturas sync fallback:", err.message);
  }
  try {
    const { data, error } = await supabase.from("referral_sources").select("*");
    if (error) throw error;
    if (data) {
      referralSources = data.map((r) => ({ ...r, otherText: resolveTranslation(r.otherText) }));
      console.log(`Carregadas ${referralSources.length} respostas de origem de visitantes do Supabase.`);
    }
  } catch (err) {
    console.warn("Supabase referral_sources sync fallback:", err.message);
  }
}
app.get("/api/pousadas", (req, res) => {
  res.json(pousadas);
});
app.get("/api/pousadas/:id", (req, res) => {
  const pousada = pousadas.find((p) => p.id === req.params.id);
  if (!pousada) return res.status(404).json({ error: "Pousada n\xE3o encontrada" });
  res.json(pousada);
});
app.post("/api/pousadas/:id/view", async (req, res) => {
  const { id } = req.params;
  const idx = pousadas.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).json({ error: "Pousada n\xE3o encontrada" });
  pousadas[idx].viewCount = (pousadas[idx].viewCount || 0) + 1;
  try {
    await supabase.from("pousadas").update({ viewCount: pousadas[idx].viewCount }).eq("id", id);
  } catch (err) {
    console.warn("Erro ao atualizar contador de visualiza\xE7\xF5es no Supabase:", err.message);
  }
  res.json({ viewCount: pousadas[idx].viewCount });
});
app.post("/api/pousadas", requireAdmin, async (req, res) => {
  const newPousada = {
    id: `p_${Date.now()}`,
    verified: false,
    viewCount: 0,
    ...req.body
  };
  pousadas.push(newPousada);
  try {
    const dbPayload = {
      ...newPousada,
      images: JSON.stringify(newPousada.images),
      features: JSON.stringify(newPousada.features),
      activities: JSON.stringify(newPousada.activities),
      experiences: JSON.stringify(newPousada.experiences)
    };
    const { error } = await supabase.from("pousadas").insert(dbPayload);
    if (error) console.warn("Erro ao salvar pousada no Supabase:", error.message);
  } catch (err) {
    console.warn("Erro ao salvar pousada no Supabase:", err.message);
  }
  res.status(201).json(newPousada);
});
app.put("/api/pousadas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const idx = pousadas.findIndex((p) => p.id === id);
  if (idx !== -1) {
    pousadas[idx] = { ...pousadas[idx], ...req.body };
    try {
      const dbPayload = {
        ...pousadas[idx],
        images: JSON.stringify(pousadas[idx].images),
        features: JSON.stringify(pousadas[idx].features),
        activities: JSON.stringify(pousadas[idx].activities),
        experiences: JSON.stringify(pousadas[idx].experiences)
      };
      const { error } = await supabase.from("pousadas").update(dbPayload).eq("id", id);
      if (error) console.warn("Erro ao atualizar pousada no Supabase:", error.message);
    } catch (err) {
      console.warn("Erro ao atualizar pousada no Supabase:", err.message);
    }
    res.json(pousadas[idx]);
  } else {
    res.status(404).json({ error: "Pousada n\xE3o encontrada" });
  }
});
app.delete("/api/pousadas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  pousadas = pousadas.filter((p) => p.id !== id);
  try {
    await supabase.from("pousadas").delete().eq("id", id);
  } catch (err) {
    console.warn("Erro ao excluir pousada no Supabase:", err.message);
  }
  res.json({ success: true, message: "Pousada exclu\xEDda com sucesso" });
});
app.get("/api/guides", (req, res) => {
  res.json(guides);
});
app.post("/api/guides", requireAdmin, async (req, res) => {
  const newGuide = {
    id: `g_${Date.now()}`,
    ...req.body
  };
  guides.push(newGuide);
  try {
    const dbPayload = {
      ...newGuide,
      languages: JSON.stringify(newGuide.languages),
      specialty: JSON.stringify(newGuide.specialty)
    };
    await supabase.from("guides").insert(dbPayload);
  } catch (err) {
    console.warn("Erro ao salvar guia no Supabase:", err.message);
  }
  res.status(201).json(newGuide);
});
app.put("/api/guides/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const idx = guides.findIndex((g) => g.id === id);
  if (idx !== -1) {
    guides[idx] = { ...guides[idx], ...req.body };
    try {
      const dbPayload = {
        ...guides[idx],
        languages: JSON.stringify(guides[idx].languages),
        specialty: JSON.stringify(guides[idx].specialty)
      };
      await supabase.from("guides").update(dbPayload).eq("id", id);
    } catch (err) {
      console.warn("Erro ao atualizar guia no Supabase:", err.message);
    }
    res.json(guides[idx]);
  } else {
    res.status(404).json({ error: "Guia n\xE3o encontrado" });
  }
});
app.delete("/api/guides/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  guides = guides.filter((g) => g.id !== id);
  try {
    await supabase.from("guides").delete().eq("id", id);
  } catch (err) {
    console.warn("Erro ao excluir guia no Supabase:", err.message);
  }
  res.json({ success: true, message: "Guia exclu\xEDdo com sucesso" });
});
app.get("/api/bookings", requireAdmin, (req, res) => {
  res.json(bookings);
});
app.get("/api/bookings/public-confirmed", (req, res) => {
  const summaries = bookings.filter((b) => b.status === "confirmado_total").map((b) => ({ id: b.id, pousadaName: b.pousadaName, checkIn: b.checkIn, checkOut: b.checkOut, status: b.status }));
  res.json(summaries);
});
app.post("/api/bookings", requireAdmin, (req, res) => {
  const { pousadaId, checkIn, checkOut, adults, children } = req.body;
  const targetPousada = pousadas.find((p) => p.id === pousadaId);
  if (!targetPousada) {
    return res.status(404).json({ error: "Pousada n\xE3o encontrada" });
  }
  const overlappingBookings = bookings.filter((b) => {
    if (b.pousadaId !== pousadaId || b.status === "cancelado") return false;
    return b.checkIn <= checkOut && b.checkOut >= checkIn;
  });
  const totalGuestsAlready = overlappingBookings.reduce((acc, curr) => acc + curr.adults + curr.children, 0);
  const newGuests = (adults || 1) + (children || 0);
  if (totalGuestsAlready + newGuests > targetPousada.capacity) {
    const altCheckIn = new Date(new Date(checkIn).getTime() + 7 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0];
    const altCheckOut = new Date(new Date(checkOut).getTime() + 7 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0];
    return res.status(400).json({
      error: "Indispon\xEDvel para estas datas por atingir capacidade m\xE1xima.",
      available: false,
      suggestions: [
        { checkIn: altCheckIn, checkOut: altCheckOut, note: "Uma semana mais tarde" }
      ]
    });
  }
  const days = Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1e3 * 60 * 60 * 24)));
  let experiencePrice = 0;
  if (req.body.experienceType) {
    const exp = targetPousada.experiences.find((e) => e.title === req.body.experienceType);
    if (exp) {
      experiencePrice = exp.price * (adults || 1);
    }
  }
  const totalPrice = targetPousada.pricePerNight * days + experiencePrice;
  const newBooking = {
    id: `b_${Date.now()}`,
    pousadaId,
    pousadaName: targetPousada.name,
    customerName: req.body.customerName || "Cliente WhatsApp",
    customerEmail: req.body.customerEmail || "cliente@reserva.com",
    customerPhone: req.body.customerPhone || "+55 11 99999-9999",
    nationality: req.body.nationality || "Brasileira",
    adults: adults || 1,
    children: children || 0,
    childAges: req.body.childAges || "",
    dietaryRestrictions: req.body.dietaryRestrictions || "Nenhuma",
    specialNeeds: req.body.specialNeeds || "Nenhuma",
    checkIn,
    checkOut,
    experienceType: req.body.experienceType || "Padr\xE3o",
    totalPrice,
    status: req.body.status || "pendente_pagamento",
    dateCreated: (/* @__PURE__ */ new Date()).toISOString()
  };
  bookings.push(newBooking);
  supabase.from("bookings").insert(newBooking).then(({ error }) => {
    if (error) console.warn("Erro ao salvar reserva no Supabase:", error.message);
  });
  addNotification("admin", `Nova reserva criada: ${newBooking.customerName} na ${newBooking.pousadaName}.`, "booking_new", newBooking.id);
  res.status(201).json({ available: true, booking: newBooking });
});
var GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
var GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
var TOKENS_PATH = import_path.default.join(process.cwd(), "google_tokens.json");
function loadStoredTokens() {
  if (import_fs.default.existsSync(TOKENS_PATH)) {
    try {
      const data = import_fs.default.readFileSync(TOKENS_PATH, "utf8");
      return JSON.parse(data);
    } catch (err) {
      console.error("Erro ao carregar tokens do Google Calendar:", err);
    }
  }
  return null;
}
function saveTokens(tokens) {
  try {
    import_fs.default.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), "utf8");
    console.log("Tokens do Google Calendar salvos com sucesso.");
  } catch (err) {
    console.error("Erro ao salvar tokens do Google Calendar:", err);
  }
}
function deleteTokens() {
  if (import_fs.default.existsSync(TOKENS_PATH)) {
    try {
      import_fs.default.unlinkSync(TOKENS_PATH);
      console.log("Tokens do Google Calendar exclu\xEDdos.");
    } catch (err) {
      console.error("Erro ao deletar tokens do Google Calendar:", err);
    }
  }
}
function getOAuthClient(req) {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.get("host");
  const redirectUri = `${protocol}://${host}/api/auth/google/callback`;
  return new import_googleapis.google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}
async function createCalendarEvent(booking, req) {
  const tokens = loadStoredTokens();
  if (!tokens) {
    console.log("Sem tokens salvos do Google Calendar. Pulando sincroniza\xE7\xE3o.");
    return null;
  }
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.log("GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET n\xE3o configurados.");
    return null;
  }
  try {
    const oauth2Client = getOAuthClient(req);
    oauth2Client.setCredentials(tokens);
    oauth2Client.on("tokens", (newTokens) => {
      const currentTokens = loadStoredTokens() || {};
      const merged = { ...currentTokens, ...newTokens };
      saveTokens(merged);
    });
    const calendar = import_googleapis.google.calendar({ version: "v3", auth: oauth2Client });
    const summary = `\u{1F406} EcoSafari: Reserva ${booking.customerName} - ${booking.pousadaName}`;
    const description = `EcoSafari Brasil - Reserva Confirmada

\u{1F4CD} Pousada: ${booking.pousadaName}
\u{1F464} Cliente: ${booking.customerName}
\u2709\uFE0F E-mail: ${booking.customerEmail}
\u{1F4DE} Telefone: ${booking.customerPhone}
\u{1F465} H\xF3spedes: ${booking.adults} Adultos, ${booking.children} Crian\xE7as
\u{1F9ED} Experi\xEAncia: ${booking.experienceType}
\u{1F4B0} Valor Total: R$ ${booking.totalPrice.toLocaleString("pt-BR")}
\u{1F37D}\uFE0F Restri\xE7\xF5es Alimentares: ${booking.dietaryRestrictions}
\u267F Necessidades Especiais: ${booking.specialNeeds}
\u{1F468}\u200D\u2708\uFE0F Guia: ${booking.guideName || "A definir"}`;
    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary,
        description,
        start: {
          date: booking.checkIn,
          timeZone: "America/Cuiaba"
        },
        end: {
          date: booking.checkOut,
          timeZone: "America/Cuiaba"
        },
        colorId: "5",
        reminders: {
          useDefault: true
        }
      }
    });
    console.log("Evento no Google Calendar criado com sucesso:", response.data.id);
    return response.data.id;
  } catch (err) {
    console.error("Erro ao criar evento no Google Calendar:", err);
    return null;
  }
}
app.get("/api/auth/google/status", async (req, res) => {
  const tokens = loadStoredTokens();
  if (!tokens) {
    return res.json({ connected: false, email: null });
  }
  try {
    const oauth2Client = getOAuthClient(req);
    oauth2Client.setCredentials(tokens);
    const oauth2 = import_googleapis.google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    return res.json({ connected: true, email: userInfo.data.email });
  } catch (err) {
    console.error("Erro ao obter info do usu\xE1rio Google:", err);
    return res.json({ connected: true, email: "Conectado" });
  }
});
app.get("/api/auth/google", (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(400).send("Google OAuth Client ID ou Client Secret n\xE3o est\xE3o configurados.");
  }
  const oauth2Client = getOAuthClient(req);
  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email"
  ];
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent"
  });
  res.redirect(authUrl);
});
app.get("/api/auth/google/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send("C\xF3digo de autoriza\xE7\xE3o ausente.");
  }
  try {
    const oauth2Client = getOAuthClient(req);
    const { tokens } = await oauth2Client.getToken(code);
    saveTokens(tokens);
    res.redirect("/?google_cal_success=true");
  } catch (err) {
    console.error("Erro ao trocar c\xF3digo por tokens:", err);
    res.status(500).send(`Erro na autentica\xE7\xE3o: ${err instanceof Error ? err.message : String(err)}`);
  }
});
app.get("/api/auth/google/disconnect", (req, res) => {
  deleteTokens();
  res.redirect("/?google_cal_success=false");
});
async function applyBookingStatusUpdate(id, body, req) {
  const { status, guideId } = body;
  const idx = bookings.findIndex((b) => b.id === id);
  if (idx === -1) {
    return null;
  }
  const oldBooking = bookings[idx];
  const updated = { ...oldBooking, ...body };
  if (status) {
    updated.status = status;
    if (status === "pago") {
      addNotification("admin", `Pagamento de R$ ${oldBooking.totalPrice} recebido de ${oldBooking.customerName}.`, "payment_received", id);
      addNotification("pousada", `Favor confirmar acomoda\xE7\xE3o para ${oldBooking.customerName} no per\xEDodo ${oldBooking.checkIn} a ${oldBooking.checkOut}.`, "status_update", id);
      const compatibleGuides = guides.filter((g) => g.status === "disponivel");
      compatibleGuides.forEach((g) => {
        addNotification("guide", `Nova oportunidade de expedi\xE7\xE3o para ${g.name}: ${oldBooking.experienceType} na pousada ${oldBooking.pousadaName}.`, "status_update", id);
      });
    }
    if (status === "confirmado_pousada") {
      addNotification("admin", `A pousada ${oldBooking.pousadaName} confirmou disponibilidade de leito para a reserva #${id}.`, "status_update", id);
      if (oldBooking.guideId) {
        updated.status = "confirmado_total";
        addNotification("admin", `Reserva #${id} TOTALMENTE CONFIRMADA (Pousada + Guia)!`, "status_update", id);
        updated.googleCalendarEventId = `gc_${Math.random().toString(36).substr(2, 9)}`;
      }
    }
    if (status === "confirmado_guia" && guideId) {
      const selectedGuide = guides.find((g) => g.id === guideId);
      if (selectedGuide) {
        updated.guideId = guideId;
        updated.guideName = selectedGuide.name;
        addNotification("admin", `Guia ${selectedGuide.name} aceitou a expedi\xE7\xE3o para a reserva #${id}.`, "status_update", id);
        if (oldBooking.status === "confirmado_pousada") {
          updated.status = "confirmado_total";
          addNotification("admin", `Reserva #${id} TOTALMENTE CONFIRMADA (Pousada + Guia)!`, "status_update", id);
          updated.googleCalendarEventId = `gc_${Math.random().toString(36).substr(2, 9)}`;
        } else {
          updated.status = "confirmado_guia";
        }
      }
    }
    if (status === "confirmado_total") {
      updated.googleCalendarEventId = `gc_${Math.random().toString(36).substr(2, 9)}`;
    }
  }
  if (updated.status === "confirmado_total" && !oldBooking.googleCalendarEventId) {
    try {
      const calEventId = await createCalendarEvent(updated, req);
      if (calEventId) {
        updated.googleCalendarEventId = calEventId;
      } else {
        updated.googleCalendarEventId = `gc_${Math.random().toString(36).substr(2, 9)}`;
      }
    } catch (calErr) {
      console.error("Erro na integra\xE7\xE3o do Google Calendar:", calErr);
      updated.googleCalendarEventId = `gc_${Math.random().toString(36).substr(2, 9)}`;
    }
  }
  bookings[idx] = updated;
  supabase.from("bookings").update(updated).eq("id", id).then(({ error }) => {
    if (error) console.warn("Erro ao atualizar reserva no Supabase:", error.message);
  });
  if (status === "pago" && oldBooking.status !== "pago") {
    sendBookingConfirmationEmail(updated).catch((err) => console.warn("Erro ao enviar email de confirma\xE7\xE3o:", err.message));
  }
  return updated;
}
app.put("/api/bookings/:id/status", requireAdmin, async (req, res) => {
  const updated = await applyBookingStatusUpdate(req.params.id, req.body, req);
  if (!updated) {
    return res.status(404).json({ error: "Reserva n\xE3o encontrada" });
  }
  res.json(updated);
});
app.get("/api/stripe/status", (req, res) => {
  res.json({ configured: !!stripe });
});
app.post("/api/create-checkout-session", async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: "Stripe n\xE3o configurado. Defina STRIPE_SECRET_KEY para ativar o checkout real." });
  }
  const { bookingId } = req.body;
  const booking = bookings.find((b) => b.id === bookingId);
  if (!booking) {
    return res.status(404).json({ error: "Reserva n\xE3o encontrada" });
  }
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const origin = `${protocol}://${req.get("host")}`;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "brl",
          product_data: { name: `${booking.pousadaName} \u2014 ${booking.experienceType}` },
          unit_amount: Math.round(booking.totalPrice * 100)
        },
        quantity: 1
      }],
      customer_email: booking.customerEmail || void 0,
      metadata: { bookingId: booking.id },
      success_url: `${origin}/pagamento-confirmado?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?payment=cancelled`
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("Erro ao criar sess\xE3o de checkout Stripe:", err.message);
    res.status(500).json({ error: "Erro ao criar sess\xE3o de pagamento" });
  }
});
app.get("/api/payments/confirm", async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: "Stripe n\xE3o configurado" });
  }
  const sessionId = String(req.query.session_id || "");
  if (!sessionId) {
    return res.status(400).json({ error: "session_id \xE9 obrigat\xF3rio" });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(402).json({ error: "Pagamento ainda n\xE3o confirmado" });
    }
    const bookingId = session.metadata?.bookingId;
    if (!bookingId) {
      return res.status(400).json({ error: "Reserva n\xE3o identificada na sess\xE3o de pagamento" });
    }
    const updated = await applyBookingStatusUpdate(bookingId, { status: "pago" }, req);
    if (!updated) {
      return res.status(404).json({ error: "Reserva n\xE3o encontrada" });
    }
    res.json({ booking: updated });
  } catch (err) {
    console.error("Erro ao confirmar pagamento Stripe:", err.message);
    res.status(500).json({ error: "Erro ao confirmar pagamento" });
  }
});
function generateVoucherPdfBuffer(booking) {
  return new Promise((resolve, reject) => {
    const doc = new import_pdfkit.default({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fillColor("#2D4635").fontSize(22).text("EcoSafari Brasil", { align: "left" });
    doc.fillColor("#666").fontSize(10).text("Voucher de Reserva Confirmada", { align: "left" });
    doc.moveDown(1.5);
    doc.strokeColor("#2D4635").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);
    doc.fillColor("#111").fontSize(14).text(`Reserva #${booking.id}`, { underline: false });
    doc.moveDown(0.5);
    const row = (label, value) => {
      doc.fontSize(10).fillColor("#666").text(label, { continued: true }).fillColor("#111").text(`  ${value}`);
      doc.moveDown(0.3);
    };
    row("H\xF3spede:", booking.customerName);
    row("Email:", booking.customerEmail);
    row("Pousada:", booking.pousadaName);
    row("Check-in:", booking.checkIn);
    row("Check-out:", booking.checkOut);
    row("H\xF3spedes:", `${booking.adults} adulto(s)${booking.children ? `, ${booking.children} crian\xE7a(s)` : ""}`);
    row("Experi\xEAncia:", booking.experienceType);
    if (booking.guideName) row("Guia designado:", booking.guideName);
    row("Status:", "Pagamento confirmado");
    doc.moveDown(1);
    doc.strokeColor("#2D4635").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);
    doc.fontSize(14).fillColor("#2D4635").text(`Total pago: R$ ${booking.totalPrice.toLocaleString("pt-BR")}`);
    doc.moveDown(1.5);
    doc.fontSize(9).fillColor("#888").text(
      "Apresente este voucher (impresso ou digital) no check-in. Em caso de d\xFAvidas, fale conosco pelo WhatsApp +55 65 99986-8334.",
      { width: 495 }
    );
    doc.end();
  });
}
async function sendBookingConfirmationEmail(booking) {
  if (!resend || !booking.customerEmail) return;
  const pdfBuffer = await generateVoucherPdfBuffer(booking);
  await resend.emails.send({
    from: "EcoSafari Brasil <onboarding@resend.dev>",
    to: booking.customerEmail,
    subject: `Reserva confirmada \u2014 ${booking.pousadaName} (#${booking.id})`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #2D4635;">Pagamento confirmado! \u{1F33F}</h2>
        <p>Ol\xE1, ${booking.customerName}! Sua reserva na <strong>${booking.pousadaName}</strong> est\xE1 confirmada.</p>
        <p><strong>Check-in:</strong> ${booking.checkIn}<br/>
        <strong>Check-out:</strong> ${booking.checkOut}<br/>
        <strong>Total pago:</strong> R$ ${booking.totalPrice.toLocaleString("pt-BR")}</p>
        <p>O voucher da reserva est\xE1 em anexo neste email.</p>
        <p style="color: #888; font-size: 12px;">D\xFAvidas? Fale conosco pelo WhatsApp +55 65 99986-8334.</p>
      </div>
    `,
    attachments: [
      { filename: `voucher-${booking.id}.pdf`, content: pdfBuffer.toString("base64") }
    ]
  });
}
app.get("/api/resend/status", (req, res) => {
  res.json({ configured: !!resend });
});
app.get("/api/bookings/:id/voucher.pdf", async (req, res) => {
  const booking = bookings.find((b) => b.id === req.params.id);
  if (!booking) {
    return res.status(404).json({ error: "Reserva n\xE3o encontrada" });
  }
  try {
    const buffer = await generateVoucherPdfBuffer(booking);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="voucher-${booking.id}.pdf"`);
    res.send(buffer);
  } catch (err) {
    console.error("Erro ao gerar voucher PDF:", err.message);
    res.status(500).json({ error: "Erro ao gerar voucher" });
  }
});
app.get("/api/sightings", (req, res) => {
  res.json(sightings);
});
app.post("/api/sightings", (req, res) => {
  const { pousadaId, userName, animalName, imageUrl, location } = req.body;
  const targetPousada = pousadas.find((p) => p.id === pousadaId);
  const newSighting = {
    id: `s_${Date.now()}`,
    pousadaId: pousadaId || "1",
    pousadaName: targetPousada ? targetPousada.name : "Araras Eco Lodge",
    userName: userName || "Turista An\xF4nimo",
    animalName,
    imageUrl: imageUrl || "https://images.unsplash.com/photo-1575550959106-5a7defe28b56?auto=format&fit=crop&w=600&q=80",
    location: location || "Pantanal",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    likes: 0
  };
  sightings.unshift(newSighting);
  supabase.from("sightings").insert(newSighting).then(({ error }) => {
    if (error) console.warn("Erro ao salvar avistamento no Supabase:", error.message);
  });
  addNotification("admin", `Novo avistamento de ${animalName} postado por ${newSighting.userName}!`, "sighting_new");
  res.status(201).json(newSighting);
});
app.post("/api/sightings/:id/like", (req, res) => {
  const { id } = req.params;
  const idx = sightings.findIndex((s) => s.id === id);
  if (idx !== -1) {
    sightings[idx].likes += 1;
    supabase.from("sightings").update({ likes: sightings[idx].likes }).eq("id", id).then(({ error }) => {
      if (error) console.warn("Erro ao curtir avistamento no Supabase:", error.message);
    });
    res.json(sightings[idx]);
  } else {
    res.status(404).json({ error: "Avistamento n\xE3o encontrado" });
  }
});
app.get("/api/reviews", (req, res) => {
  res.json(reviews);
});
app.post("/api/reviews", (req, res) => {
  const newReview = {
    id: `r_${Date.now()}`,
    pousadaId: req.body.pousadaId,
    userName: req.body.userName || "Turista Satisfeito",
    rating: req.body.rating || 5,
    comment: req.body.comment,
    date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    photoUrl: req.body.photoUrl || void 0
  };
  reviews.push(newReview);
  supabase.from("reviews").insert(newReview).then(({ error }) => {
    if (error) console.warn("Erro ao salvar avalia\xE7\xE3o no Supabase:", error.message);
  });
  const targetId = req.body.pousadaId;
  const pReviews = reviews.filter((r) => r.pousadaId === targetId);
  const avg = Number((pReviews.reduce((sum, r) => sum + r.rating, 0) / pReviews.length).toFixed(1));
  const pIdx = pousadas.findIndex((p) => p.id === targetId);
  if (pIdx !== -1) {
    pousadas[pIdx].rating = avg;
    supabase.from("pousadas").update({ rating: avg }).eq("id", targetId).then(({ error }) => {
      if (error) console.warn("Erro ao atualizar nota da pousada no Supabase:", error.message);
    });
  }
  res.status(201).json(newReview);
});
app.get("/api/notifications", requireAdmin, (req, res) => {
  res.json(notifications);
});
app.post("/api/notifications/:id/read", requireAdmin, (req, res) => {
  const { id } = req.params;
  const idx = notifications.findIndex((n) => n.id === id);
  if (idx !== -1) {
    notifications[idx].read = true;
    supabase.from("notifications").update({ read: true }).eq("id", id).then(({ error }) => {
      if (error) console.warn("Erro ao ler notifica\xE7\xE3o no Supabase:", error.message);
    });
    res.json(notifications[idx]);
  } else {
    res.status(404).json({ error: "Notifica\xE7\xE3o n\xE3o encontrada" });
  }
});
app.get("/api/species", (req, res) => {
  res.json(species);
});
app.post("/api/species", requireAdmin, async (req, res) => {
  const newSpecie = {
    id: req.body.id || `s_${Date.now()}`,
    ...req.body
  };
  species.push(newSpecie);
  try {
    const { error } = await supabase.from("species").insert(newSpecie);
    if (error) console.warn("Erro ao salvar esp\xE9cie no Supabase:", error.message);
  } catch (err) {
    console.warn("Erro ao salvar esp\xE9cie no Supabase:", err.message);
  }
  res.status(201).json(newSpecie);
});
app.put("/api/species/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const idx = species.findIndex((s) => s.id === id);
  if (idx !== -1) {
    species[idx] = { ...species[idx], ...req.body };
    try {
      const { error } = await supabase.from("species").update(species[idx]).eq("id", id);
      if (error) console.warn("Erro ao atualizar esp\xE9cie no Supabase:", error.message);
    } catch (err) {
      console.warn("Erro ao atualizar esp\xE9cie no Supabase:", err.message);
    }
    res.json(species[idx]);
  } else {
    res.status(404).json({ error: "Esp\xE9cie n\xE3o encontrada" });
  }
});
app.delete("/api/species/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  species = species.filter((s) => s.id !== id);
  try {
    const { error } = await supabase.from("species").delete().eq("id", id);
    if (error) console.warn("Erro ao excluir esp\xE9cie no Supabase:", error.message);
  } catch (err) {
    console.warn("Erro ao excluir esp\xE9cie no Supabase:", err.message);
  }
  res.json({ success: true, message: "Esp\xE9cie exclu\xEDda com sucesso" });
});
app.get("/api/turistas", requireAdmin, (req, res) => {
  res.json(turistas);
});
app.post("/api/turistas", requireAdmin, async (req, res) => {
  const newTurista = { id: `t_${Date.now()}`, ...req.body };
  turistas.push(newTurista);
  try {
    const { error } = await supabase.from("turistas").insert(newTurista);
    if (error) console.warn("Erro ao salvar turista no Supabase:", error.message);
  } catch (err) {
    console.warn("Erro ao salvar turista no Supabase:", err.message);
  }
  res.status(201).json(newTurista);
});
app.put("/api/turistas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const idx = turistas.findIndex((t) => t.id === id);
  if (idx !== -1) {
    turistas[idx] = { ...turistas[idx], ...req.body };
    try {
      const { error } = await supabase.from("turistas").update(turistas[idx]).eq("id", id);
      if (error) console.warn("Erro ao atualizar turista no Supabase:", error.message);
    } catch (err) {
      console.warn("Erro ao atualizar turista no Supabase:", err.message);
    }
    res.json(turistas[idx]);
  } else {
    res.status(404).json({ error: "Turista n\xE3o encontrado" });
  }
});
app.delete("/api/turistas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  turistas = turistas.filter((t) => t.id !== id);
  try {
    const { error } = await supabase.from("turistas").delete().eq("id", id);
    if (error) console.warn("Erro ao excluir turista no Supabase:", error.message);
  } catch (err) {
    console.warn("Erro ao excluir turista no Supabase:", err.message);
  }
  res.json({ success: true, message: "Turista exclu\xEDdo com sucesso" });
});
app.get("/api/roteiros", requireAdmin, (req, res) => {
  res.json(roteiros);
});
app.post("/api/roteiros", requireAdmin, async (req, res) => {
  const newRoteiro = { id: `rt_${Date.now()}`, ...req.body };
  roteiros.push(newRoteiro);
  try {
    const { error } = await supabase.from("roteiros").insert(newRoteiro);
    if (error) console.warn("Erro ao salvar roteiro no Supabase:", error.message);
  } catch (err) {
    console.warn("Erro ao salvar roteiro no Supabase:", err.message);
  }
  res.status(201).json(newRoteiro);
});
app.put("/api/roteiros/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const idx = roteiros.findIndex((r) => r.id === id);
  if (idx !== -1) {
    roteiros[idx] = { ...roteiros[idx], ...req.body };
    try {
      const { error } = await supabase.from("roteiros").update(roteiros[idx]).eq("id", id);
      if (error) console.warn("Erro ao atualizar roteiro no Supabase:", error.message);
    } catch (err) {
      console.warn("Erro ao atualizar roteiro no Supabase:", err.message);
    }
    res.json(roteiros[idx]);
  } else {
    res.status(404).json({ error: "Roteiro n\xE3o encontrado" });
  }
});
app.delete("/api/roteiros/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  roteiros = roteiros.filter((r) => r.id !== id);
  try {
    const { error } = await supabase.from("roteiros").delete().eq("id", id);
    if (error) console.warn("Erro ao excluir roteiro no Supabase:", error.message);
  } catch (err) {
    console.warn("Erro ao excluir roteiro no Supabase:", err.message);
  }
  res.json({ success: true, message: "Roteiro exclu\xEDdo com sucesso" });
});
app.get("/api/reservas", requireAdmin, (req, res) => {
  res.json(reservas);
});
app.post("/api/reservas", requireAdmin, async (req, res) => {
  const newReserva = { id: `rv_${Date.now()}`, ...req.body };
  reservas.push(newReserva);
  try {
    const { error } = await supabase.from("reservas").insert(newReserva);
    if (error) console.warn("Erro ao salvar reserva no Supabase:", error.message);
  } catch (err) {
    console.warn("Erro ao salvar reserva no Supabase:", err.message);
  }
  res.status(201).json(newReserva);
});
app.put("/api/reservas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const idx = reservas.findIndex((r) => r.id === id);
  if (idx !== -1) {
    reservas[idx] = { ...reservas[idx], ...req.body };
    try {
      const { error } = await supabase.from("reservas").update(reservas[idx]).eq("id", id);
      if (error) console.warn("Erro ao atualizar reserva no Supabase:", error.message);
    } catch (err) {
      console.warn("Erro ao atualizar reserva no Supabase:", err.message);
    }
    res.json(reservas[idx]);
  } else {
    res.status(404).json({ error: "Reserva n\xE3o encontrada" });
  }
});
app.delete("/api/reservas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  reservas = reservas.filter((r) => r.id !== id);
  try {
    const { error } = await supabase.from("reservas").delete().eq("id", id);
    if (error) console.warn("Erro ao excluir reserva no Supabase:", error.message);
  } catch (err) {
    console.warn("Erro ao excluir reserva no Supabase:", err.message);
  }
  res.json({ success: true, message: "Reserva exclu\xEDda com sucesso" });
});
app.get("/api/pagamentos", requireAdmin, (req, res) => {
  res.json(pagamentos);
});
app.post("/api/pagamentos", requireAdmin, async (req, res) => {
  const newPagamento = { id: `pg_${Date.now()}`, ...req.body };
  pagamentos.push(newPagamento);
  try {
    const { error } = await supabase.from("pagamentos").insert(newPagamento);
    if (error) console.warn("Erro ao salvar pagamento no Supabase:", error.message);
  } catch (err) {
    console.warn("Erro ao salvar pagamento no Supabase:", err.message);
  }
  res.status(201).json(newPagamento);
});
app.put("/api/pagamentos/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const idx = pagamentos.findIndex((p) => p.id === id);
  if (idx !== -1) {
    pagamentos[idx] = { ...pagamentos[idx], ...req.body };
    try {
      const { error } = await supabase.from("pagamentos").update(pagamentos[idx]).eq("id", id);
      if (error) console.warn("Erro ao atualizar pagamento no Supabase:", error.message);
    } catch (err) {
      console.warn("Erro ao atualizar pagamento no Supabase:", err.message);
    }
    res.json(pagamentos[idx]);
  } else {
    res.status(404).json({ error: "Pagamento n\xE3o encontrado" });
  }
});
app.delete("/api/pagamentos/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  pagamentos = pagamentos.filter((p) => p.id !== id);
  try {
    const { error } = await supabase.from("pagamentos").delete().eq("id", id);
    if (error) console.warn("Erro ao excluir pagamento no Supabase:", error.message);
  } catch (err) {
    console.warn("Erro ao excluir pagamento no Supabase:", err.message);
  }
  res.json({ success: true, message: "Pagamento exclu\xEDdo com sucesso" });
});
app.get("/api/guias", requireAdmin, (req, res) => {
  res.json(guiasTuristicos);
});
app.post("/api/guias", requireAdmin, async (req, res) => {
  const newGuia = { id: `gt_${Date.now()}`, ...req.body };
  guiasTuristicos.push(newGuia);
  try {
    const { error } = await supabase.from("guias").insert(newGuia);
    if (error) console.warn("Erro ao salvar guia no Supabase:", error.message);
  } catch (err) {
    console.warn("Erro ao salvar guia no Supabase:", err.message);
  }
  res.status(201).json(newGuia);
});
app.put("/api/guias/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const idx = guiasTuristicos.findIndex((g) => g.id === id);
  if (idx !== -1) {
    guiasTuristicos[idx] = { ...guiasTuristicos[idx], ...req.body };
    try {
      const { error } = await supabase.from("guias").update(guiasTuristicos[idx]).eq("id", id);
      if (error) console.warn("Erro ao atualizar guia no Supabase:", error.message);
    } catch (err) {
      console.warn("Erro ao atualizar guia no Supabase:", err.message);
    }
    res.json(guiasTuristicos[idx]);
  } else {
    res.status(404).json({ error: "Guia n\xE3o encontrado" });
  }
});
app.delete("/api/guias/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  guiasTuristicos = guiasTuristicos.filter((g) => g.id !== id);
  try {
    const { error } = await supabase.from("guias").delete().eq("id", id);
    if (error) console.warn("Erro ao excluir guia no Supabase:", error.message);
  } catch (err) {
    console.warn("Erro ao excluir guia no Supabase:", err.message);
  }
  res.json({ success: true, message: "Guia exclu\xEDdo com sucesso" });
});
app.get("/api/candidaturas", requireAdmin, (req, res) => {
  res.json(candidaturas);
});
app.get("/api/candidaturas/status", (req, res) => {
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: "Informe um email" });
  }
  const matches = candidaturas.filter((c) => (c.email || "").trim().toLowerCase() === email);
  res.json(matches);
});
app.post("/api/candidaturas", async (req, res) => {
  const newCandidatura = {
    id: `cand_${Date.now()}`,
    status: "pendente",
    dateCreated: (/* @__PURE__ */ new Date()).toISOString(),
    ...req.body
  };
  candidaturas.unshift(newCandidatura);
  try {
    const { error } = await supabase.from("candidaturas").insert(newCandidatura);
    if (error) console.warn("Erro ao salvar candidatura no Supabase:", error.message);
  } catch (err) {
    console.warn("Erro ao salvar candidatura no Supabase:", err.message);
  }
  const label = newCandidatura.type === "pousada" ? `Nova candidatura de pousada: ${newCandidatura.pousadaName || newCandidatura.name}` : `Nova candidatura de guia: ${newCandidatura.name}`;
  addNotification("admin", label, "status_update");
  res.status(201).json(newCandidatura);
});
app.put("/api/candidaturas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const idx = candidaturas.findIndex((c) => c.id === id);
  if (idx !== -1) {
    candidaturas[idx] = { ...candidaturas[idx], ...req.body };
    try {
      const { error } = await supabase.from("candidaturas").update(candidaturas[idx]).eq("id", id);
      if (error) console.warn("Erro ao atualizar candidatura no Supabase:", error.message);
    } catch (err) {
      console.warn("Erro ao atualizar candidatura no Supabase:", err.message);
    }
    res.json(candidaturas[idx]);
  } else {
    res.status(404).json({ error: "Candidatura n\xE3o encontrada" });
  }
});
app.delete("/api/candidaturas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  candidaturas = candidaturas.filter((c) => c.id !== id);
  try {
    const { error } = await supabase.from("candidaturas").delete().eq("id", id);
    if (error) console.warn("Erro ao excluir candidatura no Supabase:", error.message);
  } catch (err) {
    console.warn("Erro ao excluir candidatura no Supabase:", err.message);
  }
  res.json({ success: true, message: "Candidatura exclu\xEDda com sucesso" });
});
app.post("/api/referral-sources", async (req, res) => {
  const newSource = {
    id: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    ...req.body
  };
  referralSources.push(newSource);
  try {
    const { error } = await supabase.from("referral_sources").insert(newSource);
    if (error) console.warn("Erro ao salvar origem do visitante no Supabase:", error.message);
  } catch (err) {
    console.warn("Erro ao salvar origem do visitante no Supabase:", err.message);
  }
  res.status(201).json(newSource);
});
app.get("/api/referral-sources", requireAdmin, (req, res) => {
  res.json(referralSources);
});
app.get("/api/config", (req, res) => {
  res.json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY });
});
app.get("/api/supabase/status", async (req, res) => {
  const status = {};
  const tables = ["pousadas", "guides", "bookings", "reviews", "sightings", "notifications", "species", "turistas", "roteiros", "reservas", "pagamentos", "guias", "candidaturas", "referral_sources"];
  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select("id").limit(1);
      status[table] = !error;
    } catch {
      status[table] = false;
    }
  }
  res.json({
    connected: true,
    url: SUPABASE_URL,
    tables: status,
    allOk: Object.values(status).every((v) => v)
  });
});
app.get("/api/supabase/sql", (req, res) => {
  const sql = `-- ECOSAFARI BRASIL: COPIE E COLE ESTE SCRIPT NO EDITOR SQL DO SEU PAINEL SUPABASE PARA CRIAR AS TABELAS E POL\xCDTICAS DE SEGURAN\xC7A (RLS)

-- 1. TABELA DE POUSADAS
CREATE TABLE IF NOT EXISTS pousadas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  "longDescription" TEXT,
  location TEXT,
  rating FLOAT DEFAULT 5.0,
  "pricePerNight" NUMERIC DEFAULT 0,
  images TEXT, -- armazenado como string JSON
  features TEXT, -- armazenado como string JSON
  activities TEXT, -- armazenado como string JSON
  experiences TEXT, -- armazenado como string JSON
  capacity INTEGER DEFAULT 1,
  "videoUrl" TEXT,
  verified BOOLEAN DEFAULT true,
  "viewCount" INTEGER DEFAULT 0,
  "officialSiteUrl" TEXT,
  "teamPhotoUrl" TEXT,
  "teamSectionTitle" TEXT,
  "teamSectionText" TEXT
);

-- Caso a tabela j\xE1 exista de uma execu\xE7\xE3o anterior deste script, garante as novas colunas
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT true;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "viewCount" INTEGER DEFAULT 0;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "officialSiteUrl" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "teamPhotoUrl" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "teamSectionTitle" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "teamSectionText" TEXT;

-- Ativar RLS em pousadas (sem policies p\xFAblicas \u2014 s\xF3 o backend com service_role acessa)
ALTER TABLE pousadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura p\xFAblica de pousadas" ON pousadas;
DROP POLICY IF EXISTS "Permitir inser\xE7\xE3o p\xFAblica de pousadas" ON pousadas;
DROP POLICY IF EXISTS "Permitir atualiza\xE7\xE3o p\xFAblica de pousadas" ON pousadas;
DROP POLICY IF EXISTS "Permitir exclus\xE3o p\xFAblica de pousadas" ON pousadas;



-- 2. TABELA DE GUIAS
CREATE TABLE IF NOT EXISTS guides (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  languages TEXT, -- armazenado como string JSON
  specialty TEXT, -- armazenado como string JSON
  status TEXT DEFAULT 'disponivel',
  email TEXT,
  phone TEXT
);

-- Ativar RLS em guias (sem policies p\xFAblicas \u2014 s\xF3 o backend com service_role acessa)
ALTER TABLE guides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura p\xFAblica de guias" ON guides;
DROP POLICY IF EXISTS "Permitir inser\xE7\xE3o p\xFAblica de guias" ON guides;
DROP POLICY IF EXISTS "Permitir atualiza\xE7\xE3o p\xFAblica de guias" ON guides;
DROP POLICY IF EXISTS "Permitir exclus\xE3o p\xFAblica de guias" ON guides;



-- 3. TABELA DE RESERVAS (BOOKINGS)
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  "pousadaId" TEXT,
  "pousadaName" TEXT,
  "customerName" TEXT,
  "customerEmail" TEXT,
  "customerPhone" TEXT,
  nationality TEXT,
  adults INTEGER DEFAULT 1,
  children INTEGER DEFAULT 0,
  "childAges" TEXT,
  "dietaryRestrictions" TEXT,
  "specialNeeds" TEXT,
  "checkIn" TEXT,
  "checkOut" TEXT,
  "experienceType" TEXT,
  "totalPrice" NUMERIC DEFAULT 0,
  status TEXT,
  "guideId" TEXT,
  "guideName" TEXT,
  "dateCreated" TEXT,
  "googleCalendarEventId" TEXT
);

-- Ativar RLS em reservas (sem policies p\xFAblicas \u2014 s\xF3 o backend com service_role acessa)
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura p\xFAblica de reservas" ON bookings;
DROP POLICY IF EXISTS "Permitir inser\xE7\xE3o p\xFAblica de reservas" ON bookings;
DROP POLICY IF EXISTS "Permitir atualiza\xE7\xE3o p\xFAblica de reservas" ON bookings;
DROP POLICY IF EXISTS "Permitir exclus\xE3o p\xFAblica de reservas" ON bookings;



-- 4. TABELA DE AVALIA\xC7\xD5ES (REVIEWS)
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  "pousadaId" TEXT,
  "userName" TEXT,
  rating FLOAT,
  comment TEXT,
  date TEXT,
  "photoUrl" TEXT
);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;

-- Ativar RLS em avalia\xE7\xF5es (sem policies p\xFAblicas \u2014 s\xF3 o backend com service_role acessa)
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura p\xFAblica de avalia\xE7\xF5es" ON reviews;
DROP POLICY IF EXISTS "Permitir inser\xE7\xE3o p\xFAblica de avalia\xE7\xF5es" ON reviews;
DROP POLICY IF EXISTS "Permitir atualiza\xE7\xE3o p\xFAblica de avalia\xE7\xF5es" ON reviews;
DROP POLICY IF EXISTS "Permitir exclus\xE3o p\xFAblica de avalia\xE7\xF5es" ON reviews;



-- 5. TABELA DE AVISTAMENTOS (SIGHTINGS)
CREATE TABLE IF NOT EXISTS sightings (
  id TEXT PRIMARY KEY,
  "pousadaId" TEXT,
  "pousadaName" TEXT,
  "userName" TEXT,
  "animalName" TEXT,
  "imageUrl" TEXT,
  location TEXT,
  timestamp TEXT,
  likes INTEGER DEFAULT 0
);

-- Ativar RLS em avistamentos (sem policies p\xFAblicas \u2014 s\xF3 o backend com service_role acessa)
ALTER TABLE sightings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura p\xFAblica de avistamentos" ON sightings;
DROP POLICY IF EXISTS "Permitir inser\xE7\xE3o p\xFAblica de avistamentos" ON sightings;
DROP POLICY IF EXISTS "Permitir atualiza\xE7\xE3o p\xFAblica de avistamentos" ON sightings;
DROP POLICY IF EXISTS "Permitir exclus\xE3o p\xFAblica de avistamentos" ON sightings;



-- 6. TABELA DE NOTIFICA\xC7\xD5ES
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  target TEXT,
  "targetId" TEXT,
  message TEXT,
  type TEXT,
  timestamp TEXT,
  read BOOLEAN DEFAULT false,
  "bookingId" TEXT
);

-- Ativar RLS em notifica\xE7\xF5es (sem policies p\xFAblicas \u2014 s\xF3 o backend com service_role acessa)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura p\xFAblica de notifica\xE7\xF5es" ON notifications;
DROP POLICY IF EXISTS "Permitir inser\xE7\xE3o p\xFAblica de notifica\xE7\xF5es" ON notifications;
DROP POLICY IF EXISTS "Permitir atualiza\xE7\xE3o p\xFAblica de notifica\xE7\xF5es" ON notifications;
DROP POLICY IF EXISTS "Permitir exclus\xE3o p\xFAblica de notifica\xE7\xF5es" ON notifications;



-- 7. TABELA DE ESP\xC9CIES SILVESTRES (SPECIES)
CREATE TABLE IF NOT EXISTS species (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "scientificName" TEXT,
  category TEXT,
  description TEXT,
  details TEXT,
  sightings TEXT,
  image TEXT,
  "bestPousadaId" TEXT,
  "bestPousadaName" TEXT
);

-- Ativar RLS em esp\xE9cies (sem policies p\xFAblicas \u2014 s\xF3 o backend com service_role acessa)
ALTER TABLE species ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura p\xFAblica de esp\xE9cies" ON species;
DROP POLICY IF EXISTS "Permitir inser\xE7\xE3o p\xFAblica de esp\xE9cies" ON species;
DROP POLICY IF EXISTS "Permitir atualiza\xE7\xE3o p\xFAblica de esp\xE9cies" ON species;
DROP POLICY IF EXISTS "Permitir exclus\xE3o p\xFAblica de esp\xE9cies" ON species;



-- ======================================================
-- CAMADA DE TURISMO (Turistas, Roteiros, Reservas, Pagamentos, Guias)
-- Modelo adicional conforme especifica\xE7\xE3o do banco de dados, em paralelo
-- ao cat\xE1logo de Pousadas/Bookings j\xE1 existente.
--
-- Sem policies p\xFAblicas: s\xF3 o backend (usando a service_role key) l\xEA/grava
-- essas tabelas \u2014 inclusive "turistas" (dados pessoais) e "pagamentos"
-- (dados financeiros). Isso \xE9 refor\xE7ado tamb\xE9m no Express, que exige login
-- de admin (requireAdmin) para todas as rotas dessa camada.
-- ======================================================

-- 8. TABELA DE TURISTAS
CREATE TABLE IF NOT EXISTS turistas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  whatsapp TEXT,
  country TEXT,
  age INTEGER,
  preferences TEXT
);

ALTER TABLE turistas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura p\xFAblica de turistas" ON turistas;
DROP POLICY IF EXISTS "Permitir inser\xE7\xE3o p\xFAblica de turistas" ON turistas;
DROP POLICY IF EXISTS "Permitir atualiza\xE7\xE3o p\xFAblica de turistas" ON turistas;
DROP POLICY IF EXISTS "Permitir exclus\xE3o p\xFAblica de turistas" ON turistas;



-- 9. TABELA DE ROTEIROS
CREATE TABLE IF NOT EXISTS roteiros (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  duration TEXT,
  price NUMERIC DEFAULT 0,
  difficulty TEXT,
  capacity INTEGER DEFAULT 1,
  description TEXT
);

ALTER TABLE roteiros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura p\xFAblica de roteiros" ON roteiros;
DROP POLICY IF EXISTS "Permitir inser\xE7\xE3o p\xFAblica de roteiros" ON roteiros;
DROP POLICY IF EXISTS "Permitir atualiza\xE7\xE3o p\xFAblica de roteiros" ON roteiros;
DROP POLICY IF EXISTS "Permitir exclus\xE3o p\xFAblica de roteiros" ON roteiros;



-- 10. TABELA DE RESERVAS (DE ROTEIRO)
CREATE TABLE IF NOT EXISTS reservas (
  id TEXT PRIMARY KEY,
  "turistaId" TEXT,
  "roteiroId" TEXT,
  date TEXT,
  status TEXT DEFAULT 'pendente',
  "totalPrice" NUMERIC DEFAULT 0
);

ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura p\xFAblica de reservas de roteiro" ON reservas;
DROP POLICY IF EXISTS "Permitir inser\xE7\xE3o p\xFAblica de reservas de roteiro" ON reservas;
DROP POLICY IF EXISTS "Permitir atualiza\xE7\xE3o p\xFAblica de reservas de roteiro" ON reservas;
DROP POLICY IF EXISTS "Permitir exclus\xE3o p\xFAblica de reservas de roteiro" ON reservas;



-- 11. TABELA DE PAGAMENTOS
CREATE TABLE IF NOT EXISTS pagamentos (
  id TEXT PRIMARY KEY,
  "reservaId" TEXT,
  amount NUMERIC DEFAULT 0,
  date TEXT,
  method TEXT,
  status TEXT DEFAULT 'pendente'
);

ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura p\xFAblica de pagamentos" ON pagamentos;
DROP POLICY IF EXISTS "Permitir inser\xE7\xE3o p\xFAblica de pagamentos" ON pagamentos;
DROP POLICY IF EXISTS "Permitir atualiza\xE7\xE3o p\xFAblica de pagamentos" ON pagamentos;
DROP POLICY IF EXISTS "Permitir exclus\xE3o p\xFAblica de pagamentos" ON pagamentos;



-- 12. TABELA DE GUIAS (camada de turismo, distinta da tabela "guides" j\xE1 existente)
CREATE TABLE IF NOT EXISTS guias (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  specialty TEXT,
  phone TEXT,
  availability BOOLEAN DEFAULT true,
  rating FLOAT DEFAULT 5.0
);

ALTER TABLE guias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura p\xFAblica de guias tur\xEDsticos" ON guias;
DROP POLICY IF EXISTS "Permitir inser\xE7\xE3o p\xFAblica de guias tur\xEDsticos" ON guias;
DROP POLICY IF EXISTS "Permitir atualiza\xE7\xE3o p\xFAblica de guias tur\xEDsticos" ON guias;
DROP POLICY IF EXISTS "Permitir exclus\xE3o p\xFAblica de guias tur\xEDsticos" ON guias;



-- 13. TABELA DE CANDIDATURAS (cadastro p\xFAblico de parceiros: guias e pousadas)
-- Recebe as submiss\xF5es do formul\xE1rio p\xFAblico em /seja-parceiro, mediadas pelo
-- backend (POST /api/candidaturas \xE9 a \xFAnica rota p\xFAblica; leitura/edi\xE7\xE3o
-- exigem login de admin). Sem policies p\xFAblicas \u2014 s\xF3 o backend acessa.
CREATE TABLE IF NOT EXISTS candidaturas (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pendente',
  "dateCreated" TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  message TEXT,
  languages TEXT,
  availability TEXT,
  age INTEGER,
  "experienceYears" INTEGER,
  specialty TEXT,
  "pousadaName" TEXT,
  location TEXT,
  capacity INTEGER
);

ALTER TABLE candidaturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir inser\xE7\xE3o p\xFAblica de candidaturas" ON candidaturas;
DROP POLICY IF EXISTS "Permitir leitura p\xFAblica de candidaturas" ON candidaturas;
DROP POLICY IF EXISTS "Permitir atualiza\xE7\xE3o p\xFAblica de candidaturas" ON candidaturas;
DROP POLICY IF EXISTS "Permitir exclus\xE3o p\xFAblica de candidaturas" ON candidaturas;


-- 14. TABELA DE ORIGEM DOS VISITANTES (pesquisa "como voc\xEA chegou at\xE9 n\xF3s?")
-- Preenchida pelo formul\xE1rio de primeiro acesso no site. Mediada pelo
-- backend (POST p\xFAblico, GET s\xF3 admin). Sem policies p\xFAblicas.
CREATE TABLE IF NOT EXISTS referral_sources (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  "otherText" TEXT,
  timestamp TEXT
);

ALTER TABLE referral_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leitura p\xFAblica de referral_sources" ON referral_sources;
DROP POLICY IF EXISTS "Permitir inser\xE7\xE3o p\xFAblica de referral_sources" ON referral_sources;
`;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(sql);
});
function getPousadasContext() {
  return pousadas.map((p) => {
    return `- ID: "${p.id}", Nome: "${p.name}", Localiza\xE7\xE3o: "${p.location}", Pre\xE7o/noite: R$ ${p.pricePerNight}, Capacidade: ${p.capacity} h\xF3spedes. Experi\xEAncias: [${p.experiences.map((e) => `${e.title}: R$ ${e.price}`).join(", ")}]. Caracter\xEDsticas: [${p.features.join(", ")}].`;
  }).join("\n");
}
var AGENCY_WHATSAPP = "+55 65 99986-8334";
app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Formato de mensagens inv\xE1lido." });
  }
  const systemInstruction = `Voc\xEA \xE9 a "Sofia", assistente de suporte do site da ag\xEAncia de turismo ecol\xF3gico "EcoSafari Brasil".
Seu \xFAnico papel \xE9 responder d\xFAvidas P\xDABLICAS sobre o site e as pousadas parceiras: localiza\xE7\xF5es, pre\xE7os de di\xE1ria, experi\xEAncias e atividades dispon\xEDveis, estrutura das pousadas, e d\xFAvidas gerais de viagem (documenta\xE7\xE3o, vacinas, o que levar, melhor \xE9poca para avistamentos).

Cat\xE1logo p\xFAblico de pousadas parceiras:
${getPousadasContext()}

Regras importantes:
1. Voc\xEA N\xC3O coleta dados pessoais do cliente e N\xC3O fecha reservas, pagamentos ou datas \u2014 isso \xE9 feito s\xF3 pela equipe humana.
2. Sempre que o cliente quiser reservar, pagar, negociar pre\xE7o, tratar de algo espec\xEDfico da viagem dele, ou qualquer coisa que exija um atendimento humano, direcione educadamente para o WhatsApp oficial da ag\xEAncia: ${AGENCY_WHATSAPP} (ex: "Para seguir com sua reserva, \xE9 s\xF3 chamar a gente no WhatsApp oficial: ${AGENCY_WHATSAPP} \u{1F60A}").
3. Seja breve, calorosa e direta \u2014 respostas curtas, adequadas para leitura r\xE1pida, sem blocos gigantes de texto.`;
  if (ai) {
    try {
      const contents = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents,
        config: {
          systemInstruction,
          temperature: 0.7
        }
      });
      const replyText = response.text || `Ol\xE1! Desculpe, tive uma pequena oscila\xE7\xE3o aqui na floresta. Para um atendimento garantido, fale com a gente no WhatsApp: ${AGENCY_WHATSAPP}.`;
      return res.json({ reply: replyText });
    } catch (err) {
      console.error("Gemini invocation failed, using fallback:", err);
    }
  }
  const reply = `Ol\xE1! \u{1F33F} Sou a Sofia, assistente de suporte da EcoSafari Brasil. Posso ajudar com d\xFAvidas gerais sobre nossas pousadas parceiras e experi\xEAncias.

Para reservas, pagamentos ou qualquer atendimento personalizado, fale direto com nossa equipe no WhatsApp oficial: *${AGENCY_WHATSAPP}* \u{1F60A}`;
  res.json({ reply });
});
function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function injectPousadaMeta(html, pousada) {
  const title = `${pousada.name} \u2014 EcoSafari Brasil`;
  const description = (pousada.description || "Conhe\xE7a esta pousada parceira da EcoSafari Brasil.").slice(0, 200);
  const image = pousada.images && pousada.images[0] || "/species/onca-pintada.png";
  return html.replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(title)}</title>`).replace(/<meta name="description" content=".*?"\s*\/>/, `<meta name="description" content="${escapeHtml(description)}" />`).replace(/<meta property="og:title" content=".*?"\s*\/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`).replace(/<meta property="og:description" content=".*?"\s*\/>/, `<meta property="og:description" content="${escapeHtml(description)}" />`).replace(/<meta property="og:image" content=".*?"\s*\/>/, `<meta property="og:image" content="${escapeHtml(image)}" />`).replace(/<meta name="twitter:title" content=".*?"\s*\/>/, `<meta name="twitter:title" content="${escapeHtml(title)}" />`).replace(/<meta name="twitter:description" content=".*?"\s*\/>/, `<meta name="twitter:description" content="${escapeHtml(description)}" />`).replace(/<meta name="twitter:image" content=".*?"\s*\/>/, `<meta name="twitter:image" content="${escapeHtml(image)}" />`);
}
app.get("/pousadas/:id", async (req, res, next) => {
  try {
    const pousada = pousadas.find((p) => p.id === req.params.id);
    if (!pousada) return next();
    const indexPath = isProd ? import_path.default.join(distPath, "index.html") : import_path.default.join(process.cwd(), "index.html");
    let html = import_fs.default.readFileSync(indexPath, "utf-8");
    if (!isProd && viteDevServer) {
      html = await viteDevServer.transformIndexHtml(req.originalUrl, html);
    }
    html = injectPousadaMeta(html, pousada);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    next(err);
  }
});
app.get("/site/:slug", async (req, res, next) => {
  try {
    const pousada = pousadas.find((p) => slugify(p.name) === req.params.slug);
    if (!pousada) return next();
    const indexPath = isProd ? import_path.default.join(distPath, "index.html") : import_path.default.join(process.cwd(), "index.html");
    let html = import_fs.default.readFileSync(indexPath, "utf-8");
    if (!isProd && viteDevServer) {
      html = await viteDevServer.transformIndexHtml(req.originalUrl, html);
    }
    html = injectPousadaMeta(html, pousada);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    next(err);
  }
});
async function startLocalServer() {
  await ensureDataSynced();
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    viteDevServer = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(viteDevServer.middlewares);
  } else {
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}
if (!process.env.VERCEL) {
  startLocalServer();
}
var server_default = app;
//# sourceMappingURL=server.cjs.map
