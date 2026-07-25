import React from "react";
import { AlertTriangle, RotateCcw, MessageSquare } from "lucide-react";

interface Props {
  children: React.ReactNode;
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
  }

  render() {
    if (!this.state.hasError) return this.props.children;

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
