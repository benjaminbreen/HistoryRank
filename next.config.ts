import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  turbopack: {
    root: __dirname,
  },
  outputFileTracingIncludes: {
    '/api/figures': ['historyrank.db'],
    '/api/figures/[id]': ['historyrank.db'],
    '/api/scatter': ['historyrank.db'],
    '/api/health': ['historyrank.db'],
  },
};

export default nextConfig;
