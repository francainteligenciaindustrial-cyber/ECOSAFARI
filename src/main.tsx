import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { ToastProvider } from './lib/ToastProvider.tsx';
import { installGlobalErrorReporting } from './lib/errorReporting';
import { initMetaPixel } from './lib/metaPixel';
import { initGoogleAnalytics } from './lib/googleAnalytics';
import './index.css';

installGlobalErrorReporting();
initMetaPixel();
initGoogleAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
