export interface Pousada {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  location: string;
  rating: number;
  pricePerNight: number;
  images: string[];
  features: string[]; // ['Wifi', 'Piscina', 'Ar Condicionado', etc]
  activities: string[]; // ['Trilha guiada', 'Focagem noturna', etc]
  experiences: {
    title: string;
    description: string;
    price: number;
  }[];
  capacity: number;
  videoUrl?: string;
  verified?: boolean; // selo "Pousada Verificada" — controlado pelo admin
  viewCount?: number; // contador real de visualizações da página de detalhes
  officialSiteUrl?: string; // link do site/rede social oficial da pousada (se não tiver, usa o /site/:slug gerado)
  teamPhotoUrl?: string; // foto da equipe/família que atende os hóspedes, exibida no /site/:slug
  teamSectionTitle?: string; // título da seção (padrão: "Quem vai te receber")
  teamSectionText?: string; // texto de apresentação da equipe/família
  // Galeria exclusiva da página /site/:slug (Site Oficial) — independente de
  // "images" (usada no catálogo/visão detalhada). Quando vazia, o Site
  // Oficial usa "images" como fallback, então pousadas antigas continuam
  // mostrando uma galeria mesmo sem configurar este campo.
  officialSiteImages?: string[];
  // Estrutura de quartos — complementa "capacity" (limite agregado usado na
  // checagem de disponibilidade de reservas) com o detalhe real que um
  // hóspede quer ver: quantos quartos existem e quantas pessoas cabem em
  // cada um.
  rooms?: { type: string; capacity: number; quantity: number }[];
  // Calendário Google dedicado desta pousada (dentro da conta única já
  // conectada em Gestão → Agenda Integrada) — quando ausente, os eventos de
  // reserva confirmada caem no calendário "primary" da conta, como sempre
  // aconteceu. Ver POST /api/pousadas/:id/google-calendar.
  googleCalendarId?: string;
}

// Avaliação (antes chamada de "comentário") — unificada para os três tipos
// de parceiro (pousada, atração, guia). Exatamente um dos três IDs vem
// preenchido, dependendo de quem está sendo avaliado.
export interface Review {
  id: string;
  pousadaId?: string;
  atracaoId?: string;
  guideId?: string;
  userName: string;
  rating: number;
  comment: string;
  date: string;
  photoUrl?: string; // foto real do hóspede, opcional — reforça a prova social do depoimento
  turistaId?: string; // id do turista autenticado que avaliou — obrigatório desde que avaliar passou a exigir perfil de turista
}

export type LanguageLevel = 'basico' | 'intermediario' | 'avancado';

export interface GuideLanguage {
  language: string;
  level: LanguageLevel;
}

export interface Guide {
  id: string;
  name: string;
  languages: GuideLanguage[];
  specialty: string[]; // ['Observação de aves', 'Safári fotográfico', 'Trilhas de longo curso']
  status: 'disponivel' | 'indisponivel';
  email: string;
  phone: string;
  bio?: string; // breve histórico/apresentação do guia
  age?: number;
  birthplace?: string; // origem / local de nascimento
  interests?: string[]; // temas de interesse do guia (piloteiro, passarinheiro, botânica, etc.) — usados para casar o guia certo com o turista certo
  rating?: number; // média calculada a partir das avaliações recebidas
  photoUrl?: string; // foto de perfil — exibida na página pública do guia, tipo um perfil de rede social
  images?: string[]; // galeria de fotos do guia em campo/expedições — separada da foto de perfil
  unavailableDates?: string[]; // datas específicas bloqueadas (YYYY-MM-DD) — além do liga/desliga geral em "status"
}

// Atração: parceiro que não é uma hospedagem — "Parada Legal" (passeio,
// artesanato, lembrança) ou "Restaurante". Categoria separada de Pousada
// porque nem todo parceiro tem quartos para reservar.
export interface Atracao {
  id: string;
  type: 'parada_legal' | 'restaurante';
  name: string;
  description: string;
  location: string;
  images: string[];
  menu?: { item: string; price: number }[]; // cardápio — só para type === 'restaurante'
  availability?: string; // dias/horário de funcionamento, ex: "Terça a domingo, 11h às 22h"
  rating: number;
  verified?: boolean;
  dateCreated: string;
}

// Papel de acesso de autoatendimento do parceiro (dono de pousada/atração/
// guia editando o próprio perfil) — ver requirePartnerAccess em server.ts.
export type PartnerType = 'pousada' | 'atracao' | 'guia';

export interface PartnerProfileResponse {
  partnerType: PartnerType;
  partnerId: string;
  pousada?: Pousada;
  atracao?: Atracao;
  guia?: Guide;
}

export interface Booking {
  id: string;
  pousadaId: string;
  pousadaName: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  nationality: string;
  adults: number;
  children: number;
  childAges?: string;
  dietaryRestrictions: string;
  specialNeeds: string;
  checkIn: string;
  checkOut: string;
  experienceType: string;
  totalPrice: number;
  status: 'pendente_pagamento' | 'pago' | 'confirmado_pousada' | 'confirmado_guia' | 'confirmado_total' | 'cancelado';
  guideId?: string;
  guideName?: string;
  dateCreated: string;
  googleCalendarEventId?: string;
  // Deve bater com um Pousada.rooms[].type — quando informado, a
  // disponibilidade é checada por unidade daquele tipo de quarto (não só
  // contra a capacidade agregada da pousada). Opcional pra manter
  // compatibilidade com reservas antigas/pousadas sem "rooms" cadastrado.
  roomType?: string;
}

// Stripped-down booking shape with zero customer PII (no name/email/phone),
// used by the public-facing mobile app check-in demo — it only needs to know
// which pousada/dates are confirmed, never who the guest is.
export interface PublicBookingSummary {
  id: string;
  pousadaName: string;
  checkIn: string;
  checkOut: string;
  status: Booking['status'];
}

export interface Sighting {
  id: string;
  pousadaId: string;
  pousadaName: string;
  userName: string;
  animalName: string;
  imageUrl: string;
  location: string;
  timestamp: string;
  likes: number;
  status?: 'pendente' | 'aprovado' | 'rejeitado'; // legado — avistamentos são só do app, isso não é mais usado no site
}

export interface Species {
  id: string;
  name: string;
  scientificName: string;
  category: string;
  description: string;
  details: string;
  sightings: string;
  image: string;
  bestPousadaId: string;
  bestPousadaName: string;
}

export interface Notification {
  id: string;
  target: 'admin' | 'guide' | 'pousada';
  targetId?: string; // id of guide or pousada
  message: string;
  type: 'booking_new' | 'payment_received' | 'status_update' | 'sighting_new';
  timestamp: string;
  read: boolean;
  bookingId?: string;
}

// ----------------------------------------------------
// Camada adicional de turismo (Turistas, Roteiros, Reservas,
// Pagamentos, Guias) conforme especificação do banco de dados.
// Independente do modelo de Pousadas/Bookings já existente.
// ----------------------------------------------------

export interface Turista {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  country: string;
  age: number;
  preferences: string;
  language?: string;
  coins?: number;
  // Categorias fixas (ver src/lib/touristInterests.ts) que o turista marca
  // no próprio perfil — alimenta o cruzamento feito pela IA no chat (guia,
  // pousada, roteiro) com o que a pessoa realmente quer ver/fazer.
  interests?: string[];
  photoUrl?: string;
}

// Pousada que um turista logado marcou como "gostei" — alimenta o widget de
// perfil no cabeçalho e a lista de favoritos.
export interface Favorito {
  turistaId: string;
  pousadaId: string;
  createdAt: string;
}

// Brinde que uma pousada oferece em troca de Coins — cadastrado pelo próprio
// parceiro no portal de autoatendimento.
export interface Recompensa {
  id: string;
  pousadaId: string;
  title: string;
  description?: string;
  coinCost: number;
  active: boolean;
  createdAt: string;
}

// Troca de Coins por uma recompensa — gera um código que o turista mostra
// na pousada, que confirma o resgate no próprio portal dela.
export interface Resgate {
  id: string;
  turistaId: string;
  recompensaId: string;
  pousadaId: string;
  coinCost: number;
  code: string;
  status: 'pendente' | 'usado' | 'cancelado';
  createdAt: string;
  usedAt?: string;
}

export interface Roteiro {
  id: string;
  name: string;
  duration: string;
  price: number;
  difficulty: 'facil' | 'moderado' | 'dificil';
  capacity: number;
  description: string;
}

export interface Reserva {
  id: string;
  turistaId: string;
  roteiroId: string;
  date: string;
  status: 'pendente' | 'confirmada' | 'cancelada' | 'concluida';
  totalPrice: number;
}

export interface Pagamento {
  id: string;
  reservaId: string;
  amount: number;
  date: string;
  method: 'cartao' | 'pix' | 'boleto' | 'transferencia';
  status: 'pendente' | 'aprovado' | 'recusado' | 'estornado';
}

export interface GuiaTuristico {
  id: string;
  name: string;
  specialty: string;
  phone: string;
  availability: boolean;
  rating: number;
}

// Candidatura: público formulário de cadastro para prestadores de serviço
// (guias e pousadas) que querem se tornar parceiros. Cai num painel do
// admin para triagem e contato — não é publicado automaticamente.
export interface Candidatura {
  id: string;
  type: 'guia' | 'pousada' | 'atracao';
  status: 'pendente' | 'contatado' | 'aprovado' | 'rejeitado';
  dateCreated: string;
  // Opaque token returned once at submission time — required (alongside the
  // email) to look up status publicly, so knowing/guessing someone's email
  // alone isn't enough to see their application.
  statusToken?: string;
  // Preenchido só por POST /api/candidaturas/:id/approve — id do registro
  // (pousada/guides/atracoes) criado a partir desta candidatura, para saber
  // que ela já virou um parceiro de verdade e para onde linkar no painel.
  partnerId?: string;
  // comuns
  name: string; // nome do guia OU nome do responsável pela pousada/atração
  email: string;
  phone: string;
  message?: string;
  // específicos de guia
  languages?: string;
  availability?: string;
  age?: number;
  experienceYears?: number;
  specialty?: string;
  // específicos de pousada
  pousadaName?: string;
  location?: string; // também usado por atração
  capacity?: number;
  // específicos de atração
  atracaoName?: string;
  atracaoType?: 'parada_legal' | 'restaurante';
}

// ReferralSource: resposta da pesquisa "como você chegou até nós?" exibida
// no primeiro acesso do visitante — ajuda a entender quais canais trazem
// mais gente pro site.
export interface ReferralSource {
  id: string;
  source: 'youtube' | 'instagram' | 'facebook' | 'friend' | 'other' | 'dismissed';
  otherText?: string;
  timestamp: string;
}
