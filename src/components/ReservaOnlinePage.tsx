import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, LoaderCircle, CalendarDays, Users, BedDouble, Check, ShieldCheck, CreditCard, Sparkles, Package, Tag, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabaseClient";
import { adminFetch } from "../lib/adminFetch";
import { isTouristUser } from "../lib/authRoles";
import { navigate } from "../lib/router";
import { Pousada, PacotePublico } from "../types";
import TuristaAuthPanel from "./TuristaAuthPanel";
import { RETURN_TO_KEY } from "../lib/returnTo";
import { useI18n } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/messages";

// Os valores enviados à pousada ficam em português (é quem lê); só o rótulo
// exibido muda com o idioma do turista — ver occasion.N / interest.N.
const OCCASIONS = ["Lazer / férias", "Pescaria", "Observação de fauna", "Lua de mel", "Aniversário", "Viagem em família", "Corporativo", "Outra"];
const INTERESTS = ["Pesca esportiva", "Observação de aves", "Onça-pintada", "Trilhas", "Passeio de barco", "Fotografia", "Gastronomia regional", "Descanso"];
const ARRIVAL_TIMES = ["Manhã (até 12h)", "Tarde (12h–18h)", "Noite (após 18h)", "Ainda não sei"];

const inputClass = "w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary";
const labelClass = "block text-[10px] uppercase tracking-widest font-bold text-editorial-muted mb-1.5";

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86400000).toISOString().slice(0, 10);
const nightsBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const isISODate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

// Datas e pacote podem chegar pela URL — o calendário de melhor época
// (?checkin=&checkout=) e a vitrine de pacotes (?pacote=) mandam o turista
// pra cá já com tudo preenchido.
function readQuery() {
  const q = new URLSearchParams(window.location.search);
  const minCheckIn = addDaysISO(todayISO(), 1);
  let checkIn = q.get("checkin");
  let checkOut = q.get("checkout");
  if (!isISODate(checkIn) || checkIn < minCheckIn) checkIn = addDaysISO(todayISO(), 7);
  if (!isISODate(checkOut) || checkOut <= checkIn) checkOut = addDaysISO(checkIn, 2);
  return { checkIn, checkOut, pacoteId: q.get("pacote") || "" };
}

type CupomAplicado = { code: string; discount: number; description?: string };

// Reserva online direto da página da pousada: cadastro/login do turista →
// dados da estadia (o que a pousada precisa pra preparar a melhor
// experiência) → pagamento. O valor exibido é só uma estimativa — o
// servidor recalcula tudo (pacote, cupom) e confere a disponibilidade de novo.
export default function ReservaOnlinePage({ pousadaId }: { pousadaId: string }) {
  const { t, lang, formatDate, formatMoney } = useI18n();
  const initial = useMemo(readQuery, []);
  const [pousada, setPousada] = useState<Pousada | null>(null);
  const [pacote, setPacote] = useState<PacotePublico | null>(null);
  const [loadError, setLoadError] = useState("");
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [isTourist, setIsTourist] = useState<boolean | null>(null);

  const [checkIn, setCheckIn] = useState(initial.checkIn);
  const [checkOut, setCheckOut] = useState(initial.checkOut);
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

  const [cupomInput, setCupomInput] = useState("");
  const [cupom, setCupom] = useState<CupomAplicado | null>(null);
  const [cupomError, setCupomError] = useState("");
  const [checkingCupom, setCheckingCupom] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [serverDetail, setServerDetail] = useState("");
  const [suggestions, setSuggestions] = useState<{ checkIn: string; checkOut: string; note: string }[]>([]);
  const [done, setDone] = useState<{ id: string; totalPrice: number } | null>(null);

  useEffect(() => {
    fetch(`/api/pousadas/${encodeURIComponent(pousadaId)}`)
      .then(async res => {
        if (!res.ok) throw new Error("not-found");
        return res.json();
      })
      .then((p: Pousada) => {
        setPousada(p);
        if (p.rooms && p.rooms.length > 0) setRoomType(p.rooms[0].type);
      })
      .catch(() => setLoadError(t("booking.notFound")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pousadaId]);

  useEffect(() => {
    if (!initial.pacoteId) return;
    fetch(`/api/pacotes/${encodeURIComponent(initial.pacoteId)}`)
      .then(res => (res.ok ? res.json() : null))
      .then((p: PacotePublico | null) => {
        if (!p || p.pousadaId !== pousadaId) return;
        setPacote(p);
        setCheckOut(addDaysISO(initial.checkIn, p.nights));
      })
      .catch(() => {});
  }, [initial, pousadaId]);

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

  // Quem ainda não tem cadastro volta pra cá (com datas/pacote) depois de
  // confirmar o email — o link de confirmação leva pra /turista, que lê esta chave.
  useEffect(() => {
    if (isTourist === false) {
      try { localStorage.setItem(RETURN_TO_KEY, `/reservar/${pousadaId}${window.location.search}`); } catch { /* sem localStorage */ }
    }
  }, [isTourist, pousadaId]);

  const selectedRoom = pousada?.rooms?.find(r => r.type === roomType);
  const nights = nightsBetween(checkIn, checkOut);
  const guests = adults + children;
  const subtotal = useMemo(() => {
    if (!pousada || nights < 1) return null;
    if (pacote) return pacote.pricePerPerson * guests;
    const exp = pousada.experiences?.find(e => e.title === experienceType);
    return pousada.pricePerNight * nights + (exp ? exp.price * adults : 0);
  }, [pousada, pacote, nights, guests, experienceType, adults]);
  const discount = cupom && subtotal !== null ? Math.min(cupom.discount, subtotal) : 0;
  const estimate = subtotal !== null ? subtotal - discount : null;

  // Cupom validado contra o subtotal atual; mudar datas/hóspedes invalida o
  // desconto calculado, então o cupom é revalidado.
  const applyCupom = async (code: string) => {
    if (!code.trim() || subtotal === null) return;
    setCheckingCupom(true);
    setCupomError("");
    try {
      const res = await fetch("/api/cupons/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), pousadaId, total: subtotal }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.discount !== "number") {
        setCupom(null);
        setCupomError(t("booking.couponInvalid"));
        return;
      }
      setCupom({ code: body.code, discount: body.discount, description: body.description });
    } catch {
      setCupomError(t("booking.err.network"));
    } finally {
      setCheckingCupom(false);
    }
  };

  useEffect(() => {
    if (cupom) applyCupom(cupom.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  const toggleInterest = (i: string) => setInterests(prev => (prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setServerDetail("");
    setSuggestions([]);
    if (nights < 1) return setError(t("booking.err.dates"));
    if (selectedRoom && guests > selectedRoom.capacity) {
      return setError(t("booking.err.capacity", { room: selectedRoom.type, n: selectedRoom.capacity }));
    }
    if (!acceptedTerms) return setError(t("booking.err.terms"));

    setSubmitting(true);
    try {
      const res = await adminFetch("/api/turista/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pousadaId, checkIn, checkOut, adults, children, childAges,
          roomType: roomType || undefined,
          experienceType: pacote ? undefined : experienceType || undefined,
          pacoteId: pacote?.id,
          cupomCode: cupom?.code,
          dietaryRestrictions, specialNeeds,
          details: { arrivalTime, occasion, needsTransfer, interests: interests.join(", "), notes, language: lang },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Mensagens do servidor são em português: para turista estrangeiro,
        // mostra a versão traduzida e deixa o detalhe original embaixo.
        if (lang === "pt") setError(body.error || t("booking.err.generic"));
        else {
          setError(t("booking.err.generic"));
          if (body.error) setServerDetail(body.error);
        }
        if (Array.isArray(body.suggestions)) setSuggestions(body.suggestions);
        return;
      }
      if (typeof body.checkoutUrl === "string" && body.checkoutUrl.startsWith("https://checkout.stripe.com/")) {
        window.location.assign(body.checkoutUrl);
        return;
      }
      setDone({ id: body.booking.id, totalPrice: body.booking.totalPrice });
    } catch {
      setError(t("booking.err.network"));
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
        <ArrowLeft className="h-3.5 w-3.5" /> {t("common.back")}
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

  const steps: MessageKey[] = ["booking.step.signup", "booking.step.stay", "booking.step.payment"];

  return (
    <div className="min-h-screen bg-editorial-bg font-sans text-editorial-text">
      {header}
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-editorial-accent mb-1">{t("booking.kicker")}</p>
        <h1 className="font-serif text-3xl font-bold text-editorial-primary mb-1">{pacote ? pacote.name : pousada.name}</h1>
        <p className="text-editorial-muted text-xs mb-6">{pacote ? `${pousada.name} · ${pousada.location}` : pousada.location}</p>

        <ol className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest font-bold mb-8" aria-label={t("booking.steps")}>
          {steps.map((step, i) => {
            const current = done ? 2 : isTourist ? 1 : 0;
            return (
              <li key={step} aria-current={i === current ? "step" : undefined} className={`px-3 py-1.5 rounded-full border ${i === current ? "bg-editorial-primary text-white border-editorial-primary" : i < current ? "border-editorial-primary text-editorial-primary" : "border-editorial-border text-editorial-muted"}`}>
                {i < current ? "✓ " : `${i + 1}. `}{t(step)}
              </li>
            );
          })}
        </ol>

        {done ? (
          <div className="bg-white border border-editorial-border rounded-lg p-8 max-w-xl text-center mx-auto">
            <Check className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
            <h2 className="font-serif text-2xl font-bold text-editorial-primary mb-2">{t("booking.done.title")}</h2>
            <p className="text-sm text-editorial-muted mb-1">
              {pousada.name} · {t("booking.done.dates", { from: formatDate(checkIn), to: formatDate(checkOut) })}
            </p>
            <p className="text-sm font-semibold mb-4">{t("booking.done.total", { total: formatMoney(done.totalPrice) })}</p>
            <p className="text-xs text-editorial-muted leading-relaxed mb-6">{t("booking.done.text")}</p>
            <button type="button" onClick={() => navigate("/turista")} className="bg-editorial-primary text-white text-[11px] uppercase tracking-widest font-bold px-5 py-2.5 rounded-md cursor-pointer">
              {t("booking.done.cta")}
            </button>
          </div>
        ) : !isTourist ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            <div className="space-y-3 text-sm text-editorial-muted leading-relaxed">
              <h2 className="font-serif text-xl font-bold text-editorial-primary">{t("booking.signup.title")}</h2>
              <p>{t("booking.signup.text")}</p>
              <p className="flex items-center gap-2 text-xs"><ShieldCheck className="h-4 w-4 text-editorial-primary" /> {t("booking.signup.privacy")}</p>
            </div>
            <TuristaAuthPanel />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
              {pacote && (
                <section className="bg-white border border-editorial-primary/40 rounded-lg p-5 space-y-2">
                  <h2 className="text-[10px] uppercase tracking-[0.15em] font-bold text-editorial-primary flex items-center gap-2"><Package className="h-3.5 w-3.5" /> {t("booking.packageShort")} · {t("pkg.nights", { n: pacote.nights })}</h2>
                  <ul className="text-xs space-y-1">
                    {pacote.items.map(item => (
                      <li key={item.label} className="flex justify-between gap-3"><span>{item.label}</span><span className="text-editorial-muted whitespace-nowrap">{formatMoney(item.pricePerPerson)} {t("booking.perPersonShort")}</span></li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="bg-white border border-editorial-border rounded-lg p-5 space-y-4">
                <h2 className="text-[10px] uppercase tracking-[0.15em] font-bold text-editorial-primary flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" /> {t("booking.datesGuests")}</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="checkin" className={labelClass}>{t("booking.checkin")}</label>
                    <input id="checkin" type="date" required min={addDaysISO(todayISO(), 1)} value={checkIn} onChange={e => {
                      const v = e.target.value;
                      setCheckIn(v);
                      if (pacote) setCheckOut(addDaysISO(v, pacote.nights));
                      else if (v >= checkOut) setCheckOut(addDaysISO(v, 1));
                    }} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="checkout" className={labelClass}>{t("booking.checkout")}</label>
                    <input id="checkout" type="date" required min={addDaysISO(checkIn, 1)} value={checkOut} readOnly={!!pacote} onChange={e => setCheckOut(e.target.value)} className={`${inputClass} ${pacote ? "bg-editorial-secondary" : ""}`} />
                  </div>
                  <div>
                    <label htmlFor="adults" className={labelClass}>{t("booking.adults")}</label>
                    <input id="adults" type="number" required min={1} max={30} value={adults} onChange={e => setAdults(Math.max(1, Number(e.target.value) || 1))} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="children" className={labelClass}>{t("booking.children")}</label>
                    <input id="children" type="number" min={0} max={30} value={children} onChange={e => setChildren(Math.max(0, Number(e.target.value) || 0))} className={inputClass} />
                  </div>
                </div>
                {children > 0 && (
                  <div>
                    <label htmlFor="childAges" className={labelClass}>{t("booking.childAges")}</label>
                    <input id="childAges" type="text" maxLength={200} placeholder={t("booking.childAgesPh")} value={childAges} onChange={e => setChildAges(e.target.value)} className={inputClass} />
                  </div>
                )}
              </section>

              {(pousada.rooms || []).length > 0 && (
                <section className="bg-white border border-editorial-border rounded-lg p-5 space-y-3">
                  <h2 className="text-[10px] uppercase tracking-[0.15em] font-bold text-editorial-primary flex items-center gap-2"><BedDouble className="h-3.5 w-3.5" /> {t("booking.room")}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label={t("booking.roomType")}>
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
                          <span className="text-editorial-muted block">{t("booking.roomCapacity", { n: r.capacity })}</span>
                          {(r.beds || []).length > 0 && <span className="text-editorial-muted block">{r.beds!.map(b => `${b.count}× ${b.bedType}`).join(" · ")}</span>}
                          <span className="text-editorial-muted block">
                            {[r.hasAC && t("room.ac"), r.hasTV && t("room.tv"), r.hasMinibar && t("room.minibar"), r.bathroomType && t(r.bathroomType === "comum" ? "room.bathroom.comum" : "room.bathroom.privado")].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="bg-white border border-editorial-border rounded-lg p-5 space-y-4">
                <h2 className="text-[10px] uppercase tracking-[0.15em] font-bold text-editorial-primary flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" /> {t("booking.prepare")}</h2>
                {!pacote && (pousada.experiences || []).length > 0 && (
                  <div>
                    <label htmlFor="experience" className={labelClass}>{t("booking.experience")}</label>
                    <select id="experience" value={experienceType} onChange={e => setExperienceType(e.target.value)} className={inputClass}>
                      <option value="">{t("booking.onlyStay")}</option>
                      {pousada.experiences.map(exp => <option key={exp.title} value={exp.title}>{exp.title} — {formatMoney(exp.price)}{t("booking.perPersonShort")}</option>)}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="occasion" className={labelClass}>{t("booking.occasion")}</label>
                    <select id="occasion" value={occasion} onChange={e => setOccasion(e.target.value)} className={inputClass}>
                      <option value="">{t("common.select")}</option>
                      {OCCASIONS.map((o, i) => <option key={o} value={o}>{t(`occasion.${i}` as MessageKey)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="arrival" className={labelClass}>{t("booking.arrival")}</label>
                    <select id="arrival" value={arrivalTime} onChange={e => setArrivalTime(e.target.value)} className={inputClass}>
                      <option value="">{t("common.select")}</option>
                      {ARRIVAL_TIMES.map((o, i) => <option key={o} value={o}>{t(`arrival.${i}` as MessageKey)}</option>)}
                    </select>
                  </div>
                </div>
                <div role="group" aria-labelledby="interests-label">
                  <span id="interests-label" className={labelClass}>{t("booking.interests")}</span>
                  <div className="flex flex-wrap gap-2">
                    {INTERESTS.map((i, idx) => {
                      const active = interests.includes(i);
                      return (
                        <button key={i} type="button" aria-pressed={active} onClick={() => toggleInterest(i)} className={`text-xs px-3 py-1.5 rounded-full border transition cursor-pointer ${active ? "bg-editorial-primary text-white border-editorial-primary" : "bg-white border-editorial-border hover:bg-editorial-secondary"}`}>
                          {active ? "✓ " : ""}{t(`interest.${idx}` as MessageKey)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={needsTransfer} onChange={e => setNeedsTransfer(e.target.checked)} className="accent-editorial-primary h-4 w-4" />
                  {t("booking.transfer")}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="dietary" className={labelClass}>{t("booking.dietary")}</label>
                    <input id="dietary" type="text" maxLength={500} placeholder={t("booking.dietaryPh")} value={dietaryRestrictions} onChange={e => setDietaryRestrictions(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="needs" className={labelClass}>{t("booking.needs")}</label>
                    <input id="needs" type="text" maxLength={500} placeholder={t("booking.needsPh")} value={specialNeeds} onChange={e => setSpecialNeeds(e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div>
                  <label htmlFor="notes" className={labelClass}>{t("booking.notes")}</label>
                  <textarea id="notes" rows={3} maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} className={`${inputClass} resize-none`} />
                </div>
              </section>
            </div>

            <aside className="bg-white border border-editorial-border rounded-lg p-5 space-y-4 lg:sticky lg:top-6">
              <h2 className="font-serif text-lg font-bold text-editorial-primary">{t("booking.summary")}</h2>
              <ul className="text-xs space-y-1.5 text-editorial-muted">
                {pacote ? (
                  <li className="flex justify-between gap-2"><span>{t("booking.packageShort")}</span><span className="text-right">{formatMoney(pacote.pricePerPerson)} × {guests}</span></li>
                ) : (
                  <li className="flex justify-between"><span>{t("details.nightly")}</span><span>{formatMoney(pousada.pricePerNight)}</span></li>
                )}
                <li className="flex justify-between"><span>{t("booking.nights")}</span><span>{nights > 0 ? nights : "—"}</span></li>
                <li className="flex justify-between"><span className="flex items-center gap-1"><Users className="h-3 w-3" /> {t("booking.guests")}</span><span>{guests}</span></li>
                {roomType && <li className="flex justify-between gap-2"><span>{t("booking.roomShort")}</span><span className="text-right">{roomType}</span></li>}
                {!pacote && experienceType && <li className="flex justify-between gap-2"><span>{t("booking.experienceShort")}</span><span className="text-right">{experienceType}</span></li>}
                {cupom && discount > 0 && (
                  <li className="flex justify-between gap-2 text-emerald-700 font-semibold"><span>{t("booking.discount")} ({cupom.code})</span><span>− {formatMoney(discount)}</span></li>
                )}
              </ul>

              <div>
                <label htmlFor="cupom" className={labelClass}><Tag className="inline h-3 w-3 mr-1" />{t("booking.coupon")}</label>
                {cupom ? (
                  <div className="flex items-center justify-between gap-2 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md px-3 py-2">
                    <span>{t("booking.couponApplied", { code: cupom.code })}{cupom.description ? ` — ${cupom.description}` : ""}</span>
                    <button type="button" onClick={() => { setCupom(null); setCupomInput(""); }} aria-label={t("booking.couponRemove")} className="cursor-pointer hover:text-emerald-950"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input id="cupom" type="text" maxLength={40} autoCapitalize="characters" placeholder={t("booking.couponPh")} value={cupomInput} onChange={e => setCupomInput(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyCupom(cupomInput); } }} className={`${inputClass} uppercase`} />
                    <button type="button" disabled={checkingCupom || !cupomInput.trim()} onClick={() => applyCupom(cupomInput)} className="border border-editorial-primary text-editorial-primary text-[10px] uppercase tracking-widest font-bold px-3 rounded-md disabled:opacity-50 cursor-pointer">
                      {checkingCupom ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : t("booking.couponApply")}
                    </button>
                  </div>
                )}
                {cupomError && <p role="alert" className="text-red-700 text-[11px] mt-1">{cupomError}</p>}
              </div>

              <div className="border-t border-editorial-border pt-3 flex justify-between items-baseline">
                <span className="text-xs font-bold uppercase tracking-widest">{t("booking.total")}</span>
                <span className="font-serif text-xl font-bold text-editorial-primary">{estimate !== null ? formatMoney(estimate) : "—"}</span>
              </div>
              <p className="text-[10px] text-editorial-muted">{t("booking.finalNote")}</p>
              <label className="flex items-start gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={acceptedTerms} onChange={e => setAcceptedTerms(e.target.checked)} className="accent-editorial-primary h-4 w-4 mt-0.5" />
                <span>{t("booking.acceptTerms1")} <a href="/termos" target="_blank" rel="noopener noreferrer" className="text-editorial-primary font-semibold underline">{t("booking.acceptTerms2")}</a>.</span>
              </label>
              {error && (
                <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-md space-y-2">
                  <p>{error}</p>
                  {serverDetail && <p lang="pt-BR" className="text-[11px] opacity-80">{serverDetail}</p>}
                  {suggestions.map(sug => (
                    <button key={sug.checkIn} type="button" onClick={() => { setCheckIn(sug.checkIn); setCheckOut(sug.checkOut); setError(""); setServerDetail(""); setSuggestions([]); }} className="block underline font-semibold cursor-pointer">
                      {t("booking.try", { from: formatDate(sug.checkIn), to: formatDate(sug.checkOut) })}
                    </button>
                  ))}
                </div>
              )}
              <button type="submit" disabled={submitting} className="w-full bg-editorial-primary text-white text-[11px] uppercase tracking-widest font-bold py-3 rounded-md hover:opacity-90 transition disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2">
                {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} {t("booking.submit")}
              </button>
            </aside>
          </form>
        )}
      </main>
    </div>
  );
}
