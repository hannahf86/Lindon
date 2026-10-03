import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Time slots now live under Schedule — keep old links and bookmarks working
  async redirects() {
    return [
      { source: '/slots', destination: '/schedule/slots', permanent: true },
      { source: '/slots/:id', destination: '/schedule/slots/:id', permanent: true },
    ];
  },
};

export default nextConfig;
