import React, { useState, useEffect } from "react";
import { Compass, Users, Building2, CheckCircle2, ArrowLeft, MessageSquare, Sparkles, Handshake, Wallet } from "lucide-react";
import { trackMetaEvent } from "../lib/metaPixel";

const WHATSAPP_NUMBER = "5565999868334";
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;

type PartnerType = "guia" | "pousada";

// Loads the reCAPTCHA v3 script once and resolves a fresh token per submit.
// No-op (resolves undefined) when VITE_RECAPTCHA_SITE_KEY isn't configured —
// the backend accepts submissions without a token in that case too.
function useRecaptcha() {
  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY || document.getElementById("recaptcha-v3-script")) return;
    const script = document.createElement("script");
    script.id = "recaptcha-v3-script";
    script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
    document.head.appendChild(script);
  }, []);

  return async (action: string): Promise<string | undefined> => {
    const grecaptcha = (window as any).grecaptcha;
    if (!RECAPTCHA_SITE_KEY || !grecaptcha) return undefined;
    return new Promise((resolve) => {
      grecaptcha.ready(() => {
        grecaptcha.execute(RECAPTCHA_SITE_KEY, { action }).then(resolve).catch(() => resolve(undefined));
      });
    });
  };
}

export default function PartnerSignupPage() {
  const [type, setType] = useState<PartnerType>("guia");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [statusLink, setStatusLink] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const [guiaForm, setGuiaForm] = useState({
    name: "", email: "", phone: "", languages: "", availability: "", age: "", experienceYears: "", specialty: "", message: ""
  });
  const [pousadaForm, setPousadaForm] = useState({
    pousadaName: "", name: "", email: "", phone: "", location: "", capacity: "", message: ""
  });
  const getRecaptchaToken = useRecaptcha();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const recaptchaToken = await getRecaptchaToken("candidatura_parceiro");

    const payload = type === "guia"
      ? {
          type,
          recaptchaToken,
          name: guiaForm.name,
          email: guiaForm.email,
          phone: guiaForm.phone,
          languages: guiaForm.languages,
          availability: guiaForm.availability,
          age: guiaForm.age ? parseInt(guiaForm.age) : undefined,
          experienceYears: guiaForm.experienceYears ? parseInt(guiaForm.experienceYears) : undefined,
          specialty: guiaForm.specialty,
          message: guiaForm.message,
        }
      : {
          type,
          recaptchaToken,
          name: pousadaForm.name,
          email: pousadaForm.email,
          phone: pousadaForm.phone,
          pousadaName: pousadaForm.pousadaName,
          location: pousadaForm.location,
          capacity: pousadaForm.capacity ? parseInt(pousadaForm.capacity) : undefined,
          message: pousadaForm.message,
        };

    try {
      const res = await fetch("/api/candidaturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Falha ao enviar cadastro");
      const created = await res.json();
      if (created.statusToken) {
        const email = type === "guia" ? guiaForm.email : pousadaForm.email;
        setStatusLink(`${window.location.origin}/status-candidatura?email=${encodeURIComponent(email)}&token=${created.statusToken}`);
      }
      // Conversion event for Meta Ads — this is the actual "did the ad work"
      // signal; without it, campaigns pointed at this page have no way to
      // measure or optimize toward real signups.
      trackMetaEvent("Lead", { content_name: type === "guia" ? "cadastro_guia" : "cadastro_pousada" });
      setSubmitted(true);
    } catch (err) {
      setError("Não foi possível enviar seu cadastro agora. Tente novamente em instantes.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    const applicantName = type === "pousada" ? (pousadaForm.pousadaName || pousadaForm.name) : guiaForm.name;
    const waMessage = encodeURIComponent(
      `Olá! Acabei de me cadastrar como ${type === "guia" ? "guia turístico" : "pousada"} parceira no site da EcoSafari Brasil (${applicantName}). Gostaria de conversar sobre os próximos passos.`
    );

    return (
      <div className="min-h-screen bg-editorial-bg flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full text-center bg-white border border-editorial-border p-10 rounded-lg shadow-sm">
          <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-4" />
          <h1 className="text-2xl font-serif font-bold text-editorial-primary mb-2">Cadastro recebido!</h1>
          <p className="text-editorial-muted text-sm mb-6">
            Obrigado pelo interesse em fazer parte da EcoSafari Brasil. Nossa equipe vai analisar suas informações e entrar em contato em breve.
          </p>

          {statusLink && (
            <div className="bg-editorial-secondary/40 border border-editorial-border rounded-md p-4 mb-6 text-left">
              <p className="text-editorial-text text-xs font-bold mb-1">Guarde este link para acompanhar o status:</p>
              <p className="text-editorial-muted text-[11px] mb-3">Só ele (junto com o email cadastrado) permite consultar o andamento — guarde-o com cuidado.</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={statusLink}
                  onFocus={e => e.target.select()}
                  className="flex-1 min-w-0 bg-white border border-editorial-border px-2.5 py-2 text-[11px] rounded-md font-mono truncate"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(statusLink);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  }}
                  className="flex-shrink-0 bg-editorial-primary text-white text-[10px] uppercase tracking-widest font-bold px-3 py-2 rounded-md hover:opacity-90 transition cursor-pointer"
                >
                  {linkCopied ? "Copiado!" : "Copiar"}
                </button>
              </div>
            </div>
          )}

          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}?text=${waMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs uppercase tracking-widest font-bold py-3.5 rounded-md transition"
          >
            <MessageSquare className="h-4 w-4" /> Falar agora no WhatsApp
          </a>

          <a href="/" className="inline-flex items-center gap-2 mt-5 text-xs uppercase tracking-widest font-bold text-editorial-primary hover:opacity-80 transition">
            <ArrowLeft className="h-4 w-4" /> Voltar ao site
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative bg-editorial-primary font-sans text-editorial-text overflow-hidden">
      {/* Low-opacity jungle backdrop — reuses a real lodge photo (dense
          Pantanal foliage) instead of a stock jungle image, so it's
          consistent with what the rest of the site actually shows. */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-15 pointer-events-none"
        style={{ backgroundImage: "url('/pousadas/vagalume-lago-deck.png')" }}
        aria-hidden="true"
      />

      <div className="relative z-10">
        <header className="h-20 bg-editorial-bg border-b border-editorial-border flex items-center px-6 md:px-10">
          <a href="/" className="flex items-center gap-3">
            <div className="bg-editorial-primary p-2 rounded-lg text-white shadow-sm flex items-center justify-center">
              <Compass className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-serif italic tracking-tighter font-bold text-editorial-primary">
              EcoSafari<span className="text-zinc-400 not-italic">.</span>
            </h1>
          </a>
        </header>

        <main className="max-w-2xl mx-auto px-6 py-12 md:py-16">
          <span className="text-amber-400 text-[11px] uppercase tracking-[0.2em] font-bold block mb-2">Seja um Parceiro</span>
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-white mb-3">
            Cadastre-se para prestar serviços conosco
          </h2>
          <p className="text-white/80 text-sm mb-8 leading-relaxed">
            Você é guia turístico ou representa uma pousada e quer fazer parte da rede EcoSafari Brasil? Preencha o formulário abaixo — leva menos de 2 minutos e suas informações vão direto para nossa equipe, que entrará em contato.
          </p>

        {/* Why partner with us — cold traffic from an ad needs the "what's
            in it for me" before being asked to fill out a form. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-white border border-editorial-border rounded-lg p-4">
            <Wallet className="h-5 w-5 text-editorial-primary mb-2" />
            <p className="text-xs font-bold text-editorial-text mb-1">Sem custo de adesão</p>
            <p className="text-[11px] text-editorial-muted leading-relaxed">Cadastro e participação na rede EcoSafari são 100% gratuitos.</p>
          </div>
          <div className="bg-white border border-editorial-border rounded-lg p-4">
            <Sparkles className="h-5 w-5 text-editorial-primary mb-2" />
            <p className="text-xs font-bold text-editorial-text mb-1">Mais reservas, mais exposição</p>
            <p className="text-[11px] text-editorial-muted leading-relaxed">Seu perfil fica visível pra viajantes que já estão buscando experiências como a sua.</p>
          </div>
          <div className="bg-white border border-editorial-border rounded-lg p-4">
            <Handshake className="h-5 w-5 text-editorial-primary mb-2" />
            <p className="text-xs font-bold text-editorial-text mb-1">Suporte da nossa equipe</p>
            <p className="text-[11px] text-editorial-muted leading-relaxed">Ajudamos com agenda, pagamento e atendimento ao cliente — você foca na experiência.</p>
          </div>
        </div>

        {/* Type toggle */}
        <div className="flex gap-3 mb-8">
          <button
            type="button"
            onClick={() => setType("guia")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 border text-xs uppercase tracking-widest font-bold transition cursor-pointer ${
              type === "guia" ? "bg-white text-editorial-primary border-white" : "bg-white/10 text-white border-white/30 hover:bg-white/20"
            }`}
          >
            <Users className="h-4 w-4" /> Sou Guia Turístico
          </button>
          <button
            type="button"
            onClick={() => setType("pousada")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 border text-xs uppercase tracking-widest font-bold transition cursor-pointer ${
              type === "pousada" ? "bg-white text-editorial-primary border-white" : "bg-white/10 text-white border-white/30 hover:bg-white/20"
            }`}
          >
            <Building2 className="h-4 w-4" /> Represento uma Pousada
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-editorial-border p-6 md:p-8 rounded-lg space-y-4">
          {type === "guia" ? (
            <>
              <Field label="Nome completo" required>
                <Input required value={guiaForm.name} onChange={e => setGuiaForm({ ...guiaForm, name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Email" required>
                  <Input required type="email" value={guiaForm.email} onChange={e => setGuiaForm({ ...guiaForm, email: e.target.value })} />
                </Field>
                <Field label="Telefone / WhatsApp" required>
                  <Input required value={guiaForm.phone} onChange={e => setGuiaForm({ ...guiaForm, phone: e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Idade">
                  <Input type="number" min="18" value={guiaForm.age} onChange={e => setGuiaForm({ ...guiaForm, age: e.target.value })} />
                </Field>
                <Field label="Anos de experiência como guia">
                  <Input type="number" min="0" value={guiaForm.experienceYears} onChange={e => setGuiaForm({ ...guiaForm, experienceYears: e.target.value })} />
                </Field>
              </div>
              <Field label="Idiomas que fala" required>
                <Input required placeholder="Ex: Português, Inglês, Espanhol" value={guiaForm.languages} onChange={e => setGuiaForm({ ...guiaForm, languages: e.target.value })} />
              </Field>
              <Field label="Disponibilidade" required>
                <Input required placeholder="Ex: Fins de semana, período integral, sob demanda" value={guiaForm.availability} onChange={e => setGuiaForm({ ...guiaForm, availability: e.target.value })} />
              </Field>
              <Field label="Especialidade">
                <Input placeholder="Ex: Observação de aves, safári fotográfico, trilhas" value={guiaForm.specialty} onChange={e => setGuiaForm({ ...guiaForm, specialty: e.target.value })} />
              </Field>
              <Field label="Conte um pouco sobre você">
                <Textarea value={guiaForm.message} onChange={e => setGuiaForm({ ...guiaForm, message: e.target.value })} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Nome da pousada" required>
                <Input required value={pousadaForm.pousadaName} onChange={e => setPousadaForm({ ...pousadaForm, pousadaName: e.target.value })} />
              </Field>
              <Field label="Nome do responsável" required>
                <Input required value={pousadaForm.name} onChange={e => setPousadaForm({ ...pousadaForm, name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Email" required>
                  <Input required type="email" value={pousadaForm.email} onChange={e => setPousadaForm({ ...pousadaForm, email: e.target.value })} />
                </Field>
                <Field label="Telefone / WhatsApp" required>
                  <Input required value={pousadaForm.phone} onChange={e => setPousadaForm({ ...pousadaForm, phone: e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Localidade" required>
                  <Input required placeholder="Ex: Pantanal Norte, Mato Grosso" value={pousadaForm.location} onChange={e => setPousadaForm({ ...pousadaForm, location: e.target.value })} />
                </Field>
                <Field label="Capacidade de hóspedes">
                  <Input type="number" min="1" value={pousadaForm.capacity} onChange={e => setPousadaForm({ ...pousadaForm, capacity: e.target.value })} />
                </Field>
              </div>
              <Field label="Conte um pouco sobre a pousada">
                <Textarea value={pousadaForm.message} onChange={e => setPousadaForm({ ...pousadaForm, message: e.target.value })} />
              </Field>
            </>
          )}

          {error && <p className="text-red-600 text-xs font-medium">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-editorial-primary text-white text-xs uppercase tracking-widest font-bold py-3.5 rounded-md hover:opacity-90 transition disabled:opacity-60 cursor-pointer"
          >
            {submitting ? "Enviando..." : "Enviar Cadastro"}
          </button>
        </form>
        </main>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-widest font-bold text-editorial-muted mb-1.5">
        {label}{required && <span className="text-editorial-primary"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="w-full border border-editorial-border px-3 py-2.5 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary" />;
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} rows={3} className="w-full border border-editorial-border px-3 py-2.5 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary resize-none" />;
}
