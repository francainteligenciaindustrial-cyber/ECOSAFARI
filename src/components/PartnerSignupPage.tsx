import React, { useState } from "react";
import { Compass, Users, Building2, CheckCircle2, ArrowLeft, MessageSquare } from "lucide-react";

const WHATSAPP_NUMBER = "5565999868334";

type PartnerType = "guia" | "pousada";

export default function PartnerSignupPage() {
  const [type, setType] = useState<PartnerType>("guia");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const [guiaForm, setGuiaForm] = useState({
    name: "", email: "", phone: "", languages: "", availability: "", age: "", experienceYears: "", specialty: "", message: ""
  });
  const [pousadaForm, setPousadaForm] = useState({
    pousadaName: "", name: "", email: "", phone: "", location: "", capacity: "", message: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const payload = type === "guia"
      ? {
          type,
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
    <div className="min-h-screen bg-editorial-bg font-sans text-editorial-text">
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
        <span className="text-editorial-primary text-[11px] uppercase tracking-[0.2em] font-bold block mb-2">Seja um Parceiro</span>
        <h2 className="text-3xl md:text-4xl font-serif font-bold text-editorial-text mb-3">
          Cadastre-se para prestar serviços conosco
        </h2>
        <p className="text-editorial-muted text-sm mb-8 leading-relaxed">
          Você é guia turístico ou representa uma pousada e quer fazer parte da rede EcoSafari Brasil? Preencha o formulário abaixo. Suas informações vão direto para nossa equipe, que entrará em contato.
        </p>

        {/* Type toggle */}
        <div className="flex gap-3 mb-8">
          <button
            type="button"
            onClick={() => setType("guia")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 border text-xs uppercase tracking-widest font-bold transition cursor-pointer ${
              type === "guia" ? "bg-editorial-primary text-white border-editorial-primary" : "bg-white text-editorial-muted border-editorial-border hover:text-editorial-primary"
            }`}
          >
            <Users className="h-4 w-4" /> Sou Guia Turístico
          </button>
          <button
            type="button"
            onClick={() => setType("pousada")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 border text-xs uppercase tracking-widest font-bold transition cursor-pointer ${
              type === "pousada" ? "bg-editorial-primary text-white border-editorial-primary" : "bg-white text-editorial-muted border-editorial-border hover:text-editorial-primary"
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
