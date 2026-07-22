import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://weayabo.github.io http://localhost:5173",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
