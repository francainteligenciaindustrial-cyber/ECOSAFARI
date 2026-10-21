-- Seção "Localização e como chegar" (página da pousada e site oficial):
-- link da ficha da pousada no Google Maps, usado no botão "Google Maps".
-- Seguro de rodar mais de uma vez.

alter table public.pousadas add column if not exists "googleMapsUrl" text;

-- Ficha da Pousada Vagalume (enviada em 21/10/2026).
update public.pousadas
   set "googleMapsUrl" = 'https://www.google.com.br/maps/place/Pousada+VAGALUME/@-15.0464096,-57.1416577,5957m/data=!3m1!1e3!4m9!3m8!1s0x939947b79044f84b:0x95297dffb3b69b92!5m2!4m1!1i2!8m2!3d-15.0502999!4d-57.1455782!16s%2Fg%2F11j0qhfd8f'
 where id = 'p_1784944422389' and coalesce("googleMapsUrl", '') = '';

notify pgrst, 'reload schema';
