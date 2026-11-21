import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Time slots now live under Schedule — keep old links and bookmarks working
      { source: '/slots', destination: '/schedule/slots', permanent: true },
      { source: '/slots/:id', destination: '/schedule/slots/:id', permanent: true },
      // In-app messaging has gone — old emails and bookmarks land somewhere useful
      { source: '/messages/:path+', destination: '/messages', permanent: false },
      { source: '/family/messages', destination: '/family', permanent: false },
    ];
  },
};

export default nextConfig;
