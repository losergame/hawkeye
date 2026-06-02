import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

// Content Security Policy — controls which origins can load resources.
// 'unsafe-inline' and 'unsafe-eval' are required for Next.js internals.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://finnhub.io wss://ws.finnhub.io https://api.polygon.io https://hooks.slack.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: projectRoot,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  webpack(config) {
    // Node.js v22+ ships with a WebAssembly-based xxhash (WasmHash) that can
    // crash on certain versions. Fall back to md4 (webpack's traditional built-in).
    config.output.hashFunction = "md4";
    config.output.hashDigestLength = 20;
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy",    value: CSP },
          { key: "X-Frame-Options",            value: "DENY" },
          { key: "X-Content-Type-Options",     value: "nosniff" },
          { key: "Referrer-Policy",            value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",         value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control",     value: "off" },
        ],
      },
    ];
  },
};

export default nextConfig;
