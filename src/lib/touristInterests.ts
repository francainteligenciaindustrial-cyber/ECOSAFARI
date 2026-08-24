// Taxonomia fixa de interesses do turista — categorias marcáveis (não texto
// livre), pra virar dado estruturado que a IA do chat consegue cruzar contra
// atividades de pousada/guia (interesses do guia já usam o mesmo espírito —
// ver Guide.interests em PartnerPortalPage.tsx). Mantido em espelho manual
// com TOURIST_INTEREST_OPTIONS em server.ts (que valida o que é salvo).
export const TOURIST_INTEREST_GROUPS: { label: string; options: string[] }[] = [
  {
    label: "Passeios & Aventuras",
    options: [
      "Trilhas guiadas",
      "Passeio de barco",
      "Focagem noturna",
      "Pesca esportiva",
      "Observação de aves",
      "Cavalgada",
      "Fotografia de vida selvagem",
      "Canoagem / Stand-up paddle",
    ],
  },
  {
    label: "Fauna & Flora",
    options: [
      "Onça-pintada",
      "Jacarés",
      "Aves e araras",
      "Capivaras",
      "Primatas",
      "Vida aquática",
      "Flora do Pantanal",
      "Flora do Cerrado",
    ],
  },
];

export const TOURIST_INTEREST_OPTIONS: string[] = TOURIST_INTEREST_GROUPS.flatMap(g => g.options);
