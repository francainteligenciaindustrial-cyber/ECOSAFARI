import React from "react";
import { Compass, LoaderCircle } from "lucide-react";
import { navigate } from "../lib/router";
import { useTouristSession } from "../lib/useTouristSession";
import TuristaAuthPanel from "./TuristaAuthPanel";
import TuristaProfileView from "./TuristaProfileView";
import BrandLogo from "./BrandLogo";

// Casca fina em torno de TuristaAuthPanel/TuristaProfileView — precisa
// continuar existindo nesta rota (/turista) porque é o redirectTo do link de
// confirmação de email do cadastro de turista (ver POST /api/turista/signup
// em server.ts) e o destino de "Editar perfil" (TouristProfileWidget.tsx).
// A tela unificada de login (/entrar, AuthPage.tsx) usa o mesmo
// TuristaAuthPanel numa das abas, mas nunca o perfil completo — esse só
// existe aqui.
export default function TuristaAuthPage() {
  const { checking, isTourist } = useTouristSession();

  return (
    <div className="min-h-screen bg-editorial-bg font-sans">
      <header className="h-16 flex items-center px-6 md:px-10 border-b border-editorial-border bg-white">
        <a href="/" onClick={e => { e.preventDefault(); navigate("/"); }} className="flex items-center gap-2 cursor-pointer">
          <BrandLogo />
        </a>
      </header>

      {checking ? (
        <div className="flex items-center justify-center py-24">
          <LoaderCircle className="h-6 w-6 text-editorial-primary animate-spin" />
        </div>
      ) : isTourist ? (
        <TuristaProfileView />
      ) : (
        <div className="flex items-center justify-center px-6 py-16">
          <TuristaAuthPanel />
        </div>
      )}
    </div>
  );
}
