import cors, { CorsOptions } from 'cors';

// CORS configuration (allowlist via env CORS_ORIGINS, comma-separated)
// Always include safe defaults in addition to env-provided values.
const defaultOrigins = 'http://localhost:3000,http://localhost:5173,https://*.vercel.app';
const allowedOrigins = (process.env.CORS_ORIGINS
  ? `${process.env.CORS_ORIGINS},${defaultOrigins}`
  : defaultOrigins)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  // de-duplicate while preserving order
  .filter((v, i, a) => a.indexOf(v) === i);

// Allow exact matches and simple wildcard patterns like https://*.vercel.app
function isOriginAllowed(origin: string): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes('*')) return true;
  if (allowedOrigins.includes(origin)) return true;
  // Match wildcard patterns
  for (const pat of allowedOrigins) {
    if (!pat.includes('*')) continue;
    // Escape regex special chars except '*', then replace '*' with '.*'
    const regex = new RegExp('^' + pat
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*') + '$');
    if (regex.test(origin)) return true;
  }
  return false;
}

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests or same-origin requests without an Origin header
    if (!origin) return callback(null, true);
    // Allow all if '*' present, else check explicit allowlist
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  // allow cors package to reflect requested headers automatically
  allowedHeaders: undefined,
  exposedHeaders: ['Content-Length'],
  maxAge: 600,
  optionsSuccessStatus: 204,
};

export const corsMiddleware = cors(corsOptions);
