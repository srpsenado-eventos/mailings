import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fontes hospedadas no repositório (subconjunto latino, arquivos variáveis do Google Fonts):
// o build não depende mais do Google Fonts, que em 13/11/2026 devolveu URLs sem extensão
// e derrubou o deploy na Vercel (vercel/next.js#99114, sem correção na linha 15.5).
const plex = localFont({
  src: "./fonts/ibm-plex-sans-latin.woff2",
  weight: "400 600",
  variable: "--font-plex",
  display: "swap",
});
const newsreader = localFont({
  src: "./fonts/newsreader-latin.woff2",
  weight: "400 600",
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fiscal de Mailings",
  description: "Confronto de dados cadastrais de autoridades com fontes oficiais",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${plex.variable} ${newsreader.variable}`}>
      <body className="min-h-screen bg-fundo font-sans text-tinta">{children}</body>
    </html>
  );
}
