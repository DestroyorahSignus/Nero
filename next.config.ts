import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NERO streams long-running agent runs; keep everything on the Node runtime.
  reactStrictMode: true,
};

export default nextConfig;
