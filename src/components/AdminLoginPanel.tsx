import React, { useState, useEffect } from "react";
import { Lock, LoaderCircle } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabaseClient";
import { isAdminUser } from "../lib/authRoles";

interface AdminLoginPanelProps {
  onAdminAuthenticated: () => void;
}

// Login de administrador — antes era um modal (AdminLoginModal.tsx) aberto
// por um cadeado no cabeçalho; agora é a aba "Gestão" da tela unificada de
// login (/entrar, AuthPage.tsx).
export default function AdminLoginPanel({ onAdminAuthenticated }: AdminLoginPanelProps) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getSupabaseClient().then(setSupabase);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError("");

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !data.user) {
      setError("Email ou senha inválidos.");
      setLoading(false);
      return;
    }

    if (!isAdminUser(data.user)) {
      await supabase.auth.signOut();
      setError("Esta conta não tem permissão de administrador.");
      setLoading(false);
      return;
    }

    setLoading(false);
    onAdminAuthenticated();
  };

  return (
    <div className="max-w-sm w-full mx-auto bg-white border border-editorial-border rounded-lg p-8 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Lock className="h-4 w-4 text-editorial-primary" />
        <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary">
          Acesso Administrativo
        </h2>
      </div>
      <p className="text-editorial-muted text-xs mb-6">
        Entre com sua conta de administrador para acessar o painel de Gestão.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
        />
        <input
          type="password"
          required
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
        />

        {error && (
          <p className="text-red-600 text-xs font-medium">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !supabase}
          className="mt-2 bg-editorial-primary text-white text-xs uppercase tracking-widest font-semibold py-2.5 rounded-md flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60 cursor-pointer"
        >
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Entrar"}
        </button>
      </form>
    </div>
  );
}
