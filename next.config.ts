import type { NextConfig } from "next";

// Two ways this app is built:
//  - normal `next build` / `next dev`: pages + API routes (the original setup).
//  - STATIC_EXPORT=1 (scripts/buildWorkerAssets.mjs): only the pages, exported as
//    plain files into ./out for the Cloudflare Worker to serve. The API routes
//    run inside the Worker itself (worker/index.ts), so they must not take part
//    in the export. Restricting pageExtensions to "tsx" does that: the pages are
//    .tsx files, the route handlers are .ts files.
const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = staticExport
  ? {
      output: "export",
      pageExtensions: ["tsx"],
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
