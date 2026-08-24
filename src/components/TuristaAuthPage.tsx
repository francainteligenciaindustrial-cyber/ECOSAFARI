import React from "react";
import { Compass } from "lucide-react";
import { navigate } from "../lib/router";
import TuristaAuthPanel from "./TuristaAuthPanel";

// Casca fina em torno de TuristaAuthPanel — precisa continuar existindo
// nesta rota (/turista) porque é o redirectTo do link de confirmação de
// email do cadastro de turista (ver POST /api/turista/signup em server.ts).
// A tela unificada de login (/entrar, AuthPage.tsx) usa o mesmo Panel numa
// das abas.
export default function TuristaAuthPage() {
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
      <div className="flex items-center justify-center px-6 py-16">
        <TuristaAuthPanel />
      </div>
    </div>
  );
}
