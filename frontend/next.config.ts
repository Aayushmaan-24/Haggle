import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // FastAPI serves `frontend/out` as static files, so the app must be a static export.
  output: "export",
  // Emit `route/index.html` so Starlette's StaticFiles(html=True) resolves `/route/`.
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
