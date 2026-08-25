import React, { useState, useEffect } from "react";
import { ShieldCheck, ShieldAlert, LoaderCircle } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabaseClient";
import { useToast } from "../lib/ToastProvider";

// Autoatendimento de 2FA (TOTP) pra própria conta de admin — usa a API de
// MFA nativa do Supabase Auth (enroll/challenge/verify/unenroll), sem
// precisar implementar geração/validação de código por conta própria.
// Contas de admin controlam dinheiro (Stripe), dados pessoais de hóspedes e
// o painel inteiro — só senha não é mais o padrão esperado pra isso.
export default function AdminMfaSettings() {
  const { showToast } = useToast();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState(false);

  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [unenrolling, setUnenrolling] = useState(false);
  const [error, setError] = useState("");

  const refreshStatus = async (client: SupabaseClient) => {
    const { data } = await client.auth.mfa.listFactors();
    setEnrolled(!!data?.totp?.some(f => f.status === "verified"));
  };

  useEffect(() => {
    getSupabaseClient().then(async client => {
      setSupabase(client);
      await refreshStatus(client);
      setLoading(false);
    });
  }, []);

  const handleStartEnroll = async () => {
    if (!supabase) return;
    setEnrolling(true);
    setError("");
    const { data, error: enrollErr } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setEnrolling(false);
    if (enrollErr || !data) {
      setError(enrollErr?.message || "Erro ao iniciar a ativação do 2FA.");
      return;
    }
    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
  };

  const handleCancelEnroll = async () => {
    // Remove o fator "não verificado" que o enroll() acabou de criar — sem
    // isso, ficaria um fator pendente órfão associado à conta.
    if (supabase && factorId) {
      await supabase.auth.mfa.unenroll({ factorId }).catch(() => {});
    }
    setQrCode(null);
    setFactorId(null);
    setVerifyCode("");
    setError("");
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !factorId || verifying) return;
    setVerifying(true);
    setError("");
    try {
      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeErr || !challenge) {
        setError(challengeErr?.message || "Erro ao gerar o desafio de verificação.");
        return;
      }
      const { error: verifyErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: verifyCode.trim() });
      if (verifyErr) {
        setError("Código inválido. Confira no seu app autenticador e tente de novo.");
        return;
      }
      setEnrolled(true);
      setQrCode(null);
      setFactorId(null);
      setVerifyCode("");
      showToast("Autenticação em duas etapas ativada com sucesso.", "success");
    } finally {
      setVerifying(false);
    }
  };

  const handleUnenroll = async () => {
    if (!supabase) return;
    if (!confirm("Desativar a autenticação em duas etapas da sua conta? Você voltará a entrar só com email e senha.")) return;
    setUnenrolling(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const factor = data?.totp?.find(f => f.status === "verified");
      if (!factor) return;
      const { error: unenrollErr } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (!unenrollErr) {
        setEnrolled(false);
        showToast("Autenticação em duas etapas desativada.", "info");
      }
    } finally {
      setUnenrolling(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm flex justify-center">
        <LoaderCircle className="h-5 w-5 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-4">
      <h3 className="font-bold text-base text-zinc-900 flex items-center gap-1.5">
        {enrolled ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <ShieldAlert className="h-5 w-5 text-amber-600" />}
        Autenticação em Duas Etapas (2FA)
      </h3>
      <p className="text-zinc-500 text-xs">
        {enrolled
          ? "Ativada na sua conta — todo login também pede o código do seu app autenticador."
          : "Sua conta ainda não tem 2FA. Recomendamos ativar, especialmente se você for admin-chefe."}
      </p>

      {enrolled ? (
        <button onClick={handleUnenroll} disabled={unenrolling} className="text-red-600 hover:text-red-800 text-xs font-bold disabled:opacity-60 cursor-pointer">
          {unenrolling ? "Desativando..." : "Desativar 2FA"}
        </button>
      ) : qrCode ? (
        <form onSubmit={handleVerify} className="space-y-3">
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 flex flex-col items-center gap-3">
            <img src={qrCode} alt="QR code do autenticador" className="w-40 h-40 bg-white p-2 rounded" />
            <p className="text-zinc-500 text-[11px] text-center max-w-xs">
              Escaneie com Google Authenticator, Authy ou similar, depois digite o código de 6 dígitos abaixo pra confirmar.
            </p>
          </div>
          <input
            type="text" inputMode="numeric" autoComplete="one-time-code" required maxLength={6}
            placeholder="000000"
            value={verifyCode}
            onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ""))}
            className="w-full max-w-[160px] bg-zinc-50 border border-zinc-200 rounded p-2 text-center font-mono tracking-widest text-sm focus:outline-none focus:border-emerald-500"
          />
          {error && <p className="text-red-600 text-xs font-medium">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={verifying || verifyCode.length !== 6}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition disabled:opacity-60 cursor-pointer"
            >
              {verifying ? "Confirmando..." : "Confirmar e ativar"}
            </button>
            <button type="button" onClick={handleCancelEnroll} className="text-zinc-500 text-xs font-semibold cursor-pointer">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <>
          {error && <p className="text-red-600 text-xs font-medium">{error}</p>}
          <button
            onClick={handleStartEnroll}
            disabled={enrolling}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition disabled:opacity-60 cursor-pointer"
          >
            {enrolling ? "Preparando..." : "Ativar 2FA"}
          </button>
        </>
      )}
    </div>
  );
}
