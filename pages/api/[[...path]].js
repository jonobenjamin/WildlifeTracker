// Bridges the existing Express app (server/index.js) into Next.js.
// Pages Router API routes are plain Node (req, res) handlers, which is exactly
// what an Express app instance is — so we can export it directly and every
// existing route (/api/observations, /api/trees, /api/auth, ...) keeps working
// unchanged, now served from this same Next.js/Vercel deployment.
const app = require('../../server');

export const config = {
  api: {
    bodyParser: false, // let Express's own express.json() read the raw stream
    externalResolver: true,
  },
};

export default function handler(req, res) {
  return app(req, res);
}
