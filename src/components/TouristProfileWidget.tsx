import React, { useState, useRef, useEffect } from "react";
import { Coins, MapPin, Languages, Heart, Ticket, LogOut, User, ChevronDown, LoaderCircle, Check, Copy } from "lucide-react";
import { useTouristSession } from "../lib/useTouristSession";
import { adminFetch } from "../lib/adminFetch";
import { navigate } from "../lib/router";
import { Pousada, Resgate } from "../types";

interface VisitedPousada {
  pousadaId: string;
  pousadaName: string;
  checkIn: string;
  checkOut: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

// Widget de conta no canto superior direito, no mesmo espírito do menu de
// perfil do Google/Instagram: um avatar que abre um painel resumido com
// saldo de Coins, favoritos e histórico, sem sair da página atual.
export default function TouristProfileWidget() {
  const { checking, isTourist, hasSession, profile, supabase } = useTouristSession();
  const [open, setOpen] = useState(false);
  const [favoritos, setFavoritos] = useState<Pousada[] | null>(null);
  const [visitados, setVisitados] = useState<VisitedPousada[] | null>(null);
  const [resgates, setResgates] = useState<Resgate[] | null>(null);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!open || !isTourist) return;
    setLoadingPanel(true);
    Promise.all([
      adminFetch("/api/turista/favoritos").then(r => (r.ok ? r.json() : [])),
      adminFetch("/api/turista/visitados").then(r => (r.ok ? r.json() : [])),
      adminFetch("/api/turista/resgates").then(r => (r.ok ? r.json() : [])),
    ])
      .then(([f, v, r]) => {
        setFavoritos(f);
        setVisitados(v);
        setResgates(r);
      })
      .finally(() => setLoadingPanel(false));
  }, [open, isTourist]);

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setOpen(false);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1500);
  };

  if (checking) return null;

  if (!isTourist) {
    // Uma conta já logada como admin/parceiro não está "deslogada" — só não
    // tem perfil de turista ainda. "Entrar" ficaria enganoso nesse caso; o
    // clique leva pra /turista, que detecta a sessão existente e oferece
    // ativar o turista na mesma conta em vez de pedir login de novo.
    return (
      <button
        onClick={() => navigate("/turista")}
        className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-editorial-muted hover:text-editorial-text transition cursor-pointer"
        title={hasSession ? "Ativar perfil de turista" : "Entrar como turista"}
      >
        <User className="h-3.5 w-3.5" />
        <span className="hidden md:inline">{hasSession ? "Virar turista" : "Entrar"}</span>
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 cursor-pointer group"
        title={profile?.name || "Minha conta"}
      >
        <span className="w-8 h-8 rounded-full bg-editorial-primary text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 ring-2 ring-transparent group-hover:ring-editorial-primary/30 transition">
          {profile ? initials(profile.name) : <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-editorial-muted transition-transform hidden sm:block ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-3 w-80 max-h-[75vh] overflow-y-auto bg-white border border-editorial-border rounded-xl shadow-xl z-40 animate-fadeIn">
          {/* Header */}
          <div className="p-5 border-b border-editorial-border">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-full bg-editorial-primary text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                {profile ? initials(profile.name) : ""}
              </span>
              <div className="min-w-0">
                <p className="font-bold text-sm text-editorial-text truncate">{profile?.name}</p>
                <p className="text-editorial-muted text-[11px] truncate">{profile?.email}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-editorial-muted">
              {profile?.country && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {profile.country}</span>}
              {profile?.language && <span className="flex items-center gap-1"><Languages className="h-3 w-3" /> {profile.language}</span>}
              {typeof profile?.age === "number" && <span>{profile.age} anos</span>}
            </div>

            <div className="mt-4 bg-editorial-primary/5 border border-editorial-primary/15 rounded-lg px-3 py-2.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-editorial-primary font-bold text-sm">
                <Coins className="h-4 w-4" /> {profile?.coins ?? 0} Coins
              </span>
              <span className="text-editorial-muted text-[10px] uppercase tracking-wider">Ganhas no app EcoSafari</span>
            </div>
          </div>

          {loadingPanel ? (
            <div className="flex justify-center py-8"><LoaderCircle className="h-5 w-5 text-editorial-primary animate-spin" /></div>
          ) : (
            <>
              {/* Favoritos */}
              <div className="p-4 border-b border-editorial-border">
                <h4 className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-editorial-muted mb-2">
                  <Heart className="h-3.5 w-3.5" /> Pousadas favoritas
                </h4>
                {favoritos && favoritos.length > 0 ? (
                  <ul className="space-y-1.5">
                    {favoritos.map(p => (
                      <li key={p.id}>
                        <button
                          onClick={() => { setOpen(false); navigate(`/pousadas/${p.id}`); }}
                          className="text-left text-xs text-editorial-text hover:text-editorial-primary transition cursor-pointer truncate block w-full"
                        >
                          {p.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-editorial-muted text-xs">Nenhuma pousada favoritada ainda.</p>
                )}
              </div>

              {/* Visitados */}
              {visitados && visitados.length > 0 && (
                <div className="p-4 border-b border-editorial-border">
                  <h4 className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-editorial-muted mb-2">
                    <MapPin className="h-3.5 w-3.5" /> Já visitou
                  </h4>
                  <ul className="space-y-1">
                    {visitados.map(v => (
                      <li key={v.pousadaId} className="text-xs text-editorial-text truncate">{v.pousadaName}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Resgates */}
              <div className="p-4 border-b border-editorial-border">
                <h4 className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-editorial-muted mb-2">
                  <Ticket className="h-3.5 w-3.5" /> Meus resgates
                </h4>
                {resgates && resgates.length > 0 ? (
                  <ul className="space-y-2">
                    {resgates.map(r => (
                      <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className={`font-mono font-bold ${r.status === "usado" ? "text-editorial-muted line-through" : "text-editorial-primary"}`}>{r.code}</span>
                        <span className="flex items-center gap-1.5">
                          <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${r.status === "usado" ? "bg-zinc-100 text-zinc-500" : "bg-emerald-50 text-emerald-700"}`}>
                            {r.status === "usado" ? "Usado" : "Pendente"}
                          </span>
                          {r.status === "pendente" && (
                            <button onClick={() => handleCopyCode(r.code)} className="text-editorial-muted hover:text-editorial-primary transition cursor-pointer" title="Copiar código">
                              {copiedCode === r.code ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-editorial-muted text-xs">Suas Coins podem virar desconto nas pousadas parceiras — veja as recompensas no perfil de cada uma.</p>
                )}
              </div>
            </>
          )}

          <div className="p-4 flex items-center justify-between">
            <button
              onClick={() => { setOpen(false); navigate("/turista"); }}
              className="text-editorial-primary text-[11px] uppercase tracking-widest font-bold hover:opacity-80 transition cursor-pointer"
            >
              Editar perfil
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-editorial-muted text-[11px] uppercase tracking-widest font-bold hover:text-red-600 transition cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" /> Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
