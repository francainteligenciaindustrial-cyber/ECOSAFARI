# Modelos de e-mail do Supabase (em português, com a marca)

Supabase → Authentication → **Emails** (Email Templates). Para cada modelo,
cole o assunto e o conteúdo do arquivo correspondente:

| Modelo no Supabase | Assunto | Arquivo |
|---|---|---|
| Confirm signup | Confirme seu email — Ipantanal | confirmar-cadastro.html |
| Invite user | Seu convite para o Ipantanal | convite.html |
| Magic Link | Seu link de acesso — Ipantanal | link-magico.html |
| Change Email Address | Confirme seu novo email — Ipantanal | trocar-email.html |
| Reset Password | Redefinir sua senha — Ipantanal | redefinir-senha.html |

O site manda a maioria desses e-mails pelo próprio servidor (Resend), com
textos mais completos. Estes modelos valem para quando o próprio Supabase
envia — por exemplo, um convite ou redefinição disparado pelo painel do
Supabase. Configure antes o SMTP do Resend (RUNBOOK.md, seção 3).
