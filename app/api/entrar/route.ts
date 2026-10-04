import { NextRequest, NextResponse } from "next/server";
import { criarAtrasador, senhaConfere } from "@/lib/entrada";
import { modoDoApp } from "@/lib/modo";
import { COOKIE_SESSAO, criarToken, DURACAO_SESSAO_MS } from "@/lib/sessao";

/** O atraso progressivo chega a 30 s; com o limite padrão de 10 s da função ele viraria bloqueio. */
export const maxDuration = 60;

const MENSAGEM_ERRO = "Senha incorreta.";
/** Um registro por instância do servidor; spec 2026-09-04 §4 aceita. */
const atrasador = criarAtrasador();

/** Chave do contador global: quem troca de IP a cada tentativa ainda esbarra no teto de 30 s. */
const CHAVE_GLOBAL = "*global*";

/**
 * Na Vercel o proxy sobrescreve estes cabeçalhos; fora dela o x-forwarded-for é forjável,
 * por isso existe o contador global abaixo.
 */
function ipDe(req: NextRequest): string {
  return (
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "desconhecido"
  );
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Entrada do modo web: senha única, resposta igual para qualquer erro, atraso progressivo por IP. */
export async function POST(req: NextRequest) {
  if (modoDoApp() !== "web") return NextResponse.json({ ok: false, message: "Não disponível." }, { status: 404 });
  const senha = process.env.APP_SENHA ?? "";
  const segredo = process.env.APP_SEGREDO_COOKIE ?? "";
  if (!senha || !segredo) return NextResponse.json({ ok: false, message: "Ambiente não configurado." }, { status: 503 });

  const ip = ipDe(req);
  const antes = Date.now();
  // Durante um ataque todos esperam; ninguém fica trancado para fora.
  await esperar(Math.max(atrasador.esperaAntes(ip, antes), atrasador.esperaAntes(CHAVE_GLOBAL, antes)));
  const agora = Date.now();

  let informada = "";
  try {
    const corpo = (await req.json()) as { senha?: unknown };
    if (typeof corpo.senha === "string") informada = corpo.senha;
  } catch {
    // corpo inválido conta como senha errada: mesma resposta
  }
  if (!senhaConfere(informada, senha)) {
    atrasador.registrarErro(ip, agora);
    atrasador.registrarErro(CHAVE_GLOBAL, agora);
    return NextResponse.json({ ok: false, message: MENSAGEM_ERRO }, { status: 401 });
  }
  // Só o IP: a chave global expira pela janela.
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
