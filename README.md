# EcoSafari Brasil

Plataforma de ecoturismo no Pantanal: catálogo de pousadas, guias e atrações,
reserva online com pagamento pelo Stripe, pacotes combinados, cupons, mapa
interativo, calendário de melhor época por espécie, portal do parceiro e
painel de Gestão.

## Como rodar

Pré-requisito: Node.js 22.

```bash
npm install
cp .env.example .env   # preencha ao menos SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY
npm run dev            # http://localhost:3000 (Express + Vite no mesmo processo)
```

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor local com recarga do front-end |
| `npm run lint` | checagem de tipos (`tsc --noEmit`) |
| `npm test` | testes (Vitest) |
| `npm run build` | build do front (`dist/`) e do servidor (`dist/server.cjs`) |
| `node scripts/optimize-images.mjs` | gera `.webp` das fotos novas em `public/pousadas` e `public/species` |
| `npx tsx scripts/sync-security-headers.ts` | copia os cabeçalhos de segurança para o `vercel.json` |

O deploy é na Vercel (`vercel.json`): o front sai da CDN e as rotas `/api/*`,
`/pousadas/:id`, `/site/:slug` e `/sitemap.xml` passam pelo `api/index.ts`, que
exporta o app do `server.ts`.

## Organização do código

```
server.ts                 entrada: registra as rotas por área e sobe o servidor
server/core.ts            Express, middlewares, Supabase/Stripe/Resend/Gemini, autenticação, helpers
server/routes/            uma área por arquivo:
  catalogo.ts               pousadas, guias, atrações, espécies, avaliações, upload, páginas com SEO
  reservas.ts               reservas, agenda, confiabilidade, cron diário
  pagamentos.ts             checkout e confirmação do Stripe
  vendas.ts                 pacotes, cupons, ocupação pública, resultados do parceiro
  turistas.ts               conta do turista e reserva online
  parceiros.ts              portal do parceiro (gestores, colaboradores, produtos, consumos, caixa)
  admin.ts                  notificações, lixeira, governança, auditoria, candidaturas
  turismo.ts                turistas/roteiros/reservas/pagamentos/guias do painel
  integracoes.ts            Google Calendar, chatbot, app de Coins, saúde
src/                      front-end React (Vite + Tailwind)
  i18n/                     tradução própria pt/en/es (home, pousada, reserva)
  data/                     espécies (textos, melhor época, áreas) e localidades do mapa
  components/Admin*Tab.tsx  abas do painel de Gestão
src/lib/securityHeaders.ts fonte única dos cabeçalhos de segurança (o teste compara com o vercel.json)
scripts/*.sql             migrações do banco (rodar no SQL Editor do Supabase)
public/sw.js              service worker (PWA, funciona sem sinal)
```

## Banco de dados

Não há migração automática no deploy. Cada mudança de schema é um arquivo em
`scripts/*.sql`, para rodar no SQL Editor do Supabase. Todos podem ser rodados
mais de uma vez. As mais recentes:

1. `scripts/migracao-2026-10-melhorias.sql`
2. `scripts/add-booking-overlap-guard.sql` — trava de overbooking no próprio banco
3. `scripts/add-pacotes-cupons-mapa.sql` — pacotes, cupons e coordenadas do mapa
4. `scripts/add-remetente-por-pousada.sql` — e-mail de contato e remetente próprio de cada pousada
5. `scripts/add-dominio-proprio-pousada.sql` — domínio próprio abrindo o site oficial da pousada
6. `scripts/add-pedidos-site.sql` — venda do site oficial (Gestão → Pedidos de site)
7. `scripts/add-servico-logo.sql` — serviço de logo com aprovação de versões pelo cliente
8. `scripts/add-vinculo-app.sql` — vínculo pousada do site ↔ pousada do app EcoSafari Go
9. `scripts/add-receita-confianca-crescimento.sql` — comissão, planos, preço por temporada, afiliados, avaliação verificada, conservação e destaque
10. `scripts/add-local-foto-e-capa.sql` — local da foto nos posts do turista e enquadramento da capa
11. `scripts/add-google-maps-pousada.sql` — link da ficha no Google Maps (seção "Localização e como chegar")

**No Supabase do app** (projeto separado): `scripts/app-ecosafari-go/estatisticas-publicas.sql`
— funções somente leitura com números agregados de avistamentos aprovados, que
alimentam o calendário de melhor época e o mapa do site.

Sem a 2, duas reservas simultâneas ainda podem disputar o mesmo quarto. Sem a 3,
a vitrine de pacotes fica vazia, cupons não validam e o mapa usa só posições
aproximadas pela cidade; o resto do site funciona.

## Variáveis de ambiente

Todas estão documentadas no `.env.example`. Para produção, as obrigatórias além
do Supabase são `CRON_SECRET` (sem ela o job diário fica desligado),
`SITE_URL`, `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY` +
`EMAIL_FROM`. O modelo do chatbot é configurável por `GEMINI_MODEL`.

**Remetentes de e-mail.** Tudo sai do domínio do EcoSafari (`EMAIL_FROM`),
o único que precisa estar verificado no Resend. Confirmação de reserva e
pedido de avaliação levam o nome da pousada — "Pesqueiro Vagalume via
EcoSafari Brasil" — e o "responder para" é o e-mail de contato que a pousada
preenche no portal (aba Sobre). Pousadas com domínio próprio verificado no
Resend podem, como exceção, enviar por ele: o admin define em Gestão →
Pousadas → Editar. Se esse domínio não estiver verificado, o envio volta
sozinho ao padrão.

## Operação

Problemas em produção (site fora, pagamento parado, e-mails, troca de chaves):
ver `RUNBOOK.md`.
