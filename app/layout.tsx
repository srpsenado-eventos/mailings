import type { Metadata } from "next";
import { IBM_Plex_Sans, Newsreader } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex" });
const newsreader = Newsreader({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-newsreader" });

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
