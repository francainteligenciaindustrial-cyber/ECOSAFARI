import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, LoaderCircle, CalendarDays, Users, BedDouble, Check, ShieldCheck, CreditCard, Sparkles } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabaseClient";
import { adminFetch } from "../lib/adminFetch";
import { isTouristUser } from "../lib/authRoles";
import { navigate } from "../lib/router";
import { Pousada } from "../types";
import TuristaAuthPanel from "./TuristaAuthPanel";
import { RETURN_TO_KEY } from "../lib/returnTo";

const OCCASIONS = ["Lazer / férias", "Pescaria", "Observação de fauna", "Lua de mel", "Aniversário", "Viagem em família", "Corporativo", "Outra"];
const INTERESTS = ["Pesca esportiva", "Observação de aves", "Onça-pintada", "Trilhas", "Passeio de barco", "Fotografia", "Gastronomia regional", "Descanso"];
const ARRIVAL_TIMES = ["Manhã (até 12h)", "Tarde (12h–18h)", "Noite (após 18h)", "Ainda não sei"];

const inputClass = "w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary";
const labelClass = "block text-[10px] uppercase tracking-widest font-bold text-editorial-muted mb-1.5";

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86400000).toISOString().slice(0, 10);
const nightsBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// Reserva online direto da página da pousada: cadastro/login do turista →
// dados da estadia (o que a pousada precisa pra preparar a melhor
// experiência) → pagamento. O valor exibido é só uma estimativa — o
// servidor recalcula tudo e confere a disponibilidade de novo.
export default function ReservaOnlinePage({ pousadaId }: { pousadaId: string }) {
  const [pousada, setPousada] = useState<Pousada | null>(null);
  const [loadError, setLoadError] = useState("");
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [isTourist, setIsTourist] = useState<boolean | null>(null);

  const [checkIn, setCheckIn] = useState(addDaysISO(todayISO(), 7));
  const [checkOut, setCheckOut] = useState(addDaysISO(todayISO(), 9));
  const [roomType, setRoomType] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [childAges, setChildAges] = useState("");
  const [experienceType, setExperienceType] = useState("");
  const [dietaryRestrictions, setDietaryRestrictions] = useState("");
  const [specialNeeds, setSpecialNeeds] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [occasion, setOccasion] = useState("");
  const [needsTransfer, setNeedsTransfer] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<{ checkIn: string; checkOut: string; note: string }[]>([]);
  const [done, setDone] = useState<{ id: string; totalPrice: number } | null>(null);

  useEffect(() => {
    fetch(`/api/pousadas/${encodeURIComponent(pousadaId)}`)
      .then(async res => {
        if (!res.ok) throw new Error("Pousada não encontrada.");
        return res.json();
      })
      .then((p: Pousada) => {
        setPousada(p);
        if (p.rooms && p.rooms.length > 0) setRoomType(p.rooms[0].type);
      })
      .catch(err => setLoadError(err.message));
  }, [pousadaId]);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    getSupabaseClient().then(client => {
      setSupabase(client);
      client.auth.getSession().then(({ data }) => setIsTourist(isTouristUser(data.session?.user)));
      const { data } = client.auth.onAuthStateChange((_e, session) => setIsTourist(isTouristUser(session?.user)));
      subscription = data.subscription;
    });
    return () => subscription?.unsubscribe();
  }, []);

  // Quem ainda não tem cadastro volta pra cá depois de confirmar o email
  // (o link de confirmação leva pra /turista, que lê esta chave).
  useEffect(() => {
    if (isTourist === false) {
      try { localStorage.setItem(RETURN_TO_KEY, `/reservar/${pousadaId}`); } catch { /* sem localStorage */ }
    }
  }, [isTourist, pousadaId]);

  const selectedRoom = pousada?.rooms?.find(r => r.type === roomType);
  const nights = nightsBetween(checkIn, checkOut);
  const estimate = useMemo(() => {
    if (!pousada || nights < 1) return null;
    const exp = pousada.experiences?.find(e => e.title === experienceType);
    return pousada.pricePerNight * nights + (exp ? exp.price * adults : 0);
  }, [pousada, nights, experienceType, adults]);

  const toggleInterest = (i: string) => setInterests(prev => (prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setSuggestions([]);
    if (nights < 1) return setError("O check-out precisa ser depois do check-in.");
    if (selectedRoom && adults + children > selectedRoom.capacity) {
      return setError(`O quarto "${selectedRoom.type}" acomoda no máximo ${selectedRoom.capacity} pessoas.`);
    }
    if (!acceptedTerms) return setError("Leia e aceite a política de cancelamento para continuar.");

    setSubmitting(true);
    try {
      const res = await adminFetch("/api/turista/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pousadaId, checkIn, checkOut, adults, children, childAges,
          roomType: roomType || undefined,
          experienceType: experienceType || undefined,
          dietaryRestrictions, specialNeeds,
          details: { arrivalTime, occasion, needsTransfer, interests: interests.join(", "), notes },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Não foi possível concluir a reserva.");
        if (Array.isArray(body.suggestions)) setSuggestions(body.suggestions);
        return;
      }
      if (typeof body.checkoutUrl === "string" && body.checkoutUrl.startsWith("https://checkout.stripe.com/")) {
        window.location.assign(body.checkoutUrl);
        return;
      }
      setDone({ id: body.booking.id, totalPrice: body.booking.totalPrice });
    } catch {
      setError("Sem conexão com o servidor. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const header = (
    <header className="arara-edge-bottom h-16 flex items-center px-4 md:px-10 bg-editorial-bg">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? window.history.back() : navigate("/"))}
        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-editorial-muted hover:text-editorial-primary transition cursor-pointer"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </button>
    </header>
  );

  if (loadError) {
    return (
      <div className="min-h-screen bg-editorial-bg font-sans">
        {header}
        <p className="max-w-xl mx-auto mt-16 bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3 rounded-lg">{loadError}</p>
      </div>
    );
  }
  if (!pousada || isTourist === null || !supabase) {
    return (
      <div className="min-h-screen bg-editorial-bg flex items-center justify-center">
        <LoaderCircle className="h-7 w-7 text-editorial-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-editorial-bg font-sans text-editorial-text">
      {header}
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-editorial-accent mb-1">Reserva online</p>
        <h1 className="font-serif text-3xl font-bold text-editorial-primary mb-1">{pousada.name}</h1>
        <p className="text-editorial-muted text-xs mb-6">{pousada.location}</p>

        <ol className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest font-bold mb-8" aria-label="Etapas da reserva">
          {["Cadastro", "Sua estadia", "Pagamento"].map((step, i) => {
            const current = done ? 2 : isTourist ? 1 : 0;
            return (
              <li key={step} className={`px-3 py-1.5 rounded-full border ${i === current ? "bg-editorial-primary text-white border-editorial-primary" : i < current ? "border-editorial-primary text-editorial-primary" : "border-editorial-border text-editorial-muted"}`}>
                {i < current ? "✓ " : `${i + 1}. `}{step}
              </li>
            );
          })}
        </ol>

        {done ? (
          <div className="bg-white border border-editorial-border rounded-lg p-8 max-w-xl text-center mx-auto">
            <Check className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
            <h2 className="font-serif text-2xl font-bold text-editorial-primary mb-2">Reserva registrada!</h2>
            <p className="text-sm text-editorial-muted mb-1">
              {pousada.name} · {new Date(checkIn + "T12:00:00").toLocaleDateString("pt-BR")} a {new Date(checkOut + "T12:00:00").toLocaleDateString("pt-BR")}
            </p>
            <p className="text-sm font-semibold mb-4">Total: R$ {done.totalPrice.toLocaleString("pt-BR")}</p>
            <p className="text-xs text-editorial-muted leading-relaxed mb-6">
              Sua reserva está <strong>aguardando pagamento</strong>. A pousada já recebeu seus dados, e nossa equipe vai te enviar o link de pagamento pelo WhatsApp e pelo email. Você acompanha tudo em "Minhas reservas".
            </p>
            <button type="button" onClick={() => navigate("/turista")} className="bg-editorial-primary text-white text-[11px] uppercase tracking-widest font-bold px-5 py-2.5 rounded-md cursor-pointer">
              Ver minhas reservas
            </button>
          </div>
        ) : !isTourist ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            <div className="space-y-3 text-sm text-editorial-muted leading-relaxed">
              <h2 className="font-serif text-xl font-bold text-editorial-primary">Primeiro, seu cadastro</h2>
              <p>Crie seu perfil de turista (ou entre, se já tiver um). Com ele a pousada recebe seus dados com segurança e você acompanha a reserva e o pagamento em um só lugar.</p>
              <p className="flex items-center gap-2 text-xs"><ShieldCheck className="h-4 w-4 text-editorial-primary" /> Seus dados ficam visíveis só para a pousada e a equipe EcoSafari.</p>
            </div>
            <TuristaAuthPanel />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
              <section className="bg-white border border-editorial-border rounded-lg p-5 space-y-4">
                <h2 className="text-[10px] uppercase tracking-[0.15em] font-bold text-editorial-primary flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" /> Datas e hóspedes</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="checkin" className={labelClass}>Check-in</label>
                    <input id="checkin" type="date" required min={todayISO()} value={checkIn} onChange={e => { setCheckIn(e.target.value); if (e.target.value >= checkOut) setCheckOut(addDaysISO(e.target.value, 1)); }} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="checkout" className={labelClass}>Check-out</label>
                    <input id="checkout" type="date" required min={addDaysISO(checkIn, 1)} value={checkOut} onChange={e => setCheckOut(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="adults" className={labelClass}>Adultos</label>
                    <input id="adults" type="number" required min={1} max={30} value={adults} onChange={e => setAdults(Math.max(1, Number(e.target.value) || 1))} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="children" className={labelClass}>Crianças</label>
                    <input id="children" type="number" min={0} max={30} value={children} onChange={e => setChildren(Math.max(0, Number(e.target.value) || 0))} className={inputClass} />
                  </div>
                </div>
                {children > 0 && (
                  <div>
                    <label htmlFor="childAges" className={labelClass}>Idade das crianças</label>
                    <input id="childAges" type="text" maxLength={200} placeholder="Ex: 4 e 9 anos" value={childAges} onChange={e => setChildAges(e.target.value)} className={inputClass} />
                  </div>
                )}
              </section>

              {(pousada.rooms || []).length > 0 && (
                <section className="bg-white border border-editorial-border rounded-lg p-5 space-y-3">
                  <h2 className="text-[10px] uppercase tracking-[0.15em] font-bold text-editorial-primary flex items-center gap-2"><BedDouble className="h-3.5 w-3.5" /> Acomodação</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Tipo de quarto">
                    {pousada.rooms!.map(r => {
                      const active = r.type === roomType;
                      return (
                        <button
                          key={r.type}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setRoomType(r.type)}
                          className={`text-left border rounded-md p-3 text-xs transition cursor-pointer ${active ? "border-editorial-primary bg-editorial-secondary ring-1 ring-editorial-primary" : "border-editorial-border hover:bg-editorial-secondary/50"}`}
                        >
                          <span className="font-semibold text-sm block">{r.type}</span>
                          <span className="text-editorial-muted block">Até {r.capacity} pessoa(s)</span>
                          {(r.beds || []).length > 0 && <span className="text-editorial-muted block">{r.beds!.map(b => `${b.count}× ${b.bedType}`).join(" · ")}</span>}
                          <span className="text-editorial-muted block">
                            {[r.hasAC && "Ar-condicionado", r.hasTV && "TV", r.hasMinibar && "Frigobar", r.bathroomType && `Banheiro ${r.bathroomType}`].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="bg-white border border-editorial-border rounded-lg p-5 space-y-4">
                <h2 className="text-[10px] uppercase tracking-[0.15em] font-bold text-editorial-primary flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" /> Para prepararmos a melhor experiência</h2>
                {(pousada.experiences || []).length > 0 && (
                  <div>
                    <label htmlFor="experience" className={labelClass}>Experiência / passeio (opcional)</label>
                    <select id="experience" value={experienceType} onChange={e => setExperienceType(e.target.value)} className={inputClass}>
                      <option value="">Só a hospedagem</option>
                      {pousada.experiences.map(exp => <option key={exp.title} value={exp.title}>{exp.title} — R$ {exp.price.toLocaleString("pt-BR")}/pessoa</option>)}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="occasion" className={labelClass}>Motivo da viagem</label>
                    <select id="occasion" value={occasion} onChange={e => setOccasion(e.target.value)} className={inputClass}>
                      <option value="">Selecione...</option>
                      {OCCASIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="arrival" className={labelClass}>Chegada prevista</label>
                    <select id="arrival" value={arrivalTime} onChange={e => setArrivalTime(e.target.value)} className={inputClass}>
                      <option value="">Selecione...</option>
                      {ARRIVAL_TIMES.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                <div role="group" aria-label="Interesses">
                  <span className={labelClass}>O que vocês mais querem fazer?</span>
                  <div className="flex flex-wrap gap-2">
                    {INTERESTS.map(i => {
                      const active = interests.includes(i);
                      return (
                        <button key={i} type="button" aria-pressed={active} onClick={() => toggleInterest(i)} className={`text-xs px-3 py-1.5 rounded-full border transition cursor-pointer ${active ? "bg-editorial-primary text-white border-editorial-primary" : "bg-white border-editorial-border hover:bg-editorial-secondary"}`}>
                          {active ? "✓ " : ""}{i}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={needsTransfer} onChange={e => setNeedsTransfer(e.target.checked)} className="accent-editorial-primary h-4 w-4" />
                  Preciso de transfer até a pousada
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="dietary" className={labelClass}>Restrições alimentares</label>
                    <input id="dietary" type="text" maxLength={500} placeholder="Ex: vegetariano, alergia a camarão" value={dietaryRestrictions} onChange={e => setDietaryRestrictions(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="needs" className={labelClass}>Acessibilidade / necessidades</label>
                    <input id="needs" type="text" maxLength={500} placeholder="Ex: cadeira de rodas, idoso" value={specialNeeds} onChange={e => setSpecialNeeds(e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div>
                  <label htmlFor="notes" className={labelClass}>Algo mais que a pousada deva saber?</label>
                  <textarea id="notes" rows={3} maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} className={`${inputClass} resize-none`} />
                </div>
              </section>
            </div>

            <aside className="bg-white border border-editorial-border rounded-lg p-5 space-y-4 lg:sticky lg:top-6">
              <h2 className="font-serif text-lg font-bold text-editorial-primary">Resumo</h2>
              <ul className="text-xs space-y-1.5 text-editorial-muted">
                <li className="flex justify-between"><span>Diária</span><span>R$ {pousada.pricePerNight.toLocaleString("pt-BR")}</span></li>
                <li className="flex justify-between"><span>Noites</span><span>{nights > 0 ? nights : "—"}</span></li>
                <li className="flex justify-between"><span className="flex items-center gap-1"><Users className="h-3 w-3" /> Hóspedes</span><span>{adults + children}</span></li>
                {roomType && <li className="flex justify-between gap-2"><span>Quarto</span><span className="text-right">{roomType}</span></li>}
                {experienceType && <li className="flex justify-between gap-2"><span>Experiência</span><span className="text-right">{experienceType}</span></li>}
              </ul>
              <div className="border-t border-editorial-border pt-3 flex justify-between items-baseline">
                <span className="text-xs font-bold uppercase tracking-widest">Total estimado</span>
                <span className="font-serif text-xl font-bold text-editorial-primary">{estimate !== null ? `R$ ${estimate.toLocaleString("pt-BR")}` : "—"}</span>
              </div>
              <p className="text-[10px] text-editorial-muted">O valor final é confirmado pelo sistema no momento do pagamento.</p>
              <label className="flex items-start gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={acceptedTerms} onChange={e => setAcceptedTerms(e.target.checked)} className="accent-editorial-primary h-4 w-4 mt-0.5" />
                <span>Li e aceito a <a href="/termos" target="_blank" rel="noopener noreferrer" className="text-editorial-primary font-semibold underline">política de cancelamento</a>.</span>
              </label>
              {error && (
                <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-md space-y-2">
                  <p>{error}</p>
                  {suggestions.map(sug => (
                    <button key={sug.checkIn} type="button" onClick={() => { setCheckIn(sug.checkIn); setCheckOut(sug.checkOut); setError(""); setSuggestions([]); }} className="block underline font-semibold cursor-pointer">
                      Tentar {new Date(sug.checkIn + "T12:00:00").toLocaleDateString("pt-BR")} a {new Date(sug.checkOut + "T12:00:00").toLocaleDateString("pt-BR")} ({sug.note.toLowerCase()})
                    </button>
                  ))}
                </div>
              )}
              <button type="submit" disabled={submitting} className="w-full bg-editorial-primary text-white text-[11px] uppercase tracking-widest font-bold py-3 rounded-md hover:opacity-90 transition disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2">
                {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Confirmar e ir para o pagamento
              </button>
            </aside>
          </form>
        )}
      </main>
    </div>
  );
}
