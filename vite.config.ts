import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        output: {
          // Separa dependências de terceiros (que mudam raramente) do
          // código da aplicação (que muda a cada deploy) — sem isso, tudo
          // vira um único chunk de ~570kB, e qualquer mudança de uma linha
          // no app invalida o cache do navegador pro React/Supabase/ícones
          // inteiros de novo. Com isso, o chunk de vendor fica cacheado por
          // muito mais tempo entre deploys.
          manualChunks: {
            "vendor-react": ["react", "react-dom"],
            "vendor-supabase": ["@supabase/supabase-js"],
            "vendor-icons": ["lucide-react"],
          },
        },
      },
    },
  };
});
