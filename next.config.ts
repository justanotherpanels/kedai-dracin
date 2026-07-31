import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ik.imagekit.io" },
      { protocol: "https", hostname: "**.imagekit.io" },
      { protocol: "https", hostname: "**.b-cdn.net" },
      { protocol: "https", hostname: "**.ngrok-free.dev" },
      { protocol: "https", hostname: "**.ngrok-free.app" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
    ],
  },
};

export default nextConfig;
