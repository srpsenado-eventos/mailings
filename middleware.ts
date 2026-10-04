import { NextRequest, NextResponse } from "next/server";
import { modoDoApp } from "@/lib/modo";
import { COOKIE_SESSAO, validarToken } from "@/lib/sessao";

/**
 * Em modo web tudo fica atrás da senha, menos a tela de entrada e sua rota
 * (spec 2026-10-02 §6.4). Em modo local não há senha. Roda no edge: só WebCrypto.
 */
const LIVRES = ["/entrar", "/api/entrar"];

export async function middleware(req: NextRequest) {
  if (modoDoApp() !== "web") return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (LIVRES.includes(pathname)) return NextResponse.next();
  const valido = await validarToken(req.cookies.get(COOKIE_SESSAO)?.value, process.env.APP_SEGREDO_COOKIE ?? "", Date.now());
  if (valido) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ ok: false, message: "Entre com a senha." }, { status: 401 });
  const destino = req.nextUrl.clone();
  destino.pathname = "/entrar";
  destino.search = "";
  return NextResponse.redirect(destino);
}

export const config = {
  // Tudo, menos os arquivos estáticos do Next e o favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
