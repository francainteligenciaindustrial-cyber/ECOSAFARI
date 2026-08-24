import React, { useState, Suspense, lazy } from "react";
import { Compass, Handshake, ShieldCheck, User } from "lucide-react";
import { navigate } from "../lib/router";
import TuristaAuthPanel from "./TuristaAuthPanel";
import PartnerLoginPanel from "./PartnerLoginPanel";
import AdminLoginPanel from "./AdminLoginPanel";

const PartnerSignupPage = lazy(() => import("./PartnerSignupPage"));

function LazyFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-editorial-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

type AuthTab = "turista" | "parceiros" | "gestao";

interface AuthPageProps {
  onAdminAuthenticated: () => void;
}

const TABS: { id: AuthTab; label: string; icon: typeof User }[] = [
  { id: "turista", label: "Turista", icon: User },
  { id: "parceiros", label: "Parceiros", icon: Handshake },
  { id: "gestao", label: "Gestão", icon: ShieldCheck },
];

// Tela única de login/cadastro (/entrar) com 3 abas, substituindo os 3 pontos
// de entrada que existiam espalhados pelo site (cadeado de admin no
// cabeçalho, link "Portal do Parceiro" no menu, widget de turista no canto).
// Cadastro na aba Turista é imediato; a aba Parceiros não tem auto-cadastro
// — leva pra PartnerSignupPage (candidatura que passa por aprovação da
// gestão). A aba Gestão é só pra quem já tem conta de admin.
export default function AuthPage({ onAdminAuthenticated }: AuthPageProps) {
  const [tab, setTab] = useState<AuthTab>("turista");
  const [showPartnerSignup, setShowPartnerSignup] = useState(false);

  if (showPartnerSignup) {
    return (
      <Suspense fallback={<LazyFallback />}>
        <PartnerSignupPage />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-editorial-bg font-sans">
      <header className="h-16 flex items-center px-6 md:px-10 border-b border-editorial-border bg-white">
        <a href="/" onClick={e => { e.preventDefault(); navigate("/"); }} className="flex items-center gap-2 cursor-pointer">
          <div className="bg-editorial-primary p-1.5 rounded-lg text-white flex items-center justify-center">
            <Compass className="h-4 w-4" />
          </div>
          <span className="font-serif italic font-bold text-editorial-primary">EcoSafari<span className="text-zinc-400 not-italic">.</span></span>
        </a>
      </header>

      <div className="px-6 py-16">
        <div className="max-w-sm mx-auto mb-8 flex border border-editorial-border rounded-md overflow-hidden text-[11px] uppercase tracking-widest font-bold bg-white">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 transition cursor-pointer ${
                tab === id ? "bg-editorial-primary text-white" : "text-editorial-muted hover:bg-editorial-secondary"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {tab === "turista" && <TuristaAuthPanel />}

        {tab === "parceiros" && (
          <div className="flex flex-col gap-6">
            <div className="max-w-sm w-full mx-auto bg-editorial-primary text-white rounded-lg p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Handshake className="h-4 w-4" />
                <h2 className="text-xs uppercase tracking-[0.2em] font-bold">Ainda não é parceiro?</h2>
              </div>
              <p className="text-white/80 text-xs mb-4">
                É guia, pousada ou atração? Envie sua candidatura — nossa equipe analisa e aprova o acesso.
              </p>
              <button
                type="button"
                onClick={() => setShowPartnerSignup(true)}
                className="w-full bg-white text-editorial-primary text-xs uppercase tracking-widest font-bold py-2.5 rounded-md hover:opacity-90 transition cursor-pointer"
              >
                Quero ser parceiro →
              </button>
            </div>

            <div className="max-w-sm w-full mx-auto text-center text-[11px] uppercase tracking-widest font-bold text-editorial-muted">
              Já é parceiro? Entre com seu acesso abaixo
            </div>

            <PartnerLoginPanel />
          </div>
        )}

        {tab === "gestao" && <AdminLoginPanel onAdminAuthenticated={onAdminAuthenticated} />}
      </div>
    </div>
  );
}
