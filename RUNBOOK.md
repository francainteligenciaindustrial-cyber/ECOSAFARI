# Runbook — EcoSafari Brasil

Documento operacional: o que fazer quando algo dá errado em produção. Não é
documentação de arquitetura (isso está espalhado em comentários no código,
que é a fonte da verdade) — é só "o site caiu, e agora?".

## Onde tudo está hospedado

| Serviço | Papel | Onde acessar |
|---|---|---|
| Vercel | Deploy do site (frontend + `server.ts` como função serverless) | vercel.com dashboard |
| Supabase | Banco Postgres, Auth, Storage de imagens | supabase.com dashboard |
| Stripe | Pagamento do checkout | dashboard.stripe.com |
| Resend | Envio de email (confirmação de reserva, convites) | resend.com dashboard |
| Sentry | Captura de erro (se `SENTRY_DSN` estiver configurada) | sentry.io |
| Google Cloud Console | OAuth do Google Calendar | console.cloud.google.com |

## 1. "O site parece estar fora do ar"

1. Confira `https://SEU-DOMINIO/api/health` — resposta `200 {"status":"ok"}` significa que o processo Node e a conexão com o Supabase estão de pé. `503` ou sem resposta nenhuma indica o problema real.
2. Se `/api/health` responde mas o site não carrega: provavelmente é o build/deploy da Vercel, não o backend — confira a aba **Deployments** no dashboard da Vercel, veja se o último deploy falhou.
3. Se `/api/health` não responde nada: confira o **Status** do Supabase (status.supabase.com) — se o banco deles estiver fora, não tem o que fazer além de esperar.
4. Se nada disso aponta o problema: confira os logs da função serverless na Vercel (aba **Logs** do projeto) — todo log agora sai em JSON com um campo `requestId`, o que ajuda a filtrar por uma chamada específica se alguém reportar um erro citando o header `X-Request-Id` da resposta.

## 2. "Pagamentos pararam de funcionar"

1. Confira `dashboard.stripe.com` → **Developers → Webhooks** — o endpoint `/api/stripe/webhook` deve aparecer com status ativo e sem falhas recentes.
2. Se o webhook está falhando: confira se `STRIPE_WEBHOOK_SECRET` na Vercel bate com o "Signing secret" mostrado no dashboard do Stripe pra esse endpoint — costuma ser o motivo nº 1.
3. Sem `STRIPE_WEBHOOK_SECRET` configurada, a confirmação de pagamento ainda funciona via `GET /api/payments/confirm` (chamado quando o cliente volta do checkout pro navegador) — mas fica vulnerável a alguém fechar a aba antes de voltar. Configurar o webhook é o caminho correto.
4. Pra confirmar manualmente uma reserva que ficou presa em "pendente_pagamento" mas o cliente já pagou (confirmado no dashboard do Stripe): painel de Gestão → Reservas → mude o status manualmente.

## 3. "Emails de confirmação não estão chegando"

1. Confira `resend.com` → **Logs** — mostra todo envio recente e o motivo de falha, se houver.
2. Sem `RESEND_API_KEY` configurada, o site nunca tenta mandar email — o fluxo cai pra confirmação só via WhatsApp/painel, que continua funcionando normalmente.
3. Emails saem de `onboarding@resend.dev` (domínio de teste do Resend) — se isso for uma pendência (ex: quer sair da caixa de spam com mais frequência), configurar um domínio próprio verificado no Resend é o próximo passo, não uma correção de bug.

## 4. "Um admin perdeu acesso à própria conta" (senha, 2FA)

- **Esqueceu a senha**: qualquer pessoa pode resetar a própria senha pela tela de login normal do Supabase Auth (não existe um fluxo de "esqueci minha senha" dedicado pra admin no site ainda — usar o painel do Supabase: **Authentication → Users**, achar o email, "Send password recovery").
- **Perdeu o dispositivo com o 2FA**: outro admin-chefe (ou você, direto no Supabase) precisa desativar o fator MFA da conta afetada em **Authentication → Users → (usuário) → Multi-Factor Authentication** no dashboard do Supabase. Depois disso, a pessoa consegue entrar só com senha e reativar o 2FA num novo dispositivo pela aba "Administradores" do painel.
- **Os 3 admins-chefe perderam acesso ao mesmo tempo** (cenário extremo): só resolve direto no Supabase, editando `app_metadata` do usuário via **Authentication → Users → (usuário) → Edit** e adicionando `{"isChief": true}` manualmente.

## 5. "Preciso rodar uma migração de banco pendente"

Toda mudança de schema deste projeto é um arquivo em `scripts/*.sql`, pensado
pra rodar manualmente no **SQL Editor** do Supabase (não há migração
automática no deploy). Ordem recomendada: rode os scripts na ordem em que
foram criados (data no `git log` do arquivo) — a maioria usa
`IF NOT EXISTS`, então rodar um script duas vezes não quebra nada.

## 6. "Preciso girar uma chave/secret comprometida"

| Chave | Onde trocar | Efeito colateral de trocar |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → gerar nova | Nenhum — o backend lê a env var, sem cache |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe dashboard | Webhook precisa ser recriado com o novo secret |
| `RESEND_API_KEY` | Resend dashboard | Nenhum |
| `GEMINI_API_KEY` | Google AI Studio | Nenhum |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console | Precisa reconectar o Google Calendar no painel de Gestão |
| `APP_COINS_SYNC_SECRET` | Gerado por você | O trigger do app mobile precisa ser atualizado com o novo valor |

Depois de trocar qualquer uma na Vercel (**Settings → Environment Variables**), é preciso fazer um novo deploy (redeploy) pra pegar o valor novo — a env var não recarrega sozinha.

## 7. Ambientes

- **Produção**: o deploy da branch `main`, `VERCEL_ENV=production`.
- **Preview**: qualquer outro deploy (PR/branch), `VERCEL_ENV=preview`. Stripe e Resend ficam **desativados por padrão** nesses deploys (ver `ALLOW_LIVE_INTEGRATIONS_IN_PREVIEW` no `.env.example`) — um teste num preview não gera cobrança nem email real, a menos que essa variável seja explicitamente ligada.

## 8. Backup e recuperação de dados

O Supabase faz backup automático do Postgres (frequência depende do plano — confira em **Database → Backups** no dashboard). Não existe backup próprio deste projeto além disso. Antes de rodar qualquer `DELETE`/`UPDATE` manual direto no SQL Editor do Supabase (fora dos scripts em `scripts/`), prefira fazer um `SELECT` primeiro pra conferir o que vai ser afetado.
