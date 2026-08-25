import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Substitui alert()/mensagens perdidas no console por uma notificação
// discreta que aparece e some sozinha — o padrão que Google/Facebook/
// Instagram usam pra feedback transiente, em vez da caixa cinza do sistema
// operacional que alert() sempre foi. Um único provider no topo do app
// (ver App.tsx) segura a fila; qualquer componente chama useToast().showToast(...).
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  const icons: Record<ToastKind, React.ReactNode> = {
    success: <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 flex-shrink-0" />,
    error: <XCircle className="h-4.5 w-4.5 text-red-600 flex-shrink-0" />,
    info: <Info className="h-4.5 w-4.5 text-editorial-primary flex-shrink-0" />,
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 max-w-sm w-[calc(100%-2.5rem)] sm:w-full pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-2.5 bg-white border border-editorial-border shadow-lg rounded-lg px-4 py-3 animate-fadeIn"
          >
            {icons[t.kind]}
            <p className="text-editorial-text text-xs leading-relaxed flex-1">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-editorial-muted hover:text-editorial-text transition cursor-pointer flex-shrink-0" aria-label="Fechar notificação">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback silencioso em vez de derrubar a árvore inteira — mais seguro
    // que lançar caso algum componente seja usado fora do provider (ex: um
    // teste isolado), já que um toast que não aparece nunca é crítico.
    return { showToast: (message: string) => console.warn("[toast sem provider]", message) };
  }
  return ctx;
}
