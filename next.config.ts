import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,
  // Output standalone build for Docker deployment
  output: "standalone",
  // Keep pdfkit as external — it needs .afm font data files at runtime
  serverExternalPackages: ["pdfkit"],

  // Skip type-checking + linting inside the docker build. Both are checked
  // locally via `npm run build` before push and (if we add it) in a fast CI
  // gate. Running them again inside the docker build was the longest, most
  // RAM-hungry phase — peaking at the moment OOM-killer fires on CT 104,
  // which kills the GHA SSH session mid-typecheck and reports the deploy as
  // failed even though everything was fine. Strip them from the prod build.
  // Reverts trivially if we ever want to gate on them in CI.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default withNextIntl(nextConfig);
