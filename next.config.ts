import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The builder is fully client-side, so export a static bundle that can be
  // served directly by Cloudflare Pages without a Node.js runtime.
  output: "export",
  turbopack: {
    resolveAlias: {
      // ExcelJS' Node entry imports `tmp`; use its bundled browser entry for
      // the client-side Excel import/export features.
      exceljs: "exceljs/dist/exceljs.min.js",
    },
  },
};
export default nextConfig;
