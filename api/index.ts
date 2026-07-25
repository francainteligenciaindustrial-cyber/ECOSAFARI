// Vercel serverless entrypoint. Vercel routes every request matched by the
// rewrites in vercel.json here and invokes the exported Express app directly
// as a (req, res) handler — no app.listen() involved, Vercel's own runtime
// owns the HTTP server. The actual routes/logic all live in server.ts so
// this file stays a thin adapter, kept identical for local/Render (which run
// server.ts directly instead) and Vercel.
import app from "../server";

export default app;
