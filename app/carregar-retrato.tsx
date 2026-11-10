import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { armazemPadrao, RetratoIlegivelError, type Armazem } from "@/lib/armazem";
import { armazemEmBlob, clienteBlobPadrao } from "@/lib/armazem-blob";
import { armazemDecisoesEmBlob, armazemDecisoesPadrao, type ArmazemDecisoes } from "@/lib/armazem-decisoes";
import { HISTORICO_VAZIO, type HistoricoDecisoes } from "@/lib/decisoes";
import { modoDoApp, type ModoApp } from "@/lib/modo";
import { COOKIE_SESSAO, validarToken } from "@/lib/sessao";
import type { Retrato } from "@/lib/types";

export function Aviso({ titulo, texto, acao }: { titulo: string; texto: string; acao?: { href: string; rotulo: string } }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-serif text-3xl font-semibold">{titulo}</h1>
      <p className="mt-2 text-sm text-cinza">{texto}</p>
      {acao && <Link href={acao.href} className="mt-6 inline-block rounded-lg bg-acao px-5 py-2.5 text-sm font-semibold text-white">{acao.rotulo}</Link>}
    </main>
  );
}

export type CargaRetrato =
  | { retrato: Retrato; modo: ModoApp; podePublicar: boolean; decisoes: HistoricoDecisoes; avisoDecisoes?: string }
  | { aviso: ReactElement };

const AVISO_DECISOES_LOCAL =
  "O arquivo .fiscal/decisoes.json existe, mas não pôde ser lido: a página mostra a varredura sem as decisões do GT. Registrar uma decisão nova não vai funcionar até o arquivo ser corrigido.";
const AVISO_DECISOES_WEB = "As decisões do GT publicadas não puderam ser lidas: a página mostra a varredura sem elas.";

/**
 * Decisões do GT (spec 2026-10-30 §4.1.2): ausentes valem como histórico vazio; ilegíveis também,
 * com aviso na página e log técnico, para o painel e /repetidos abrirem do mesmo jeito.
 */
async function carregarDecisoes(
  armazem: ArmazemDecisoes, modo: ModoApp, rota: string,
): Promise<{ decisoes: HistoricoDecisoes; avisoDecisoes?: string }> {
  try {
    return { decisoes: await armazem.ler() };
  } catch (err) {
    console.error(`[${rota}] decisões não lidas:`, err instanceof Error ? err.message : "erro desconhecido");
    return { decisoes: HISTORICO_VAZIO, avisoDecisoes: modo === "web" ? AVISO_DECISOES_WEB : AVISO_DECISOES_LOCAL };
  }
}

/** Lê o último retrato (local ou publicado) para uma página; `rota` só identifica o log técnico. */
export async function carregarRetrato(rota: string): Promise<CargaRetrato> {
  const modo = modoDoApp();
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (modo === "web" && !token) {
    return { aviso: <Aviso titulo="Ambiente não configurado" texto="Falta a variável BLOB_READ_WRITE_TOKEN neste ambiente. Nada quebrou; só não há de onde ler a varredura publicada." /> };
  }
  if (modo === "web") {
    // Defesa em profundidade: o middleware já barrou, aqui confere de novo.
    const sessao = (await cookies()).get(COOKIE_SESSAO)?.value;
    if (!(await validarToken(sessao, process.env.APP_SEGREDO_COOKIE ?? "", Date.now()))) redirect("/entrar");
  }
  const armazem: Armazem = modo === "web" ? armazemEmBlob(clienteBlobPadrao(token as string)) : armazemPadrao();

  let retrato: Retrato | undefined;
  try {
    retrato = await armazem.lerRetrato();
  } catch (err) {
    if (err instanceof RetratoIlegivelError) {
      return {
        aviso: modo === "web"
          ? <Aviso titulo="A varredura publicada não pôde ser lida" texto="O retrato publicado existe, mas não é um retrato válido para esta versão do painel. Publique de novo a partir da máquina do GT." />
          : <Aviso titulo="O último retrato não pôde ser lido" texto="O arquivo .fiscal/retrato.json existe, mas não é um retrato válido. Faça uma nova varredura; ela substitui o arquivo." acao={{ href: "/nova-varredura", rotulo: "Nova varredura" }} />,
      };
    }
    if (modo === "web") {
      // Blob fora do ar: nada de cache, nada de retrato velho (spec §7).
      console.error(`[${rota}] retrato publicado não lido:`, err instanceof Error ? err.message : "erro desconhecido");
      return { aviso: <Aviso titulo="Não foi possível ler a varredura publicada" texto="O serviço de armazenamento não respondeu. Recarregue a página em instantes." /> };
    }
    throw err;
  }
  if (!retrato) {
    if (modo === "web") return { aviso: <Aviso titulo="Nenhuma varredura publicada ainda" texto="Quando a máquina do GT publicar uma varredura, ela aparece aqui." /> };
    redirect("/nova-varredura");
  }
  const armazemDecisoes = modo === "web" ? armazemDecisoesEmBlob(clienteBlobPadrao(token as string)) : armazemDecisoesPadrao();
  const decisoes = await carregarDecisoes(armazemDecisoes, modo, rota);
  return { retrato, modo, podePublicar: modo === "local" && Boolean(token), ...decisoes };
}
