import type { NextConfig } from "next";
// puppeteer-core abre o Chrome local pelo processo do servidor; o bundler do Next não deve empacotá-lo.
const nextConfig: NextConfig = { serverExternalPackages: ["jsdom", "puppeteer-core"] };
export default nextConfig;
