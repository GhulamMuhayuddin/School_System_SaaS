// Vercel serverless entry (Phase 20C): the whole Express API as one function.
// vercel.json rewrites /api/* here; Express still sees the original path. Built by `pnpm --filter @nexora/api build`.
const mod = require('../apps/api/dist/server.js');
module.exports = mod.default || mod;
