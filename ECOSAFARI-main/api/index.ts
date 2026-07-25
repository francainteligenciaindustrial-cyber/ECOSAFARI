// Vercel serverless entrypoint. Vercel routes every request matched by the
// rewrites in vercel.json here and invokes the exported Express app directly
// as a (req, res) handler — no app.listen() involved, Vercel's own runtime
// owns the HTTP server. The actual routes/logic all live in server.ts so
// this file stays a thin adapter, kept identical for local/Render (which run
// server.ts directly instead) and Vercel.
// Explicit ".js" extension required: package.json has "type": "module", so
// Vercel's Node runtime resolves this import with the native ESM loader,
// which — unlike CommonJS require() — does not do extensionless resolution.
// Omitting it was the actual cause of the FUNCTION_INVOCATION_FAILED crashes
// (ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/server').
import app from "../server.js";

export default app;
