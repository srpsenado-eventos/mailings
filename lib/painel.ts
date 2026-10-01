import { coerenciasVisiveis, textoCoerencia } from "@/lib/tratamento";
import type {
  ComparacaoCampo,
  ResultadoContato,
  ResultadoGrupo,
  SituacaoEndereco,
} from "@/lib/types";

/**
 * O que o painel mostra, decidido fora do JSX: etiquetas por campo, situação da linha,
 * motivo, cartões do detalhe. Os componentes só renderizam o que sai daqui.
 * Ver docs/superpowers/specs/2026-10-01-painel-local-retrato-em-arquivo.md, §6 e §7.
 */

export type Tom = "ok" | "atencao" | "ruim" | "neutro";
export type CampoEtiqueta = "nome" | "cargo" | "tratamento" | "enderecamento" | "endereco" | "fonte";

export interface Etiqueta {
  campo: CampoEtiqueta;
  texto: string;
  tom: Tom;
}

type CampoComparado = "nome" | "cargo" | "tratamento" | "enderecamento";

const ROTULO_CAMPO: Record<CampoComparado, string> = {
  nome: "Nome",
  cargo: "Cargo",
  tratamento: "Tratamento",
  enderecamento: "Endereçamento",
};

const ETIQUETA_ENDERECO: Record<Exclude<SituacaoEndereco, "sem_base">, { texto: string; tom: Tom }> = {
  completo: { texto: "Endereço completo", tom: "ok" },
  a_completar: { texto: "Endereço a completar", tom: "neutro" },
  pendente: { texto: "Endereço a confirmar", tom: "atencao" },
  nao_verificado: { texto: "Endereço não verificado", tom: "neutro" },
};

/** A comparação de VALOR do campo (site ou protocolo). Coerência é diagnóstico, não valor. */
function comparacaoDeValor(c: ResultadoContato, campo: CampoComparado): ComparacaoCampo | undefined {
  return c.comparacoes.find((x) => x.campo === campo && x.origemValor !== "coerencia");
}

function coerenciasDo(c: ResultadoContato, campo: CampoComparado): ComparacaoCampo[] {
  return coerenciasVisiveis(c.comparacoes).filter((x) => x.campo === campo);
}

/**
 * Etiqueta de um campo comparado. Coerência divergente (Camadas A e C) e valor divergente
 * (Camada 1 ou B) viram o mesmo "diverge": para quem lê a linha, o campo precisa de revisão.
 * `fonte_nao_informa` some; `sem_regra` fica neutro, porque não é divergência.
 */
function etiquetaDoCampo(c: ResultadoContato, campo: CampoComparado): Etiqueta | undefined {
  const rotulo = ROTULO_CAMPO[campo];
  const comp = comparacaoDeValor(c, campo);
  if (coerenciasDo(c, campo).length > 0 || comp?.situacao === "divergente") {
    return { campo, texto: `${rotulo} diverge`, tom: "atencao" };
  }
  if (!comp) return { campo, texto: `${rotulo} não verificado`, tom: "neutro" };
  if (comp.situacao === "confere") return { campo, texto: `${rotulo} confere`, tom: "ok" };
  if (comp.situacao === "sem_regra") return { campo, texto: `${rotulo} sem regra`, tom: "neutro" };
  return undefined; // fonte_nao_informa
}

export function etiquetasDoContato(c: ResultadoContato, _g: ResultadoGrupo): Etiqueta[] {
  const lista: Etiqueta[] = [];
  if (c.possivelSaida) {
    // Não há com o que comparar nome e cargo; só a Camada C (nome) ainda pode acusar.
    lista.push({ campo: "fonte", texto: "Sem par na fonte", tom: "ruim" });
    const nome = etiquetaDoCampo(c, "nome");
    if (nome?.tom === "atencao") lista.push(nome);
  } else {
    for (const campo of ["nome", "cargo"] as const) {
      const e = etiquetaDoCampo(c, campo);
      if (e) lista.push(e);
    }
  }
  for (const campo of ["tratamento", "enderecamento"] as const) {
    const e = etiquetaDoCampo(c, campo);
    if (e) lista.push(e);
  }
  const endereco = etiquetaDeEndereco(c);
  if (endereco) lista.push(endereco);
  return lista;
}

/** Etiqueta do endereço, sozinha: o bloco de endereço do detalhe a mostra de novo. */
export function etiquetaDeEndereco(c: ResultadoContato): Etiqueta | undefined {
  const situacao = c.endereco?.situacao;
  if (!situacao || situacao === "sem_base") return undefined;
  return { campo: "endereco", ...ETIQUETA_ENDERECO[situacao] };
}

const PRECISA_REVISAR: readonly Tom[] = ["atencao", "ruim"];

export function situacaoDoContato(c: ResultadoContato, g: ResultadoGrupo): { texto: string; tom: Tom } {
  if (c.possivelSaida) return { texto: "Possível saída", tom: "ruim" };
  if (g.semFonte) return { texto: "Sem fonte", tom: "neutro" };
  if (c.semaforo === "indeterminado") return { texto: "Não verificado", tom: "neutro" };
  const aRevisar = etiquetasDoContato(c, g).filter((e) => PRECISA_REVISAR.includes(e.tom)).length;
  return aRevisar === 0
    ? { texto: "Tudo confere", tom: "ok" }
    : { texto: `${aRevisar} a revisar`, tom: "atencao" };
}

export function motivoDoContato(c: ResultadoContato, g: ResultadoGrupo): string | undefined {
  if (c.possivelSaida) return "Não consta na fonte: confirmar se saiu";
  if (g.semFonte) return "Sem fonte cadastrada";
  if (g.fonteInacessivel) return "Fonte fora do ar: confira à mão";
  if (c.semaforo === "indeterminado") return "Não verificado: uma fonte não respondeu";
  return undefined;
}

export interface DetalheCampo {
  campo: CampoComparado;
  rotulo: string;
  etiqueta?: Etiqueta;
  valorPlanilha: string;
  origem: string;
  valorReferencia: string;
  copiavel?: string;
  coerencias: string[];
}

const TEXTO_FONTE_NAO_INFORMA = "o site não informa";
const TEXTO_SEM_REGRA = "sem regra de protocolo para este cargo";
const SUFIXO_VIA_IA = " (via IA — confira)";

function origemDe(campo: CampoComparado): string {
  return campo === "nome" || campo === "cargo" ? "Site do órgão diz" : "Tabela de protocolo diz";
}

function valorReferenciaDe(comp: ComparacaoCampo | undefined): string {
  if (!comp) return "";
  if (comp.situacao === "fonte_nao_informa") return TEXTO_FONTE_NAO_INFORMA;
  if (comp.situacao === "sem_regra") return TEXTO_SEM_REGRA;
  const valor = comp.valorEsperado ?? "";
  return valor && comp.origemValor === "conhecimento" ? `${valor}${SUFIXO_VIA_IA}` : valor;
}

/** Um cartão por campo que tem comparação de valor ou achado de coerência, na ordem fixa. */
export function detalhesDoContato(c: ResultadoContato, _g: ResultadoGrupo): DetalheCampo[] {
  const cartoes: DetalheCampo[] = [];
  for (const campo of ["nome", "cargo", "tratamento", "enderecamento"] as const) {
    const comp = comparacaoDeValor(c, campo);
    const coerencias = coerenciasDo(c, campo);
    if (!comp && coerencias.length === 0) continue;
    const valorPlanilha = campo === "nome" ? c.contato.nome : (comp?.valorPlanilha ?? coerencias[0]?.valorPlanilha ?? "");
    const copiavel = comp?.situacao === "divergente" && comp.valorEsperado ? comp.valorEsperado : undefined;
    cartoes.push({
      campo,
      rotulo: ROTULO_CAMPO[campo],
      etiqueta: etiquetaDoCampo(c, campo),
      valorPlanilha,
      origem: origemDe(campo),
      valorReferencia: valorReferenciaDe(comp),
      ...(copiavel ? { copiavel } : {}),
      coerencias: coerencias.map(textoCoerencia),
    });
  }
  return cartoes;
}
