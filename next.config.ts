import type { NextConfig } from "next";
// puppeteer-core abre o Chrome local pelo processo do servidor e pdf-parse traz o pdf.js com o seu worker;
// o bundler do Next não deve empacotá-los.
const nextConfig: NextConfig = { serverExternalPackages: ["jsdom", "puppeteer-core", "pdf-parse"] };
export default nextConfig;
