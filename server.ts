// Ponto de entrada do servidor. O núcleo (configuração, middlewares, clientes
// e helpers) está em server/core.ts; as rotas, por área, em server/routes/.
// Nenhum par de rotas com o mesmo método casa com a mesma URL, então a ordem
// de registro entre as áreas não muda o comportamento.
import express from "express";
import path from "path";
import {
  PORT,
  app,
  distPath,
  isProd,
  log,
  reportServerError,
  setViteDevServer,
} from "./server/core.js";
import { registerCatalogoRoutes } from "./server/routes/catalogo.js";
import { registerReservasRoutes } from "./server/routes/reservas.js";
import { registerIntegracoesRoutes } from "./server/routes/integracoes.js";
import { registerVendasRoutes } from "./server/routes/vendas.js";
import { registerPagamentosRoutes } from "./server/routes/pagamentos.js";
import { registerAdminRoutes } from "./server/routes/admin.js";
import { registerTurismoRoutes } from "./server/routes/turismo.js";
import { registerTuristasRoutes } from "./server/routes/turistas.js";
import { registerParceirosRoutes } from "./server/routes/parceiros.js";
import { registerSitesRoutes } from "./server/routes/sites.js";

registerCatalogoRoutes(app);
registerReservasRoutes(app);
registerIntegracoesRoutes(app);
registerVendasRoutes(app);
registerPagamentosRoutes(app);
registerAdminRoutes(app);
registerTurismoRoutes(app);
registerTuristasRoutes(app);
registerParceirosRoutes(app);
registerSitesRoutes(app);


// Catches errors passed to next(err) by any route above (routes that handle
// their own try/catch and respond directly never reach this). Must be
// registered with all 4 params — that arity is how Express recognizes an
// error handler instead of regular middleware.
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  log.error("Erro não tratado:", err);
  reportServerError(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Erro interno do servidor" });
});

// Long-lived Node process entrypoint — used locally (npm run dev) and on
// hosts that run `npm run start` directly (e.g. Render, Railway). Never
// invoked on Vercel: serverless functions there just export `app` below and
// Vercel's own runtime handles the HTTP listening.
async function startLocalServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const viteDevServer = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    setViteDevServer(viteDevServer);
    app.use(viteDevServer.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    log.info(`Server running on port ${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startLocalServer();
}

export default app;
