import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/figures': ['historyrank.db'],
    '/api/figures/[id]': ['historyrank.db'],
    '/api/scatter': ['historyrank.db'],
    '/api/health': ['historyrank.db'],
  },
};

export default nextConfig;
