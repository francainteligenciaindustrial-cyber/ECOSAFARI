import React, { useState } from "react";
import { Search, Users, Building2 } from "lucide-react";
import InfoPageLayout from "./InfoPageLayout";
import { Candidatura } from "../types";

const STATUS_LABELS: Record<Candidatura["status"], { label: string; color: string }> = {
  pendente: { label: "Em análise", color: "bg-amber-50 text-amber-900 border-amber-200" },
  contatado: { label: "Nossa equipe já entrou em contato", color: "bg-blue-50 text-blue-900 border-blue-200" },
  aprovado: { label: "Aprovado — bem-vindo à rede EcoSafari!", color: "bg-emerald-50 text-emerald-900 border-emerald-200" },
  rejeitado: { label: "Não aprovado nesta etapa", color: "bg-zinc-100 text-zinc-600 border-zinc-200" },
};

export default function CandidateStatusPage() {
  const [email, setEmail] = useState("");
  const [results, setResults] = useState<Candidatura[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/candidaturas/status?email=${encodeURIComponent(email)}`);
      setResults(await res.json());
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <InfoPageLayout kicker="Acompanhamento" title="Consultar Status da Candidatura">
      <p className="mb-6">
        Digite o email usado no cadastro de parceiro para ver o andamento da sua candidatura, sem precisar ligar ou mandar mensagem.
      </p>

      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 mb-8">
        <input
          type="email"
          required
          placeholder="Seu email de cadastro"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="flex-1 border border-editorial-border px-4 py-3 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
        />
        <button
          type="submit"
          disabled={loading}
          className="flex items-center justify-center gap-2 bg-editorial-primary text-white text-xs uppercase tracking-widest font-bold px-6 py-3 rounded-md hover:opacity-90 transition disabled:opacity-60 cursor-pointer"
        >
          <Search className="h-4 w-4" /> {loading ? "Buscando..." : "Consultar"}
        </button>
      </form>

      {results !== null && (
        results.length === 0 ? (
          <div className="bg-white border border-editorial-border p-6 text-center text-editorial-muted text-sm">
            Nenhuma candidatura encontrada para este email.
          </div>
        ) : (
          <div className="space-y-4">
            {results.map(c => {
              const status = STATUS_LABELS[c.status];
              return (
                <div key={c.id} className="bg-white border border-editorial-border p-5">
                  <div className="flex items-center gap-2 mb-2">
                    {c.type === "guia" ? <Users className="h-4 w-4 text-editorial-primary" /> : <Building2 className="h-4 w-4 text-editorial-primary" />}
                    <span className="text-sm font-bold">{c.type === "pousada" ? (c.pousadaName || c.name) : c.name}</span>
                  </div>
                  <span className={`inline-block text-[10px] uppercase tracking-widest font-bold border px-3 py-1 rounded-full ${status.color}`}>
                    {status.label}
                  </span>
                  <p className="text-[10px] text-editorial-muted mt-2">
                    Enviado em {new Date(c.dateCreated).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              );
            })}
          </div>
        )
      )}
    </InfoPageLayout>
  );
}
