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
}

export interface Guide {
  id: string;
  name: string;
  languages: string[];
  specialty: string[]; // ['Observação de aves', 'Safári fotográfico', 'Trilhas de longo curso']
  status: 'disponivel' | 'indisponivel';
  email: string;
  phone: string;
  bio?: string; // breve histórico/apresentação do guia
  age?: number;
  birthplace?: string; // origem / local de nascimento
  interests?: string[]; // temas de interesse do guia (piloteiro, passarinheiro, botânica, etc.) — usados para casar o guia certo com o turista certo
  rating?: number; // média calculada a partir das avaliações recebidas
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
  type: 'guia' | 'pousada';
  status: 'pendente' | 'contatado' | 'aprovado' | 'rejeitado';
  dateCreated: string;
  // Opaque token returned once at submission time — required (alongside the
  // email) to look up status publicly, so knowing/guessing someone's email
  // alone isn't enough to see their application.
  statusToken?: string;
  // comuns
  name: string; // nome do guia OU nome do responsável pela pousada
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
  location?: string;
  capacity?: number;
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
