-- WhatsApp da recepção da pousada: enviado ao hóspede só depois do
-- pagamento (e-mail de confirmação e voucher). A pousada preenche no portal.
alter table public.pousadas add column if not exists "whatsappContato" text;
