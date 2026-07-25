import React, { useState } from "react";
import { X, Lock, LoaderCircle } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

interface AdminLoginModalProps {
  supabase: SupabaseClient;
  onClose: () => void;
  onAdminAuthenticated: () => void;
}

export default function AdminLoginModal({ supabase, onClose, onAdminAuthenticated }: AdminLoginModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !data.user) {
      setError("Email ou senha inválidos.");
      setLoading(false);
      return;
    }

    const role = data.user.app_metadata?.role;
    if (role !== "admin") {
      await supabase.auth.signOut();
      setError("Esta conta não tem permissão de administrador.");
      setLoading(false);
      return;
    }

    setLoading(false);
    onAdminAuthenticated();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-editorial-bg border border-editorial-border w-full max-w-sm relative shadow-xl rounded-lg">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-editorial-muted hover:text-editorial-text transition cursor-pointer"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-8">
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
              className="w-full border border-editorial-border bg-white/60 px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
            />
            <input
              type="password"
              required
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-editorial-border bg-white/60 px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
            />

            {error && (
              <p className="text-red-600 text-xs font-medium">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 bg-editorial-primary text-white text-xs uppercase tracking-widest font-semibold py-2.5 rounded-md flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60 cursor-pointer"
            >
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
