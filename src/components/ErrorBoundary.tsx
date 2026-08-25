import React from "react";
import { AlertTriangle, RotateCcw, MessageSquare } from "lucide-react";
import { captureException } from "../lib/errorReporting";

interface Props {
  children: React.ReactNode;
  // "page" (padrão) é o boundary de topo em main.tsx — tela cheia, porque
  // nesse ponto realmente não sobrou mais nada renderizável. "section" é pra
  // isolar uma vitrine específica (grade de pousadas, avaliações, carrossel
  // de espécies): se ela quebrar, o resto da página continua de pé em vez de
  // um bug pequeno derrubar o site inteiro pro visitante.
  variant?: "page" | "section";
  sectionLabel?: string;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("Erro não tratado na aplicação:", error, info.componentStack);
    captureException(error, { componentStack: info.componentStack ?? undefined });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.variant === "section") {
      return (
        <div className="max-w-2xl mx-auto my-8 text-center border border-dashed border-editorial-border bg-white/60 rounded-lg py-10 px-6">
          <AlertTriangle className="h-6 w-6 text-amber-600 mx-auto mb-3" />
          <p className="text-editorial-text text-sm font-semibold mb-1">
            {this.props.sectionLabel ? `Não conseguimos carregar ${this.props.sectionLabel} agora` : "Não conseguimos carregar esta seção agora"}
          </p>
          <p className="text-editorial-muted text-xs mb-4">O resto da página continua funcionando normalmente.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="inline-flex items-center gap-1.5 text-editorial-primary text-[11px] uppercase tracking-widest font-bold hover:opacity-80 transition cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Tentar de novo
          </button>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-editorial-bg flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full text-center bg-white border border-editorial-border p-10 rounded-lg shadow-sm">
          <AlertTriangle className="h-12 w-12 text-amber-600 mx-auto mb-4" />
          <h1 className="text-xl font-serif font-bold text-editorial-primary mb-2">Algo deu errado</h1>
          <p className="text-editorial-muted text-sm mb-6">
            Encontramos um erro inesperado. Você pode tentar recarregar a página ou falar direto com nossa equipe pelo WhatsApp.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center justify-center gap-2 w-full bg-editorial-primary text-white text-xs uppercase tracking-widest font-bold py-3 rounded-md hover:opacity-90 transition mb-3 cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" /> Recarregar Página
          </button>
          <a
            href="https://wa.me/5565999868334"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs uppercase tracking-widest font-bold py-3 rounded-md transition"
          >
            <MessageSquare className="h-4 w-4" /> Falar no WhatsApp
          </a>
        </div>
      </div>
    );
  }
}
