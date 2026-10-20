-- ECOSAFARI BRASIL: REMETENTE DE E-MAIL POR POUSADA
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- E-mails de reserva ao hóspede (confirmação com voucher, pedido de
-- avaliação) passam a sair do domínio da própria pousada quando o admin
-- define um endereço aqui — ex.: reservas@pousadavagalume.com. O domínio
-- precisa estar verificado no Resend (resend.com > Domains); se não estiver,
-- o servidor reenvia automaticamente pelo EMAIL_FROM da plataforma.
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "emailRemetente" TEXT;
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "emailRemetenteNome" TEXT;

-- Para onde vão as respostas dos hóspedes ("Responder para"). A própria
-- pousada preenche no portal; sem isso, usa o e-mail de login de um gestor.
ALTER TABLE pousadas ADD COLUMN IF NOT EXISTS "emailContato" TEXT;
