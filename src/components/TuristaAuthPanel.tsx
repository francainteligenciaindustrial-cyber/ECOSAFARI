import React, { useState, useEffect } from "react";
import { LoaderCircle, User, LogOut, ArrowLeft, MailCheck, Sparkles } from "lucide-react";
import type { SupabaseClient, User as SupabaseUser } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabaseClient";
import { adminFetch } from "../lib/adminFetch";
import { isTouristUser } from "../lib/authRoles";
import { Turista } from "../types";
import { navigate } from "../lib/router";

// Miolo do login/cadastro de turista, sem cabeçalho/rodapé próprio — usado
// tanto pela aba "Turista" da tela unificada /entrar (AuthPage.tsx) quanto
// pela casca fina em TuristaAuthPage.tsx (que precisa continuar existindo em
// /turista: é o redirectTo do link de confirmação de email do cadastro).
export default function TuristaAuthPanel() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isTourist, setIsTourist] = useState(false);
  // Sessão existente que NÃO é de turista (ex: admin ou parceiro navegando)
  // — usada pra oferecer "virar turista com esta conta" em vez de mandar
  // pra tela de login/cadastro como se a pessoa estivesse deslogada.
  const [currentUser, setCurrentUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<Turista | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState("");

  const [mode, setMode] = useState<"login" | "signup">("signup");

  // Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // Signup — every field is required, matching the "campos obrigatórios no
  // cadastro" requirement: a tourist profile only counts as one if it's
  // actually filled in.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [country, setCountry] = useState("");
  const [language, setLanguage] = useState("");
  const [age, setAge] = useState("");
  const [preferences, setPreferences] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signingUp, setSigningUp] = useState(false);
  // Depois do cadastro, se o site conseguiu mandar o email de confirmação
  // (Resend configurado), a conta fica pendente até a pessoa clicar no link
  // — mostra essa tela em vez de tentar logar direto.
  const [awaitingEmailConfirmation, setAwaitingEmailConfirmation] = useState(false);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    getSupabaseClient().then(client => {
      setSupabase(client);
      client.auth.getSession().then(({ data }) => {
        setCurrentUser(data.session?.user || null);
        setIsTourist(isTouristUser(data.session?.user));
        setCheckingSession(false);
      });
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        setCurrentUser(session?.user || null);
        setIsTourist(isTouristUser(session?.user));
      });
      subscription = data.subscription;
    });
    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isTourist) {
      setProfile(null);
      return;
    }
    setLoadingProfile(true);
    adminFetch("/api/turista/me")
      .then(res => (res.ok ? res.json() : null))
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoadingProfile(false));
  }, [isTourist]);

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setIsTourist(false);
    setCurrentUser(null);
    setProfile(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || loggingIn) return;
    setLoggingIn(true);
    setLoginError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    if (error || !data.user) {
      setLoginError("Email ou senha inválidos.");
      setLoggingIn(false);
      return;
    }
    if (!isTouristUser(data.user)) {
      await supabase.auth.signOut();
      setLoginError("Esta conta não tem um perfil de turista.");
      setLoggingIn(false);
      return;
    }
    setIsTourist(true);
    setLoggingIn(false);
  };

  // Ativa o perfil de turista numa conta que já está logada (admin,
  // parceiro...) — sem pedir email/senha de novo, só o perfil em si.
  const handleUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (upgrading) return;
    setUpgradeError("");
    setUpgrading(true);
    try {
      const res = await adminFetch("/api/turista/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, whatsapp, country, language, age: Number(age), preferences }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUpgradeError(body.error || "Erro ao ativar seu perfil de turista.");
        return;
      }
      // O token que o navegador já tem foi emitido antes do isTourist=true
      // existir no app_metadata — precisa renovar a sessão pra essa
      // informação chegar no token e o resto do site reconhecer na hora.
      if (supabase) {
        const { data } = await supabase.auth.refreshSession();
        setCurrentUser(data.session?.user || null);
        setIsTourist(isTouristUser(data.session?.user));
      }
    } finally {
      setUpgrading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signingUp) return;
    setSignupError("");
    if (password.length < 8) {
      setSignupError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setSignupError("As senhas não coincidem.");
      return;
    }
    setSigningUp(true);
    try {
      const res = await fetch("/api/turista/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, confirmPassword, whatsapp, country, language, age: Number(age), preferences }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSignupError(body.error || "Erro ao criar seu perfil.");
        return;
      }

      // Email de confirmação enviado — a conta só fica utilizável depois que
      // a pessoa clicar no link (que já traz ela de volta logada pra cá).
      if (body.emailConfirmationSent) {
        setAwaitingEmailConfirmation(true);
        return;
      }

      if (!supabase) return;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setSignupError("Perfil criado! Só não conseguimos entrar automaticamente — faça login com o email e senha que você acabou de definir.");
        setMode("login");
        setLoginEmail(email);
        return;
      }
      setIsTourist(true);
    } finally {
      setSigningUp(false);
    }
  };

  if (checkingSession || !supabase) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoaderCircle className="h-6 w-6 text-editorial-primary animate-spin" />
      </div>
    );
  }

  if (awaitingEmailConfirmation) {
    return (
      <div className="max-w-sm w-full mx-auto bg-white border border-editorial-border rounded-lg p-8 shadow-sm text-center">
        <MailCheck className="h-10 w-10 text-editorial-primary mx-auto mb-4" />
        <h1 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary mb-2">Confirme seu email</h1>
        <p className="text-editorial-muted text-xs leading-relaxed">
          Mandamos um link de confirmação pra <span className="font-semibold text-editorial-text">{email}</span>. Clique nele pra ativar seu perfil de turista — você vai cair de volta bem aqui, já logado.
        </p>
        <p className="text-editorial-muted text-[11px] mt-3">Não chegou? Confira também a caixa de spam.</p>
      </div>
    );
  }

  // Sessão existente (admin, parceiro...) que ainda não tem perfil de
  // turista — em vez de login/cadastro (que criaria uma segunda conta
  // desconectada), oferece ativar o turista na MESMA conta: só falta o
  // perfil, email e senha ela já tem.
  if (currentUser && !isTourist) {
    return (
      <div className="max-w-sm w-full mx-auto bg-white border border-editorial-border rounded-lg p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-4 w-4 text-editorial-primary" />
          <h1 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary">Virar Turista</h1>
        </div>
        <p className="text-editorial-muted text-xs mb-6">
          Você já está logado como <span className="font-semibold text-editorial-text">{currentUser.email}</span>. Complete o perfil abaixo pra ativar o turista nessa mesma conta e poder avaliar pousadas, guias e atrações.
        </p>
        <form onSubmit={handleUpgrade} className="flex flex-col gap-3">
          <input
            type="text" required placeholder="Nome completo" value={name} onChange={e => setName(e.target.value)}
            className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
          />
          <input
            type="tel" required placeholder="WhatsApp (com DDD/país)" value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
            className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text" required placeholder="País" value={country} onChange={e => setCountry(e.target.value)}
              className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
            />
            <input
              type="number" required min={1} placeholder="Idade" value={age} onChange={e => setAge(e.target.value)}
              className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
            />
          </div>
          <input
            type="text" required placeholder="Idioma preferido (ex: Português, English, Español)" value={language} onChange={e => setLanguage(e.target.value)}
            className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
          />
          <textarea
            required rows={2} placeholder="O que você gosta de fazer em viagens? (ex: trilhas, observação de aves, gastronomia...)"
            value={preferences} onChange={e => setPreferences(e.target.value)}
            className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary resize-none"
          />
          {upgradeError && <p className="text-red-600 text-xs font-medium">{upgradeError}</p>}
          <button
            type="submit" disabled={upgrading}
            className="mt-2 bg-editorial-primary text-white text-xs uppercase tracking-widest font-semibold py-2.5 rounded-md flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60 cursor-pointer"
          >
            {upgrading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Ativar perfil de turista"}
          </button>
        </form>
      </div>
    );
  }

  if (isTourist) {
    return (
      <div className="max-w-sm w-full mx-auto bg-white border border-editorial-border rounded-lg p-8 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-editorial-primary" />
            <h1 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary">Meu Perfil de Turista</h1>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-editorial-muted hover:text-editorial-text transition cursor-pointer flex-shrink-0">
            <LogOut className="h-3.5 w-3.5" /> Sair
          </button>
        </div>
        {loadingProfile ? (
          <div className="flex justify-center py-8"><LoaderCircle className="h-5 w-5 text-editorial-primary animate-spin" /></div>
        ) : profile ? (
          <div className="mt-5 space-y-3 text-sm">
            <p><span className="text-editorial-muted text-xs block">Nome</span> {profile.name}</p>
            <p><span className="text-editorial-muted text-xs block">Email</span> {profile.email}</p>
            <p><span className="text-editorial-muted text-xs block">WhatsApp</span> {profile.whatsapp}</p>
            <p><span className="text-editorial-muted text-xs block">País</span> {profile.country}</p>
            {profile.language && <p><span className="text-editorial-muted text-xs block">Idioma</span> {profile.language}</p>}
            <p><span className="text-editorial-muted text-xs block">Idade</span> {profile.age}</p>
            {typeof profile.coins === "number" && <p><span className="text-editorial-muted text-xs block">Jaguars</span> {profile.coins}</p>}
            <p><span className="text-editorial-muted text-xs block">Preferências</span> {profile.preferences}</p>
            <p className="text-emerald-700 text-xs font-semibold pt-2">✓ Você já pode avaliar pousadas, guias e atrações.</p>
          </div>
        ) : (
          <p className="text-editorial-muted text-xs mt-5">Não foi possível carregar seu perfil agora. Tente novamente em instantes.</p>
        )}
        <a href="/" onClick={e => { e.preventDefault(); navigate("/"); }} className="mt-6 inline-flex items-center gap-2 text-editorial-primary text-[11px] uppercase tracking-widest font-bold hover:opacity-80 transition cursor-pointer">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao catálogo
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-sm w-full mx-auto bg-white border border-editorial-border rounded-lg p-8 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <User className="h-4 w-4 text-editorial-primary" />
        <h1 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary">Perfil de Turista</h1>
      </div>
      <p className="text-editorial-muted text-xs mb-6">Crie seu perfil (ou entre com um já existente) para poder avaliar pousadas, guias e atrações. Cadastro liberado na hora, sem espera de aprovação.</p>

      <div className="flex border border-editorial-border rounded-md overflow-hidden mb-5 text-[11px] uppercase tracking-widest font-bold">
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`flex-1 py-2 transition cursor-pointer ${mode === "signup" ? "bg-editorial-primary text-white" : "bg-white text-editorial-muted hover:bg-editorial-secondary"}`}
        >
          Criar perfil
        </button>
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`flex-1 py-2 transition cursor-pointer ${mode === "login" ? "bg-editorial-primary text-white" : "bg-white text-editorial-muted hover:bg-editorial-secondary"}`}
        >
          Entrar
        </button>
      </div>

      {mode === "login" ? (
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <input
            type="email" required placeholder="Email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
            className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
          />
          <input
            type="password" required placeholder="Senha" value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
            className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
          />
          {loginError && <p className="text-red-600 text-xs font-medium">{loginError}</p>}
          <button
            type="submit" disabled={loggingIn}
            className="mt-2 bg-editorial-primary text-white text-xs uppercase tracking-widest font-semibold py-2.5 rounded-md flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60 cursor-pointer"
          >
            {loggingIn ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Entrar"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSignup} className="flex flex-col gap-3">
          <input
            type="text" required placeholder="Nome completo" value={name} onChange={e => setName(e.target.value)}
            className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
          />
          <input
            type="email" required placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
          />
          <input
            type="password" required minLength={8} placeholder="Senha (mínimo 8 caracteres)" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
          />
          <input
            type="password" required minLength={8} placeholder="Confirme a senha" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
            className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
          />
          <input
            type="tel" required placeholder="WhatsApp (com DDD/país)" value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
            className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text" required placeholder="País" value={country} onChange={e => setCountry(e.target.value)}
              className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
            />
            <input
              type="number" required min={1} placeholder="Idade" value={age} onChange={e => setAge(e.target.value)}
              className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
            />
          </div>
          <input
            type="text" required placeholder="Idioma preferido (ex: Português, English, Español)" value={language} onChange={e => setLanguage(e.target.value)}
            className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
          />
          <textarea
            required rows={2} placeholder="O que você gosta de fazer em viagens? (ex: trilhas, observação de aves, gastronomia...)"
            value={preferences} onChange={e => setPreferences(e.target.value)}
            className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary resize-none"
          />
          {signupError && <p className="text-red-600 text-xs font-medium">{signupError}</p>}
          <button
            type="submit" disabled={signingUp}
            className="mt-2 bg-editorial-primary text-white text-xs uppercase tracking-widest font-semibold py-2.5 rounded-md flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60 cursor-pointer"
          >
            {signingUp ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Criar meu perfil"}
          </button>
        </form>
      )}
    </div>
  );
}
