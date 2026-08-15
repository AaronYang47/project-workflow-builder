import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The builder is fully client-side, so export a static bundle that can be
  // served directly by Cloudflare Pages without a Node.js runtime.
  output: "export",
};
export default nextConfig;
