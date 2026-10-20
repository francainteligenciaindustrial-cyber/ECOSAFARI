import React, { useEffect, useState } from "react";
import { LoaderCircle, Clock, BadgeCheck, XCircle } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";

interface Me {
  name: string;
  email: string;
  phone: string;
  services: string[];
  languages: string[];
  specialties: string[];
  status: "pendente" | "aprovado" | "reprovado";
  decisionNote?: string;
  pousadaName: string;
}

// Área do colaborador logado: situação do cadastro e os dados enviados.
export default function ColaboradorPanel() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch("/api/colaborador/me")
      .then(async res => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Não foi possível carregar seu cadastro.");
        setMe(body);
      })
      .catch(err => setError(err.message));
  }, []);

  if (error) return <p className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-4 py-3 rounded-lg">{error}</p>;
  if (!me) return <div className="flex justify-center py-16"><LoaderCircle className="h-6 w-6 text-editorial-primary animate-spin" /></div>;

  const status = {
    pendente: { icon: Clock, title: "Cadastro em análise", text: `O gestor da ${me.pousadaName} está analisando seu perfil. Você recebe a resposta por email.`, cls: "bg-amber-50 border-amber-200 text-amber-900" },
    aprovado: { icon: BadgeCheck, title: "Cadastro aprovado", text: `Você faz parte da equipe de colaboradores da ${me.pousadaName}.`, cls: "bg-emerald-50 border-emerald-200 text-emerald-900" },
    reprovado: { icon: XCircle, title: "Cadastro não aprovado", text: me.decisionNote ? `Motivo: ${me.decisionNote}` : "Fale com a pousada para saber mais.", cls: "bg-red-50 border-red-200 text-red-800" },
  }[me.status];
  const Icon = status.icon;

  return (
    <div className="space-y-6">
      <div className={`border rounded-lg p-5 flex items-start gap-3 ${status.cls}`}>
        <Icon className="h-6 w-6 flex-shrink-0" />
        <div>
          <p className="font-bold text-sm">{status.title}</p>
          <p className="text-xs mt-1">{status.text}</p>
        </div>
      </div>
      <div className="bg-white border border-editorial-border rounded-lg p-6 text-sm space-y-2">
        <p><span className="text-editorial-muted text-xs block">Nome</span>{me.name}</p>
        <p><span className="text-editorial-muted text-xs block">Serviços</span>{me.services.join(", ")}</p>
        {me.languages.length > 0 && <p><span className="text-editorial-muted text-xs block">Idiomas</span>{me.languages.join(", ")}</p>}
        {me.specialties.length > 0 && <p><span className="text-editorial-muted text-xs block">Especialidades</span>{me.specialties.join(", ")}</p>}
        <p><span className="text-editorial-muted text-xs block">Contato</span>{me.email} · {me.phone}</p>
      </div>
    </div>
  );
}
