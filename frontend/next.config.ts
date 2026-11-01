import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/sign-in",
        destination: "/login",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/docs",
        destination: "http://localhost:8000/api/docs",
      },
      {
        source: "/api/docs",
        destination: "http://localhost:8000/api/docs",
      },
      {
        source: "/api/openapi.json",
        destination: "http://localhost:8000/api/openapi.json",
      },
      {
        source: "/uploads/:path*",
        destination: "http://localhost:8000/uploads/:path*",
      },
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
