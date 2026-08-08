import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native napi-rs bindings must not be bundled by Turbopack/webpack
  serverExternalPackages: ["impit"],
  // Ensure platform .node binaries ship with Vercel serverless functions
  outputFileTracingIncludes: {
    "/api/dood/*": [
      "./node_modules/impit/**/*",
      "./node_modules/impit-linux-x64-gnu/**/*",
      "./node_modules/impit-linux-x64-musl/**/*",
      "./node_modules/impit-linux-arm64-gnu/**/*",
      "./node_modules/impit-linux-arm64-musl/**/*",
      "./node_modules/impit-win32-x64-msvc/**/*",
      "./node_modules/impit-darwin-*/**/*",
    ],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ik.imagekit.io" },
      { protocol: "https", hostname: "**.imagekit.io" },
      { protocol: "https", hostname: "**.b-cdn.net" },
      { protocol: "https", hostname: "**.ngrok-free.dev" },
      { protocol: "https", hostname: "**.ngrok-free.app" },
      { protocol: "https", hostname: "acf.goodreels.com" },
      { protocol: "https", hostname: "hwztchapter.dramaboxdb.com" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
    ],
  },
};

export default nextConfig;
