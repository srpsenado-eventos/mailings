import { NextRequest, NextResponse } from "next/server";
import { criarAtrasador, senhaConfere } from "@/lib/entrada";
import { modoDoApp } from "@/lib/modo";
import { COOKIE_SESSAO, criarToken, DURACAO_SESSAO_MS } from "@/lib/sessao";

const MENSAGEM_ERRO = "Senha incorreta.";
/** Um registro por instância do servidor; spec 2026-09-04 §4 aceita. */
const atrasador = criarAtrasador();

function ipDe(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Entrada do modo web: senha única, resposta igual para qualquer erro, atraso progressivo por IP. */
export async function POST(req: NextRequest) {
  if (modoDoApp() !== "web") return NextResponse.json({ ok: false, message: "Não disponível." }, { status: 404 });
  const senha = process.env.APP_SENHA ?? "";
  const segredo = process.env.APP_SEGREDO_COOKIE ?? "";
  if (!senha || !segredo) return NextResponse.json({ ok: false, message: "Ambiente não configurado." }, { status: 503 });

  const ip = ipDe(req);
  const agora = Date.now();
  await esperar(atrasador.esperaAntes(ip, agora));

  let informada = "";
  try {
    const corpo = (await req.json()) as { senha?: unknown };
    if (typeof corpo.senha === "string") informada = corpo.senha;
  } catch {
    // corpo inválido conta como senha errada: mesma resposta
  }
  if (!senhaConfere(informada, senha)) {
    atrasador.registrarErro(ip, agora);
    return NextResponse.json({ ok: false, message: MENSAGEM_ERRO }, { status: 401 });
  }
  atrasador.registrarAcerto(ip);
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set({
    name: COOKIE_SESSAO,
    value: await criarToken(segredo, agora),
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: Math.floor(DURACAO_SESSAO_MS / 1000),
  });
  return resposta;
}
