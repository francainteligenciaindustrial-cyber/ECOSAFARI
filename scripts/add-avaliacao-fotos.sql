-- Fotos da avaliação (até 5), enviadas pelo próprio hóspede como nos
-- comentários de lojas online. Sem esta coluna, a avaliação salva só a
-- primeira foto (em "photoUrl").
alter table public.reviews add column if not exists images jsonb default '[]'::jsonb;
