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
};

export default withNextIntl(nextConfig);
