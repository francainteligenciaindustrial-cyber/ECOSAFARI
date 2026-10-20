import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { ToastProvider } from './lib/ToastProvider.tsx';
import { I18nProvider } from './i18n/I18nProvider.tsx';
import { installGlobalErrorReporting } from './lib/errorReporting';
import { initMetaPixel } from './lib/metaPixel';
import { initGoogleAnalytics } from './lib/googleAnalytics';
import './index.css';

installGlobalErrorReporting();

// PWA: só em produção (em dev o service worker cachearia o código do Vite).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('Service worker não registrado:', err));
  });
}
initMetaPixel();
initGoogleAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>,
);
