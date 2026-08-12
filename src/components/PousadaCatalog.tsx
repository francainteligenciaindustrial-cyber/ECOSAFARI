import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import { Star, MapPin, Compass, PlayCircle, Eye, ChevronRight, MessageCircle, ChevronLeft, X, Smartphone, BadgeCheck, UtensilsCrossed, User } from "lucide-react";
import { Pousada, Review, Species, Sighting, PublicBookingSummary, Atracao, Guide } from "../types";
import PictureImg from "./PictureImg";
import { navigate } from "../lib/router";
import { getLanguageFlag } from "../lib/languageFlags";

// Code-split — see App.tsx for why (same component, lazy-loaded separately
// here since this page embeds it directly too).
const MobileSimulator = lazy(() => import("./MobileSimulator"));

// Educational fallback content shown only while the admin hasn't registered
// any real species yet (see displaySpecies below). Deliberately has no
// bestPousadaId/bestPousadaName of its own — those used to be hardcoded to
// fake demo lodge names ("Araras Eco Lodge", "Cristalino Lodge", etc.) that
// don't exist in the real database, which silently mismatched whatever real
// pousada the "Conhecer Pousada Ideal" button actually opened (it always
// fell back to pousadas[0] since the fake id never matched). Real pousadas
// are bound in dynamically at render time instead.
const WILD_SPECIES_INFO = [
  {
    id: "capivara",
    name: "Capivara",
    scientificName: "Hydrochoerus hydrochaeris",
    category: "MAMÍFERO TERRESTRE",
    description: "O maior roedor do mundo vive harmoniosamente em grandes grupos familiares ao longo das margens ensolaradas do Rio Cuiabá.",
    details: "As capivaras são animais extremamente sociáveis e excelentes nadadoras. No Pantanal, elas desempenham um papel crucial no ecossistema, servindo como uma das principais presas para jacarés e onças-pintadas. Podem permanecer submersas por até 5 minutos para escapar de predadores.",
    sightings: "95%+ AVISTAMENTOS",
    image: "/species/capivara.png"
  },
  {
    id: "jacare",
    name: "Jacaré-do-Pantanal",
    scientificName: "Caiman yacare",
    category: "RÉPTIL PREDADOR",
    description: "Soberano das águas calmas, é comumente visto regulando sua temperatura sob o sol quente nas praias de areia branca.",
    details: "O jacaré-do-pantanal alimenta-se principalmente de peixes e moluscos. Após quase serem extintos devido à caça ilegal nas décadas de 1970 e 1980, hoje a população está totalmente recuperada e estimada em milhões de indivíduos, sendo um dos maiores casos de sucesso em conservação ambiental no Brasil.",
    sightings: "95%+ AVISTAMENTOS",
    image: "/species/jacare-do-pantanal.png"
  },
  {
    id: "tucano",
    name: "Tucano-Toco",
    scientificName: "Ramphastos toco",
    category: "AVE ICÔNICA",
    description: "Com seu bico laranja vibrante, é a ave mais reconhecível do Pantanal, avistada com frequência nas copas das árvores à beira-rio.",
    details: "O bico do tucano, embora pareça pesado, é extremamente leve pois sua estrutura interna é esponjosa. Ele funciona como um sofisticado regulador térmico, dissipando o calor do corpo em dias quentes. Alimentam-se de frutos, mas também de ovos e filhotes de outras aves.",
    sightings: "90%+ AVISTAMENTOS",
    image: "/species/tucano-toco.png"
  },
  {
    id: "cardeal",
    name: "Cardeal-de-crista-vermelha",
    scientificName: "Paroaria coronata",
    category: "AVE CANTORA",
    description: "Reconhecível por seu topete vermelho vibrante contrastando com o peito branco, é presença certa nas margens arborizadas do Pantanal.",
    details: "Esta pequena ave destaca-se pela crista vermelha pontiaguda e canto melodioso. Vivem em pares ou pequenos bandos familiares e habitam vegetações arbustivas próximas à água, onde alimentam-se de sementes, insetos e pequenos frutos caídos.",
    sightings: "85%+ AVISTAMENTOS",
    image: "/species/cardeal.png"
  },
  {
    id: "arara",
    name: "Arara-Canindé",
    scientificName: "Ara ararauna",
    category: "AVE ICÔNICA",
    description: "Com plumagem azul e amarela vibrante, voa em casais que permanecem juntos por toda a vida, um símbolo de fidelidade na natureza pantaneira.",
    details: "As araras-canindé utilizam seus bicos fortes como um terceiro membro para escaladas e para quebrar sementes duras de palmeiras. Elas nidificam em troncos ocos de palmeiras mortas e o casal divide todas as tarefas de cuidado com os ovos e filhotes.",
    sightings: "95%+ AVISTAMENTOS",
    image: "/species/arara-caninde.png"
  },
  {
    id: "onca",
    name: "Onça-Pintada",
    scientificName: "Panthera onca",
    category: "PREDADOR TOPO",
    description: "A rainha indiscutível do Pantanal, observada espreitando entre a folhagem densa — o avistamento mais desejado de toda expedição.",
    details: "A onça-pintada é o maior felino das Américas. No Pantanal, devido à abundância de presas e proteção estrita, elas atingem quase o dobro do peso de suas parentes amazônicas. São excelentes nadadoras e caçam jacarés e capivaras diretamente nas margens dos rios.",
    sightings: "95%+ AVISTAMENTOS",
    image: "/species/onca-pintada.png"
  },
  {
    id: "coruja",
    name: "Coruja-Buraqueira",
    scientificName: "Athene cunicularia",
    category: "AVE NOTURNA",
    description: "Ao contrário da maioria das corujas, é ativa também durante o dia e vive em tocas no chão, observando o campo com seus olhos amarelos atentos.",
    details: "As corujas-buraqueiras escavam seus próprios ninhos no solo ou aproveitam buracos abandonados de tatu. Elas acumulam esterco ao redor de suas tocas para atrair besouros, que servem de alimento fácil, demonstrando um comportamento incrivelmente astuto de uso de ferramentas.",
    sightings: "90%+ AVISTAMENTOS",
    image: "/species/coruja-buraqueira.png"
  },
  {
    id: "curicaca",
    name: "Curicaca",
    scientificName: "Theristicus caudatus",
    category: "AVE RÚSTICA",
    description: "De canto forte e característico ao amanhecer, é vista em campos abertos e praias fluviais com seu bico longo e curvado perfeito para alimentação.",
    details: "A curicaca possui um grito metálico muito alto e inconfundível, frequentemente ouvido no raiar do dia. Seu bico longo e curvado é perfeitamente adaptado para sondar o solo úmido e lodo em busca de insetos, aranhas, anfíbios e pequenos répteis.",
    sightings: "95%+ AVISTAMENTOS",
    image: "/species/curicaca.png"
  }
];

interface PousadaCatalogProps {
  pousadas: Pousada[];
  reviews: Review[];
  species?: Species[];
  sightings?: Sighting[];
  bookings?: PublicBookingSummary[];
  onAddSighting?: (sighting: Sighting) => void;
  onRefreshData?: () => void;
  onSelectPousada: (pousada: Pousada) => void;
  onSelectVideo: (pousada: Pousada) => void;
  onAddReview: (newReview: any) => void;
  onOpenBotWithPousada: (pousada: Pousada) => void;
}

export default function PousadaCatalog({
  pousadas,
  reviews,
  species = [],
  sightings = [],
  bookings = [],
  onAddSighting = () => {},
  onRefreshData = () => {},
  onSelectPousada,
  onSelectVideo,
  onAddReview,
  onOpenBotWithPousada
}: PousadaCatalogProps) {
  // Binds each fallback species to a real partner pousada (round-robin) so
  // "Onde avistar esta espécie" always names a lodge that actually exists —
  // and that the "Conhecer Pousada Ideal" button actually opens — instead of
  // a fixed fake name from demo data.
  const displaySpecies = species.length > 0
    ? species
    : WILD_SPECIES_INFO.map((s, idx) => {
        const realPousada = pousadas.length > 0 ? pousadas[idx % pousadas.length] : null;
        return {
          ...s,
          bestPousadaId: realPousada?.id || "",
          bestPousadaName: realPousada?.name || "Pousadas parceiras EcoSafari"
        };
      });
  const [filterLocation, setFilterLocation] = useState("all");
  const [ratingInput, setRatingInput] = useState(5);
  const [commentInput, setCommentInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [photoUrlInput, setPhotoUrlInput] = useState("");
  const [selectedPousadaForReview, setSelectedPousadaForReview] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Atrações (Paradas Legais / Restaurantes) and Guias — fetched locally
  // instead of threading through App.tsx's central fetchData, since this is
  // the only place on the public site that browses them (their own detail
  // pages at /atracoes/:id and /guias/:id fetch independently too).
  const [atracoes, setAtracoes] = useState<Atracao[]>([]);
  const [guiasPublicos, setGuiasPublicos] = useState<Omit<Guide, "email" | "phone">[]>([]);
  useEffect(() => {
    fetch("/api/atracoes").then(res => res.json()).then(setAtracoes).catch(() => {});
    fetch("/api/guides/public").then(res => res.json()).then(setGuiasPublicos).catch(() => {});
  }, []);

  // Wildlife Showcase species details and carousel navigation
  const [selectedSpecies, setSelectedSpecies] = useState<any | null>(null);
  const speciesCarouselRef = useRef<HTMLDivElement>(null);

  const scrollSpeciesLeft = () => {
    if (speciesCarouselRef.current) {
      speciesCarouselRef.current.scrollBy({ left: -360, behavior: "smooth" });
    }
  };

  const scrollSpeciesRight = () => {
    if (speciesCarouselRef.current) {
      speciesCarouselRef.current.scrollBy({ left: 360, behavior: "smooth" });
    }
  };

  const faqs = [
    {
      question: "Como chego à pousada no interior do Mato Grosso?",
      answer: "A maioria dos hóspedes chega de avião via Aeroporto de Cuiabá (CGB). Nós providenciamos translados privativos em picapes 4x4 robustas e climatizadas com motorista diretamente até a pousada. O trajeto passa pela famosa Rodovia Transpantaneira, onde você já avista jacarés e tuiuiús das janelas."
    },
    {
      question: "Quão segura é a expedição? Há suporte de saúde próximo?",
      answer: "Extremamente segura. Nossos barcos de duralumínio são largos e estáveis, equipados com motores Yamaha duplos, coletes salva-vidas premium e comunicadores via satélite. Os guias são certificados Cadastur, treinados em primeiros socorros de áreas remotas e carregam estojos de atendimento contendo epinefrina. Analisamos detalhadamente as alergias e medicamentos no nosso formulário de agendamento antes da sua vinda."
    },
    {
      question: "Qual é o melhor período do ano para ver as Onças-Pintadas?",
      answer: "A melhor época é a estação seca do Mato Grosso, que vai de Junho até o final de Novembro. Nesse período, a água do Pantanal baixa, forçando os animais (como onças, ariranhas e aves exóticas) a se reunirem na beira dos rios principais em busca de água e peixes, permitindo mais de 95% de sucesso de avistamento."
    },
    {
      question: "Vocês atendem alergias alimentares severas e medicamentos especiais?",
      answer: "Sim! Seguimos padrões rigorosos de alimentação e saúde. Nosso formulário de agendamento inclui perguntas de saúde física. Compartilhamos estas informações com os chefes da cozinha para prevenção total de contaminação cruzada para celíacos ou alérgicos a amendoins, e nossa recepção dispõe de geladeiras de respaldo clínico exclusivas para armazenar medicamentos sensíveis (como insulina)."
    }
  ];

  // Set default selected pousada for review once pousadas load
  useEffect(() => {
    if (pousadas.length > 0 && !selectedPousadaForReview) {
      setSelectedPousadaForReview(pousadas[0]?.id || "");
    }
  }, [pousadas, selectedPousadaForReview]);

  // Por enquanto, exibimos só o filtro de Mato Grosso (demais biomas ocultos temporariamente).
  const uniqueLocations = ["Mato Grosso"];

  const filteredPousadas = filterLocation === "all"
    ? pousadas
    : pousadas.filter(p => p && typeof p.location === "string" && p.location.includes(filterLocation));

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim() || !commentInput.trim() || submittingReview) return;

    setSubmittingReview(true);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pousadaId: selectedPousadaForReview,
          userName: nameInput,
          rating: ratingInput,
          comment: commentInput,
          photoUrl: photoUrlInput.trim() || undefined
        })
      });

      if (!response.ok) throw new Error();
      const newRev = await response.json();
      onAddReview(newRev);

      setNameInput("");
      setCommentInput("");
      setPhotoUrlInput("");
      setRatingInput(5);
      setReviewSuccess(true);
      setTimeout(() => setReviewSuccess(false), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div id="landing-page" className="bg-editorial-bg min-h-screen text-editorial-text font-sans">
      
      {/* Hero Section */}
      <section className="relative h-[550px] flex items-center justify-center bg-editorial-primary text-white overflow-hidden">
        {/* Ambient video-like image background with darker overlay */}
        <div className="absolute inset-0 opacity-25 bg-[url('https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&w=1600&q=80')] bg-cover bg-center"></div>
        
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-editorial-primary/45"></div>
        
        <div className="relative max-w-5xl mx-auto px-6 text-center z-10 flex flex-col items-center">
          <h1 className="text-4xl md:text-6xl font-serif tracking-tight mb-6 max-w-4xl text-balance leading-tight">
            Seja um dos primeiros a descobrir a <span className="italic font-normal opacity-90">fauna e flora escondida</span> no interior de Mato Grosso
          </h1>
          <p className="text-sm md:text-base text-[#EFECE6] mb-8 max-w-2xl text-balance font-light leading-relaxed tracking-wide">
            Conectamos você às pousadas de selva mais conceituadas e sustentáveis do Mato Grosso. Viva safáris inesquecíveis guiados por biólogos locais.
          </p>
          <div className="flex flex-wrap gap-4 justify-center text-[11px] uppercase tracking-[0.2em] font-semibold">
            <a href="#catalogo" className="bg-[#FDFCF8] text-editorial-primary hover:bg-[#EFECE6] px-6 py-3 rounded-none transition duration-200 shadow-sm flex items-center gap-2">
              <Compass className="h-4 w-4" /> Explorar Catálogo
            </a>
          </div>
        </div>
      </section>

      {/* Catalog Filters and Section */}
      <section id="catalogo" className="max-w-7xl mx-auto px-6 py-16 scroll-mt-10">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-12 border-b border-editorial-border pb-6 gap-6">
          <div>
            <span className="text-[10px] uppercase tracking-[0.3em] text-editorial-primary font-bold">Acomodações Exclusivas</span>
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-editorial-primary mt-1 tracking-tight">Nossas Pousadas Parceiras</h2>
            <p className="text-editorial-muted text-xs mt-2 max-w-xl">Hospedagens selecionadas que respeitam o meio ambiente e promovem a conservação local.</p>
          </div>
          
          {/* Location Filters */}
          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest font-bold">
            <button
              onClick={() => setFilterLocation("all")}
              className={`px-4 py-2 rounded-none transition duration-200 border cursor-pointer ${
                filterLocation === "all"
                  ? "bg-editorial-primary text-[#FDFCF8] border-editorial-primary shadow-sm"
                  : "bg-white text-editorial-text hover:bg-editorial-secondary border-editorial-border"
              }`}
            >
              Todos os Biomas
            </button>
            {uniqueLocations.map((loc, idx) => (
              <button
                key={idx}
                onClick={() => setFilterLocation(loc)}
                className={`px-4 py-2 rounded-none transition duration-200 border cursor-pointer ${
                  filterLocation === loc
                    ? "bg-editorial-primary text-[#FDFCF8] border-editorial-primary shadow-sm"
                    : "bg-white text-editorial-text hover:bg-editorial-secondary border-editorial-border"
                }`}
              >
                {loc}
              </button>
            ))}
          </div>
        </div>

        {/* Catalog Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {filteredPousadas.map((pousada) => (
            <div
              key={pousada.id}
              className="bg-white border border-editorial-border overflow-hidden hover:shadow-sm transition duration-300 flex flex-col group h-full"
            >
              {/* Image Container with Tag */}
              <div className="relative h-64 overflow-hidden">
                <PictureImg
                  src={(pousada.images && pousada.images[0]) || "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=800&q=80"}
                  alt={pousada.name || "Pousada"}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-102 transition duration-500"
                />
                <div className="absolute top-4 left-4 bg-editorial-primary/95 text-[#FDFCF8] px-3 py-1 text-[9px] uppercase tracking-wider font-bold flex items-center gap-1 shadow-sm">
                  <MapPin className="h-3 w-3" /> {pousada.location || "Localização não disponível"}
                </div>
                <div className="absolute top-4 right-4 bg-[#FDFCF8] text-editorial-text px-2.5 py-1 text-[10px] font-bold flex items-center gap-1 shadow-sm border border-editorial-border">
                  {pousada.rating > 0 ? (
                    <><Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" /> {pousada.rating}</>
                  ) : (
                    <><Star className="h-3.5 w-3.5 text-editorial-muted" /> Novo</>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="text-2xl font-serif text-editorial-primary group-hover:text-editorial-primary/80 transition font-bold">
                      {pousada.name || "Pousada Parceira"}
                    </h3>
                    {pousada.verified && (
                      <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" title="Pousada verificada pela nossa equipe">
                        <BadgeCheck className="h-3 w-3" /> Verificada
                      </span>
                    )}
                  </div>
                  <p className="text-editorial-muted text-xs leading-relaxed mb-4 line-clamp-2">
                    {pousada.description || "Sem descrição disponível."}
                  </p>
                  {!!pousada.viewCount && pousada.viewCount > 0 && (
                    <p className="flex items-center gap-1.5 text-editorial-muted text-[10px] font-semibold mb-4 -mt-2">
                      <Eye className="h-3 w-3" /> {pousada.viewCount} {pousada.viewCount === 1 ? "pessoa já visualizou" : "pessoas já visualizaram"} esta pousada
                    </p>
                  )}

                  {/* Key Features Tags */}
                  <div className="flex flex-wrap gap-1.5 mb-6">
                    {(pousada.features || []).slice(0, 3).map((f, i) => (
                      <span key={i} className="bg-editorial-secondary text-editorial-muted px-2 py-0.5 text-[9px] uppercase tracking-wider font-bold border border-editorial-border">
                        {f}
                      </span>
                    ))}
                    {pousada.features && pousada.features.length > 3 && (
                      <span className="text-editorial-dark-muted text-[9px] px-1 py-0.5 font-bold uppercase tracking-wider">
                        +{pousada.features.length - 3} mais
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer and CTA Actions */}
                <div className="border-t border-editorial-border pt-4 flex items-center justify-between mt-auto">
                  <div>
                    <span className="block text-editorial-dark-muted text-[9px] uppercase font-bold tracking-widest">A partir de</span>
                    <span className="text-xl font-serif font-bold text-editorial-primary">R$ {pousada.pricePerNight}</span>
                    <span className="text-editorial-muted text-xs">/noite</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSelectVideo(pousada)}
                      className="bg-editorial-beige hover:bg-editorial-border/60 text-editorial-primary p-2.5 rounded-none border border-editorial-border transition flex items-center gap-1 cursor-pointer"
                      title="Saiba Mais (Vídeo do Safári)"
                    >
                      <PlayCircle className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onSelectPousada(pousada)}
                      className="bg-editorial-primary hover:bg-editorial-primary/90 text-white px-4 py-2.5 rounded-none text-xs uppercase tracking-wider font-bold transition flex items-center gap-1 shadow-sm cursor-pointer"
                    >
                      Detalhes <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty state — a freshly launched site (or a location filter with
            no matches yet) shouldn't just render a blank grid, which reads
            as broken rather than "nothing here yet". */}
        {filteredPousadas.length === 0 && (
          <div className="text-center py-20 border border-dashed border-editorial-border bg-white/40">
            <Compass className="h-8 w-8 text-editorial-muted mx-auto mb-3" />
            <p className="text-editorial-text font-serif text-lg font-bold mb-1">
              {pousadas.length === 0 ? "Nossas pousadas parceiras chegam em breve" : "Nenhuma pousada encontrada para este filtro"}
            </p>
            <p className="text-editorial-muted text-sm max-w-md mx-auto">
              {pousadas.length === 0
                ? "Estamos selecionando as melhores pousadas do Pantanal para você. Volte em breve para conferir o catálogo completo."
                : "Tente outra localização ou fale com a gente pelo WhatsApp para indicações personalizadas."}
            </p>
          </div>
        )}
      </section>

      {/* Atrações Parceiras & Nossos Guias — public discovery for the other
          two partner types in the ecossistema, each with its own profile
          page at /atracoes/:id and /guias/:id (see AtracaoDetailsView and
          GuiaDetailsView). Only rendered once there's something to show. */}
      {(atracoes.length > 0 || guiasPublicos.length > 0) && (
        <section className="max-w-7xl mx-auto px-6 py-16 border-t border-editorial-border space-y-16">
          {atracoes.length > 0 && (
            <div>
              <div className="text-center mb-10">
                <span className="text-editorial-primary text-[11px] uppercase tracking-[0.2em] font-bold">Ecossistema EcoSafari</span>
                <h2 className="text-3xl md:text-4xl font-serif font-bold text-editorial-text mt-2">Atrações Parceiras</h2>
                <p className="text-editorial-muted text-sm mt-2 max-w-xl mx-auto">Paradas legais e restaurantes selecionados para completar sua experiência no Pantanal.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {atracoes.map(atracao => (
                  <div
                    key={atracao.id}
                    onClick={() => navigate(`/atracoes/${atracao.id}`)}
                    className="group bg-white border border-editorial-border overflow-hidden cursor-pointer hover:shadow-lg transition"
                  >
                    <div className="h-44 bg-zinc-200 overflow-hidden relative">
                      {atracao.images[0] ? (
                        <img src={atracao.images[0]} alt={atracao.name} referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-editorial-muted"><UtensilsCrossed className="h-8 w-8" /></div>
                      )}
                      <span className="absolute top-3 left-3 bg-white/95 text-editorial-primary text-[9px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full">
                        {atracao.type === "restaurante" ? "Restaurante" : "Parada Legal"}
                      </span>
                      {atracao.verified && (
                        <span className="absolute top-3 right-3 flex items-center gap-1 bg-emerald-500/90 text-white text-[9px] uppercase tracking-widest font-bold px-2 py-1 rounded-full"><BadgeCheck className="h-3 w-3" /></span>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-serif font-bold text-editorial-text group-hover:text-editorial-primary transition">{atracao.name}</h3>
                      <div className="flex items-center gap-3 mt-1.5 text-editorial-muted text-xs">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {atracao.location}</span>
                        {atracao.rating > 0 ? (
                          <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-500 text-amber-500" /> {atracao.rating}</span>
                        ) : (
                          <span className="flex items-center gap-1"><Star className="h-3 w-3" /> Novo</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {guiasPublicos.length > 0 && (
            <div>
              <div className="text-center mb-10">
                <span className="text-editorial-primary text-[11px] uppercase tracking-[0.2em] font-bold">Ecossistema EcoSafari</span>
                <h2 className="text-3xl md:text-4xl font-serif font-bold text-editorial-text mt-2">Nossos Guias</h2>
                <p className="text-editorial-muted text-sm mt-2 max-w-xl mx-auto">Conheça os guias locais que conduzem as expedições — cada um com seu próprio perfil.</p>
              </div>
              {/* flex-wrap + justify-center (not a plain grid) so an odd
                  leftover card on the last row centers itself instead of
                  sitting flush-left — justify-content applies per wrapped
                  line, so this works for any guide count without special-
                  casing odd/even. */}
              <div className="flex flex-wrap justify-center gap-6">
                {guiasPublicos.map(guia => (
                  <div
                    key={guia.id}
                    onClick={() => navigate(`/guias/${guia.id}`)}
                    className="group text-center cursor-pointer w-[calc(50%-12px)] sm:w-[calc(33.333%-16px)] lg:w-[calc(25%-18px)]"
                  >
                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-editorial-border mx-auto mb-3 bg-editorial-secondary flex items-center justify-center group-hover:border-editorial-primary transition">
                      {guia.photoUrl ? (
                        <img src={guia.photoUrl} alt={guia.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : (
                        <User className="h-8 w-8 text-editorial-muted" />
                      )}
                    </div>
                    {guia.languages && guia.languages.length > 0 && (
                      <div className="flex items-center justify-center gap-1 mb-1" title={guia.languages.map(l => l.language).join(", ")}>
                        {guia.languages.map((l, i) => <span key={i} aria-hidden="true">{getLanguageFlag(l.language) || "🏳️"}</span>)}
                      </div>
                    )}
                    <h3 className="font-serif font-bold text-editorial-text text-sm group-hover:text-editorial-primary transition">{guia.name}</h3>
                    <p className="text-editorial-muted text-[11px] mt-0.5 flex items-center justify-center gap-1">
                      {guia.rating ? <><Star className="h-3 w-3 fill-amber-500 text-amber-500" /> {guia.rating}</> : <><Star className="h-3 w-3" /> Novo</>}
                    </p>
                    {guia.bio && (
                      <p className="text-editorial-muted text-[11px] mt-1 line-clamp-2 leading-snug">{guia.bio}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Wildlife Species Showcase (O que avistar) Section */}
      <section className="bg-[#121613] text-[#FDFCF8] py-24 border-t border-editorial-border/10 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-editorial-primary/10 rounded-full blur-[150px] pointer-events-none"></div>

        <div className="relative max-w-7xl mx-auto px-6 z-10">
          
          {/* Section Header */}
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <span className="text-[10px] uppercase tracking-[0.3em] text-amber-500 font-bold mb-3 block">
              EXPEDIÇÃO FOTOGRÁFICA
            </span>
            <h2 className="text-3xl md:text-5xl font-serif font-bold text-white tracking-tight leading-tight">
              Veja o que você tem a chance de avistar em um passeio conosco
            </h2>
            <p className="text-zinc-400 text-xs md:text-sm mt-4 font-light leading-relaxed max-w-2xl mx-auto">
              Use as setas ou deslize para o lado para conhecer as espécies mais icônicas que encontramos diariamente nos rios do Mato Grosso.
            </p>
          </div>

          {/* Carousel Viewport Wrapper */}
          <div className="relative group/carousel">
            
            {/* Left Button — sits in the gutter created by the scroll
                container's px-16 padding below, clear of card content at
                every breakpoint (it used to sit partly on top of the first/
                last card's text). */}
            <button
              onClick={scrollSpeciesLeft}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-11 h-11 md:w-12 md:h-12 rounded-full border border-amber-500/30 bg-[#121613]/85 hover:bg-amber-500 hover:text-[#121613] hover:border-amber-500 text-amber-500 flex items-center justify-center transition-all duration-300 focus:outline-none backdrop-blur-sm shadow-lg cursor-pointer"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            {/* Right Button */}
            <button
              onClick={scrollSpeciesRight}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-11 h-11 md:w-12 md:h-12 rounded-full border border-amber-500/30 bg-[#121613]/85 hover:bg-amber-500 hover:text-[#121613] hover:border-amber-500 text-amber-500 flex items-center justify-center transition-all duration-300 focus:outline-none backdrop-blur-sm shadow-lg cursor-pointer"
              aria-label="Próximo"
            >
              <ChevronRight className="h-6 w-6" />
            </button>

            {/* Horizontal Scroll container */}
            <div
              ref={speciesCarouselRef}
              className="flex gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-8 px-14 md:px-16"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {displaySpecies.map((specie) => (
                <div
                  key={specie.id}
                  className="bg-[#1A201C]/90 border border-white/5 w-[290px] md:w-[350px] flex-shrink-0 flex flex-col justify-between snap-start hover:border-amber-500/25 transition-all duration-500 group rounded-none"
                >
                  {/* Image container */}
                  <div className="relative h-60 md:h-64 overflow-hidden">
                    <PictureImg
                      src={specie.image}
                      alt={specie.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-700"
                    />
                  </div>

                  {/* Body Content */}
                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <span className="text-amber-500 text-[9px] uppercase tracking-[0.2em] font-bold mb-2 block">
                        {specie.category}
                      </span>
                      <h3 className="text-xl md:text-2xl font-serif font-bold text-white mb-3">
                        {specie.name}
                      </h3>
                      <p className="text-zinc-300/85 text-xs leading-relaxed font-light line-clamp-3 mb-4">
                        {specie.description}
                      </p>
                    </div>

                    <div>
                      <hr className="border-white/10 my-4" />
                      
                      {/* Card Footer info */}
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                        <span className="text-zinc-400">
                          {specie.sightings}
                        </span>
                        <button
                          onClick={() => setSelectedSpecies(specie)}
                          className="text-amber-500 hover:text-amber-400 transition flex items-center gap-1 cursor-pointer font-bold uppercase tracking-wider"
                        >
                          Quero Ver <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>

        </div>
      </section>

      {/* App Promotion & Interactive Simulator Section */}
      <section className="bg-gradient-to-br from-[#0e120f] via-[#161d18] to-[#0e120f] text-white py-20 border-t border-white/5 relative overflow-hidden">
        {/* Background ambient light */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full filter blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/5 rounded-full filter blur-[120px] pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
          
          {/* Left Column: Advertising Copy */}
          <div className="lg:col-span-7 flex flex-col justify-center text-left">
            <h2 className="text-3xl md:text-5xl font-serif font-bold tracking-tight mb-6 text-balance text-white">
              Baixe o App Oficial <br className="hidden md:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-amber-400 to-emerald-400">
                EcoSafari Go
              </span>
            </h2>
            <p className="text-zinc-300 text-xs md:text-sm leading-relaxed mb-8 font-light max-w-xl">
              Maximize sua expedição no Pantanal com nosso aplicativo exclusivo para hóspedes. 
              Monitore avistamentos de animais ao vivo, faça check-in autônomo por GPS e receba 
              alertas ecológicos de extrema relevância emitidos pelos nossos guias e biólogos credenciados.
            </p>

            {/* Feature list */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 max-w-2xl">
              <div className="bg-[#1A201C]/60 border border-white/5 p-4 rounded-none">
                <span className="text-lg mb-2 block">📸</span>
                <h4 className="font-serif font-semibold text-white text-xs mb-1">Feed de Fauna</h4>
                <p className="text-zinc-400 text-[10px] leading-relaxed">
                  Poste e veja fotos de animais avistados em tempo real na região.
                </p>
              </div>
              <div className="bg-[#1A201C]/60 border border-white/5 p-4 rounded-none">
                <span className="text-lg mb-2 block">🛰️</span>
                <h4 className="font-serif font-semibold text-white text-xs mb-1">Check-in Satélite</h4>
                <p className="text-zinc-400 text-[10px] leading-relaxed">
                  Homologue sua chegada fisicamente via geofencing sem pegar filas.
                </p>
              </div>
              <div className="bg-[#1A201C]/60 border border-white/5 p-4 rounded-none">
                <span className="text-lg mb-2 block">🚨</span>
                <h4 className="font-serif font-semibold text-white text-xs mb-1">Alertas Ecológicos</h4>
                <p className="text-zinc-400 text-[10px] leading-relaxed">
                  Avisos sonoros imediatos de onças e animais vistos nos arredores.
                </p>
              </div>
            </div>

            {/* App Store / Google Play Badges & Action */}
            <div className="flex flex-wrap items-center gap-4">
              <a 
                href="#download-ios" 
                onClick={(e) => {
                  e.preventDefault();
                  alert("Simulação de download iniciada! O arquivo .IPA do EcoSafari Go seria baixado no seu iPhone.");
                }}
                className="flex items-center gap-3 bg-black hover:bg-zinc-900 border border-white/10 px-5 py-2.5 rounded-xl transition shadow-lg group shrink-0"
              >
                <svg viewBox="0 0 384 512" className="h-6 w-6 fill-white flex-shrink-0" aria-hidden="true">
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                </svg>
                <div className="text-left">
                  <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest block leading-none">Download on the</span>
                  <span className="text-xs text-white font-bold block mt-0.5">App Store</span>
                </div>
              </a>

              <a 
                href="#download-android" 
                onClick={(e) => {
                  e.preventDefault();
                  alert("Simulação de download iniciada! O arquivo .APK do EcoSafari Go para Android foi gerado com sucesso.");
                }}
                className="flex items-center gap-3 bg-black hover:bg-zinc-900 border border-white/10 px-5 py-2.5 rounded-xl transition shadow-lg group shrink-0"
              >
                <svg viewBox="0 0 512 512" className="h-6 w-6 flex-shrink-0" aria-hidden="true">
                  <path fill="#00D4FF" d="M39 5C34 8 30 13 30 20v472c0 7 4 12 9 15l236-256z"/>
                  <path fill="#00F076" d="M39 5l236 251L39 507c-3-2-6-5-8-8l228-243L31 13c2-3 5-6 8-8z"/>
                  <path fill="#FFBC00" d="M275 233l72-40c11-6 17-16 17-27s-6-21-17-27l-72-40-78 67z"/>
                  <path fill="#FF3A44" d="M275 233l-78 67 150-87-72-40z"/>
                </svg>
                <div className="text-left">
                  <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest block leading-none">Get it on</span>
                  <span className="text-xs text-white font-bold block mt-0.5">Google Play</span>
                </div>
              </a>
            </div>
          </div>

          {/* Right Column: Live Interactive Smartphone Mockup */}
          <div className="lg:col-span-5 flex justify-center relative">
            {/* Background glowing aura */}
            <div className="absolute inset-0 bg-emerald-500/10 rounded-full filter blur-[80px] pointer-events-none scale-75"></div>

            <div className="relative mx-auto w-[320px] h-[640px] bg-black border-[10px] border-zinc-800 rounded-[40px] shadow-2xl overflow-hidden flex flex-col shrink-0 ring-1 ring-zinc-700/40 transform lg:rotate-2 hover:rotate-0 transition-all duration-500">
              {/* Notch */}
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 h-4 w-28 bg-zinc-800 rounded-b-lg z-30 flex justify-center items-center">
                <div className="w-10 h-0.5 bg-zinc-900 rounded-full mb-1"></div>
              </div>

              {/* Status Bar */}
              <div className="h-8 bg-zinc-950 text-[9px] font-bold px-5 pt-1.5 flex justify-between items-center z-20 shrink-0 text-white select-none font-sans">
                <span>15:14</span>
                <div className="flex items-center gap-1.5 text-[8px]">
                  <span>📶</span>
                  <span>4G</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Smartphone Inner Live Content */}
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div></div>}>
                <MobileSimulator
                  sightings={sightings}
                  pousadas={pousadas}
                  bookings={bookings}
                  onAddSighting={onAddSighting}
                  onRefreshData={onRefreshData}
                  standalone={true}
                />
              </Suspense>
            </div>

            {/* Float badge */}
            <div className="absolute -bottom-4 bg-emerald-500 text-black text-[9px] font-bold uppercase tracking-widest px-4 py-1.5 shadow-xl rotate-1">
              ✓ SIMULAÇÃO INTERATIVA 100% REAL
            </div>
          </div>

        </div>
      </section>

      {/* Species Detail Modal */}
      {selectedSpecies && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 md:p-6 z-50 animate-fadeIn">
          <div className="bg-[#121613] text-[#FDFCF8] border border-white/10 w-full max-w-4xl max-h-[90vh] md:max-h-[85vh] overflow-y-auto flex flex-col md:flex-row relative">
            
            {/* Close Button */}
            <button
              onClick={() => setSelectedSpecies(null)}
              className="absolute top-4 right-4 z-30 bg-black/60 hover:bg-amber-500 hover:text-[#121613] border border-white/10 text-[#FDFCF8] p-2 rounded-full transition cursor-pointer"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Left: Image Side */}
            <div className="w-full md:w-1/2 relative h-64 md:h-auto min-h-[300px]">
              <PictureImg
                src={selectedSpecies.image}
                alt={selectedSpecies.name}
                referrerPolicy="no-referrer"
                loading="eager"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
              
              {/* Overlay names */}
              <div className="absolute bottom-6 left-6 right-6">
                <span className="text-amber-500 text-[10px] uppercase tracking-[0.2em] font-bold block mb-1">
                  {selectedSpecies.category}
                </span>
                <h3 className="text-3xl md:text-4xl font-serif font-bold text-white mb-2 leading-none">
                  {selectedSpecies.name}
                </h3>
                <span className="text-zinc-300 font-mono text-xs italic block">
                  {selectedSpecies.scientificName}
                </span>
              </div>
            </div>

            {/* Right: Content Side */}
            <div className="w-full md:w-1/2 p-6 md:p-10 flex flex-col justify-between">
              <div>
                <span className="text-emerald-500 text-[9px] uppercase tracking-[0.2em] font-bold block mb-2">
                  ✓ {selectedSpecies.sightings}
                </span>
                
                <h4 className="text-xs uppercase font-bold tracking-widest text-zinc-400 mb-2">
                  História Natural & Comportamento
                </h4>
                <p className="text-zinc-300 text-xs md:text-sm leading-relaxed font-light mb-6">
                  {selectedSpecies.details}
                </p>

                {/* Best Lodge Card */}
                <div className="bg-[#1A201C] border border-white/5 p-4 rounded-none mb-6">
                  <span className="text-amber-500 text-[9px] font-bold uppercase tracking-widest block mb-1">
                    ONDE AVISTAR ESTA ESPÉCIE
                  </span>
                  <div className="flex justify-between items-center">
                    <div>
                      <h5 className="font-serif text-base font-semibold text-white">
                        {selectedSpecies.bestPousadaName}
                      </h5>
                      <span className="text-xs text-zinc-400">
                        Pousada com maior taxa de sucesso de rastreamento
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-white/10">
                <button
                  onClick={() => {
                    const matchedP = pousadas.find(p => String(p.id) === String(selectedSpecies.bestPousadaId)) || pousadas[0];
                    if (matchedP) {
                      onSelectPousada(matchedP);
                      setSelectedSpecies(null);
                    }
                  }}
                  className="flex-1 bg-white hover:bg-amber-500 hover:text-[#121613] text-[#121613] font-bold uppercase tracking-widest text-xs py-3.5 px-4 transition-all duration-300 text-center cursor-pointer"
                >
                  Conhecer Pousada Ideal
                </button>
                <button
                  onClick={() => {
                    const matchedP = pousadas.find(p => String(p.id) === String(selectedSpecies.bestPousadaId)) || pousadas[0];
                    if (matchedP) {
                      onOpenBotWithPousada(matchedP);
                    }
                    setSelectedSpecies(null);
                  }}
                  className="flex-1 bg-transparent hover:bg-white/5 border border-white/20 text-[#FDFCF8] font-bold uppercase tracking-widest text-xs py-3.5 px-4 transition text-center cursor-pointer"
                >
                  Solicitar Guia Especializado
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* Reviews Section */}
      <section className="bg-editorial-primary text-white py-20 border-t border-editorial-border">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Write a review column */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            <span className="text-[#EFECE6] font-bold uppercase text-[9px] tracking-[0.3em] mb-2 inline-block">Sua opinião importa</span>
            <h2 className="text-3xl md:text-4xl font-serif font-bold tracking-tight mb-4 text-balance">O que nossos aventureiros andam dizendo</h2>
            <p className="text-[#EFECE6]/80 text-xs leading-relaxed mb-6 font-light">
              Todos os relatos ao lado vêm de hóspedes reais que viveram expedições de conservação em nossas pousadas parceiras. Escreva sua avaliação e ajude outros viajantes!
            </p>

            {/* Form in Editorial style */}
            <form onSubmit={handleSubmitReview} className="bg-white text-editorial-text p-6 rounded-none shadow-sm border border-editorial-border space-y-4">
              {reviewSuccess && (
                <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 p-3 rounded-none text-xs text-center font-bold">
                  ✓ Avaliação enviada com sucesso e nota recalculada!
                </div>
              )}
              
              <div>
                <label className="block text-editorial-primary text-[10px] uppercase tracking-wider font-bold mb-1">Qual pousada você visitou?</label>
                <select
                  value={selectedPousadaForReview}
                  onChange={e => setSelectedPousadaForReview(e.target.value)}
                  className="w-full bg-editorial-secondary text-editorial-text text-xs border border-editorial-border rounded-none p-2 focus:outline-none focus:border-editorial-primary"
                >
                  {pousadas.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-editorial-primary text-[10px] uppercase tracking-wider font-bold mb-1">Seu Nome</label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    required
                    placeholder="Ex: João da Silva"
                    className="w-full bg-editorial-secondary text-editorial-text text-xs border border-editorial-border rounded-none p-2 focus:outline-none focus:border-editorial-primary"
                  />
                </div>
                <div>
                  <label className="block text-editorial-primary text-[10px] uppercase tracking-wider font-bold mb-1">Sua Nota</label>
                  <div className="flex items-center gap-1 mt-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        type="button"
                        key={star}
                        onClick={() => setRatingInput(star)}
                        className="p-1 focus:outline-none"
                      >
                        <Star className={`h-4.5 w-4.5 ${star <= ratingInput ? "text-amber-500 fill-amber-500" : "text-[#E5E2D9]"}`} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-editorial-primary text-[10px] uppercase tracking-wider font-bold mb-1">Sua Avaliação</label>
                <textarea
                  value={commentInput}
                  onChange={e => setCommentInput(e.target.value)}
                  required
                  rows={3}
                  placeholder="Conte como foi sua expedição, a pousada, os guias turísticos..."
                  className="w-full bg-editorial-secondary text-editorial-text text-xs border border-editorial-border rounded-none p-2 focus:outline-none focus:border-editorial-primary resize-none"
                ></textarea>
              </div>

              <div>
                <label className="block text-editorial-primary text-[10px] uppercase tracking-wider font-bold mb-1">Link de uma Foto Sua na Expedição (opcional)</label>
                <input
                  type="url"
                  value={photoUrlInput}
                  onChange={e => setPhotoUrlInput(e.target.value)}
                  placeholder="https://... (cole o link de uma foto real sua no passeio)"
                  className="w-full bg-editorial-secondary text-editorial-text text-xs border border-editorial-border rounded-none p-2 focus:outline-none focus:border-editorial-primary"
                />
                <p className="text-editorial-muted text-[9px] mt-1">Depoimentos com foto real ajudam outros viajantes a confiar mais na experiência.</p>
              </div>

              <button
                type="submit"
                className="w-full bg-editorial-primary hover:bg-editorial-primary/90 text-white text-[11px] font-bold uppercase tracking-widest py-3 rounded-none transition duration-200 cursor-pointer"
                disabled={submittingReview}
              >
                {submittingReview ? "Enviando..." : "Enviar Avaliação"}
              </button>
            </form>
          </div>

          {/* List of reviews column */}
          <div className="lg:col-span-7 space-y-6 max-h-[600px] overflow-y-auto pr-4 scrollbar-thin">
            {reviews.length === 0 && (
              <div className="text-center py-16 border border-dashed border-editorial-border">
                <Star className="h-7 w-7 text-editorial-muted mx-auto mb-3" />
                <p className="text-editorial-text font-serif font-bold mb-1">Seja o primeiro a avaliar</p>
                <p className="text-editorial-muted text-xs max-w-xs mx-auto">Ainda não recebemos avaliações — a sua pode ser a primeira a aparecer aqui ao lado.</p>
              </div>
            )}
            {reviews.map((review) => {
              const matchedP = pousadas.find(p => p.id === review.pousadaId);
              return (
                <div key={review.id} className="bg-white text-editorial-text border border-editorial-border p-6 rounded-none shadow-sm transition">
                  <div className="flex items-center justify-between mb-3 border-b border-editorial-border pb-3">
                    <div className="flex items-center gap-3">
                      {review.photoUrl ? (
                        <img
                          src={review.photoUrl}
                          alt={review.userName}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full object-cover border border-editorial-border flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-editorial-secondary border border-editorial-border flex items-center justify-center text-editorial-primary font-serif font-bold text-sm flex-shrink-0">
                          {review.userName?.charAt(0).toUpperCase() || "?"}
                        </div>
                      )}
                      <div>
                        <h4 className="font-serif text-base font-semibold text-editorial-primary">{review.userName}</h4>
                        {matchedP && (
                          <span className="text-[9px] text-editorial-muted font-bold uppercase tracking-widest mt-0.5 block">
                            visitou {matchedP.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`h-4 w-4 ${i < review.rating ? "text-amber-500 fill-amber-500" : "text-[#E5E2D9]"}`} />
                      ))}
                    </div>
                  </div>
                  <p className="text-editorial-muted text-xs leading-relaxed italic font-serif">
                    "{review.comment}"
                  </p>
                  <span className="text-editorial-dark-muted text-[9px] font-mono block mt-4 text-right">{review.date}</span>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="bg-white py-20 border-t border-editorial-border">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="text-[10px] uppercase tracking-[0.3em] text-editorial-primary font-bold">Dúvidas Comuns</span>
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-editorial-primary mt-1 tracking-tight">Perguntas Frequentes</h2>
            <p className="text-editorial-muted text-xs mt-2">Tudo o que você precisa saber para planejar sua jornada de conservação e aventura.</p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div key={index} className="border-b border-editorial-border pb-4">
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full flex justify-between items-center text-left py-4 focus:outline-none group cursor-pointer"
                  >
                    <span className="font-serif font-bold text-base md:text-lg text-editorial-primary group-hover:text-editorial-primary/80 transition duration-150">
                      {faq.question}
                    </span>
                    <span className="text-editorial-primary font-bold text-lg ml-4">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ${
                      isOpen ? "max-h-[500px] opacity-100 mt-2" : "max-h-0 opacity-0"
                    }`}
                  >
                    <p className="text-editorial-muted text-xs md:text-sm leading-relaxed font-light whitespace-pre-line pb-2">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Trust Badge Section */}
      <section className="bg-editorial-secondary py-16 text-center text-editorial-primary border-t border-editorial-border">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="flex flex-col items-center">
            <span className="text-4xl font-serif font-bold text-editorial-primary block">4+</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-editorial-muted mt-2">Biomas Atendidos</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-4xl font-serif font-bold text-editorial-primary block">100%</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-editorial-muted mt-2">Sustentável</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-4xl font-serif font-bold text-editorial-primary block">24/7</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-editorial-muted mt-2">Bot WhatsApp API</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-4xl font-serif font-bold text-editorial-primary block">15+</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-editorial-muted mt-2">Guias Biólogos</span>
          </div>
        </div>
      </section>

    </div>
  );
}
