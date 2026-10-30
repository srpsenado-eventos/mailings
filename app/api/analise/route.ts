import { NextRequest, NextResponse } from "next/server";
import { analisar, type Dependencias } from "@/lib/analise";
import { parsePayloadAnalise, PayloadInvalidoError } from "@/lib/analise-payload";
import { armazemPadrao, type Armazem } from "@/lib/armazem";
import { aplicarEleicao } from "@/lib/eleitos";
import { resolverGrupoEFonte } from "@/lib/catalogo";
import { aplicarListas } from "@/lib/grupos-lista";
import { diaMes, falhasDoRetrato, memoriaDoRetrato } from "@/lib/memoria-leitura";
import { modoDoApp } from "@/lib/modo";
import { origemPermitida } from "@/lib/origem";
import { montarRetrato } from "@/lib/painel";
import { abrirSessao } from "@/lib/navegador";
import { comRepeticao, RASPADORES_PADRAO, rasparFonte } from "@/lib/raspagem";
import { extrairComposicao, diagnosticarIa } from "@/lib/gemini";
import type { Retrato } from "@/lib/types";

const AVISO_NAO_GUARDADO = "A varredura terminou, mas o retrato não pôde ser guardado: na próxima abertura o app não a terá.";

/** Retrato anterior, só para a memória de leitura e as falhas por URL: ausente ou ilegível vale como "sem memória" (spec 2026-10-20 §10). */
async function lerRetratoAnterior(armazem: Armazem): Promise<Retrato | undefined> {
  try {
    return await armazem.lerRetrato();
  } catch (err) {
    // Só o motivo técnico: o retrato tem PII e nunca vai para o log.
    console.error("[/api/analise] retrato anterior ilegível, varredura sem memória:", err instanceof Error ? err.message : "erro desconhecido");
    return undefined;
  }
}

/**
 * Recebe os contatos (e, opcionalmente, os endereços) já extraídos no navegador, varre as
 * fontes a partir desta máquina e grava o retrato em `.fiscal/retrato.json`. Sem teto de
 * tempo: o app é local (spec 2026-10-01, painel local). A rota não é testada diretamente;
 * `analisar`, `montarRetrato` e o `Armazem` são.
 */
export async function POST(req: NextRequest) {
  if (!origemPermitida(req.headers)) return NextResponse.json({ ok: false, message: "Origem não permitida." }, { status: 403 });
  // A Vercel nunca lê fonte (spec 2026-10-02 §6.5): em modo web a rota não existe.
  if (modoDoApp() === "web") return NextResponse.json({ ok: false, message: "Não disponível." }, { status: 404 });
  try {
    let corpo: unknown;
    try {
      corpo = await req.json();
    } catch {
      return NextResponse.json({ ok: false, message: "Corpo inválido (esperado JSON)." }, { status: 400 });
    }

    const { arquivoNome, contatos, arquivoEnderecosNome, enderecos, eleitos, deputadosAtuais, governadores, arquivosEleicao, baseEnderecos } = parsePayloadAnalise(corpo);

    // Memória de leitura por página (spec 2026-10-20 §6): a do retrato anterior, reconstruída
    // quando ele é de antes do mecanismo. O mesmo relógio vale para a validade e para a data das leituras.
    // As falhas por URL do retrato anterior contam as coletas seguidas em que cada URL caiu
    // (spec 2026-10-23 §3.4).
    const agora = new Date();
    const armazem = armazemPadrao();
    const anterior = await lerRetratoAnterior(armazem);
    const leiturasAnteriores = memoriaDoRetrato(anterior, agora);
    const falhasAnteriores = falhasDoRetrato(anterior);

    // Sessão do Chrome com janela para as fontes `navegador: "janela"` (spec 2026-10-15 §4.2):
    // aberta uma vez por varredura, lançada só se alguma fonte precisar, fechada sempre.
    const sessao = abrirSessao();
    let analisado;
    try {
      const deps: Dependencias = {
        resolverFonte: (grupo) => resolverGrupoEFonte(grupo),
        // Repetição com espera para falhas transitórias (30 s, 120 s); a fonte "janela" passa
        // direto, porque a sessão já tem ritmo e repetição próprios (spec 2026-10-23 §3.2).
        raspar: comRepeticao((fonte) => rasparFonte(fonte, { ...RASPADORES_PADRAO, porJanela: (url, opcoes) => sessao.raspar(url, opcoes) })),
        extrairComposicao: (grupoCanonico, textoLimpo) => extrairComposicao(grupoCanonico, textoLimpo),
        leiturasAnteriores,
        falhasAnteriores,
        agora: () => agora,
      };
      analisado = await analisar(arquivoNome, contatos, deps, enderecos);
    } finally {
      await sessao.fechar();
    }
    // Eleição 2026: passada posterior, eixo próprio (spec 2026-10-05 §4.3).
    const comEleicao = eleitos || deputadosAtuais || governadores
      ? aplicarEleicao(analisado, eleitos ?? [], arquivosEleicao ?? [], deputadosAtuais, governadores)
      : analisado;
    // Grupos de modo `lista` comparados com as planilhas desta varredura (spec 2026-10-30 §4.6).
    const resultado = aplicarListas(comEleicao, diaMes(agora.toISOString()));
    const retrato = montarRetrato(
      resultado,
      {
        contatos: { nome: arquivoNome, linhas: contatos.length },
        ...(enderecos
          ? { enderecos: { nome: arquivoEnderecosNome ?? "endereços", linhas: enderecos.length } }
          : {}),
        ...(baseEnderecos ? { baseEnderecos } : {}),
      },
      new Date(),
    );

    let aviso: string | undefined;
    try {
      await armazem.gravarRetrato(retrato);
    } catch (err) {
      // Só o motivo técnico: o retrato tem PII e nunca vai para o log.
      console.error("[/api/analise] retrato não guardado:", err instanceof Error ? err.message : "erro desconhecido");
      aviso = AVISO_NAO_GUARDADO;
    }

    // Diagnóstico temporário (não-PII): só roda com ?diag=1 (custo zero no fluxo normal).
    const diag = req.nextUrl.searchParams.get("diag") === "1" ? await diagnosticarIa() : undefined;
    // A base inteira tem PII e a memória só interessa à máquina: ambas já estão no arquivo local.
    const { baseEnderecos: _baseGuardada, leituras: _memoria, ...retratoDaResposta } = retrato;
    return NextResponse.json({ ok: true, retrato: retratoDaResposta, ...(aviso ? { aviso } : {}), ...(diag ? { diag } : {}) });
  } catch (err) {
    if (err instanceof PayloadInvalidoError) {
      return NextResponse.json({ ok: false, message: err.message }, { status: 422 });
    }
    // Log sem PII (só o motivo técnico).
    console.error("[/api/analise] falha:", err instanceof Error ? err.message : "erro desconhecido");
    const message = err instanceof Error ? err.message : "Erro inesperado.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
