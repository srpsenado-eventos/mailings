import { PRECEDENCIA, type NivelPrecedencia, type RegraPrecedencia } from "@/data/precedencia";
import { casaSegmento, segmentarGrupo } from "@/lib/catalogo";
import { grupoEquivalente, type CasoDecidido, type RegistroManual, type SituacaoNoContatos } from "@/lib/decisoes";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import type { ResultadoGrupo } from "@/lib/types";

/**
 * Base do cálculo das autoridades em mais de um grupo: tipos, regra da Nominata e peças comuns a
 * `lib/repetidos.ts` e `lib/repetidos-decisoes.ts`. Funções puras.
 */

/** Grupos fora deste eixo: os de eleitos (Eleição 2026, Ata 14) e o piloto de eventos. */
const GRUPO_FORA = /\beleit[oa]s?\b|piloto/;

/**
 * Regra de precedência de um segmento (já normalizado) do rótulo "Grupo" do Contatos.
 * Exata primeiro; por contenção só quando uma regra única casa — segmento que casa duas
 * fica de fora em vez de cair na primeira da tabela.
 */
export function regraDoSegmento(segmento: string): RegraPrecedencia | undefined {
  if (GRUPO_FORA.test(segmento)) return undefined;
  const exata = PRECEDENCIA.find((r) => normalizarTexto(r.grupo) === segmento);
  if (exata) return exata;
  const contidas = PRECEDENCIA.filter((r) => casaSegmento(normalizarTexto(r.grupo), segmento));
  return contidas.length === 1 ? contidas[0] : undefined;
}

const PRESIDENTE = /^(ministr[oa][- ])?president[ea]\b/;
const PRESIDENCIA_DE_ORGAO_INTERNO = /\b(turma|secao|comissao|conselho)\b/;

/** Nível da Nominata para o cargo dentro do grupo da regra; `undefined` = fora da Nominata. */
export function nivelDoCargo(regra: RegraPrecedencia, cargo: string): NivelPrecedencia | undefined {
  const c = normalizarTexto(cargo);
  if (regra.presidente && PRESIDENTE.test(c) && !PRESIDENCIA_DE_ORGAO_INTERNO.test(c)) return regra.presidente;
  if (regra.distritoFederal && c.includes("distrito federal")) return regra.distritoFederal;
  return regra.nivel;
}

/** Negativo quando `a` vem antes de `b` na Nominata ("4.9" antes de "4.10", "4.10" antes de "4.10.1"). */
export function compararNivel(a: string, b: string): number {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

/** De onde veio a ocorrência: o Contatos, a planilha da Câmara ou as listas de eleitos de 2026. */
export type OrigemOcorrencia = "contatos" | "camara" | "eleicao";

export interface OcorrenciaRepetida {
  /** Grupo do retrato (`ResultadoGrupo.grupo`), como aparece no painel; nas de fora, o grupo da lista. */
  grupo: string;
  /** Grupo da tabela de precedência que o rótulo casou. */
  grupoRegra: string;
  /** `normalizarNome` do nome no cadastro. */
  chave: string;
  cargo: string;
  nivel?: NivelPrecedencia;
  ex: boolean;
  possivelSaida: boolean;
  origem: OrigemOcorrencia;
  /**
   * Forma equivalente do grupo (spec 2026-10-30 §4.1.1), só no eleito com grupo de destino;
   * nas demais, `equivalenteDaOcorrencia` calcula a partir de `grupo` e `origem`.
   */
  grupoEquivalente?: string;
}

const ROTULO_ORIGEM: Record<OrigemOcorrencia, string> = {
  contatos: "Contatos",
  camara: "Planilha da Câmara",
  eleicao: "Eleição 2026",
};

/** Nome da lista de origem da ocorrência, como aparece na tela e no export. */
export function rotuloOrigem(origem: OrigemOcorrencia): string {
  return ROTULO_ORIGEM[origem];
}

/** `decidido`: pela regra da Nominata; `decidido_gt`: pela decisão do GT; `tratado`: decisão já refletida no Contatos. */
export type SituacaoRepetida = "decidido" | "conferir" | "decidido_gt" | "tratado";

export interface AutoridadeRepetida {
  nome: string;
  ocorrencias: OcorrenciaRepetida[];
  situacao: SituacaoRepetida;
  /** Só quando decidido. */
  convidaPor?: OcorrenciaRepetida;
  motivo: string;
  /** Há eleito de 2026 ligado pelo eixo da Eleição: pela Ata 14, convida o grupo atual (salvo o que o eixo deixou para conferir). */
  eleicao?: true;
  /** Caso do histórico de decisões do GT que casou esta autoridade (spec 2026-10-30 §4.1). */
  caso?: CasoDecidido;
  /** Registro manual vigente do caso. */
  decisao?: RegistroManual;
  /** Situação no Contatos, calculada ao vivo com os grupos do retrato. */
  noContatos?: SituacaoNoContatos;
}

export interface Escolha {
  situacao: SituacaoRepetida;
  convidaPor?: OcorrenciaRepetida;
  motivo: string;
}

export const MOTIVO_PARCIAL = "Nome parecido em grupos diferentes: conferir se é a mesma pessoa";
export const MOTIVO_SEM_NIVEL = "Nenhum dos cargos está na Nominata: decidir à mão";
export const MOTIVO_ELEITO_SEM_CARGO_ATUAL = "Eleita em 2026 sem cargo atual no Contatos: conferir o grupo";
export const MOTIVO_ELEICAO = "Eleição 2026: convidar pelo grupo atual (Ata 14)";

const rotulo = (o: OcorrenciaRepetida): string => `${o.grupoRegra} (${o.nivel ? o.nivel.nivel : "fora da Nominata"})`;

/** Com nível antes de sem nível; entre os com nível, a ordem da Nominata. */
function ordemDePrecedencia(a: OcorrenciaRepetida, b: OcorrenciaRepetida): number {
  if (a.nivel && b.nivel) return compararNivel(a.nivel.nivel, b.nivel.nivel);
  if (a.nivel) return -1;
  if (b.nivel) return 1;
  return 0;
}

/** Uma ocorrência por grupo da tabela (rótulos repetidos do mesmo grupo não disputam entre si): a de melhor nível. */
function melhorPorGrupoRegra(ocorrencias: readonly OcorrenciaRepetida[]): OcorrenciaRepetida[] {
  const melhores = new Map<string, OcorrenciaRepetida>();
  for (const o of ocorrencias) {
    const atual = melhores.get(o.grupoRegra);
    if (!atual || ordemDePrecedencia(o, atual) < 0) melhores.set(o.grupoRegra, o);
  }
  return [...melhores.values()];
}

/**
 * Regra do Clovis (2026-10-13): cargo atual vence cargo de "ex-"; entre os que restam,
 * vence o nível mais alto da Nominata. Empate, nenhum nível, nome parcial ou possível
 * saída no vencedor ficam para decidir à mão.
 */
export function escolherGrupo(ocorrencias: readonly OcorrenciaRepetida[], parcial: boolean): Escolha {
  if (parcial) return { situacao: "conferir", motivo: MOTIVO_PARCIAL };
  const atuais = ocorrencias.filter((o) => !o.ex);
  const disputa = melhorPorGrupoRegra(atuais.length > 0 ? atuais : ocorrencias);
  let vencedor: OcorrenciaRepetida;
  let motivo: string;
  if (disputa.length === 1) {
    vencedor = disputa[0];
    const exs = [...new Set(ocorrencias.filter((o) => o.ex).map((o) => o.grupoRegra))].join(", ");
    motivo = `Cargo atual (${vencedor.grupoRegra}) vence cargo de ex- (${exs})`;
  } else {
    const [primeira, segunda] = [...disputa].sort(ordemDePrecedencia);
    if (!primeira.nivel) return { situacao: "conferir", motivo: MOTIVO_SEM_NIVEL };
    if (segunda.nivel && compararNivel(primeira.nivel.nivel, segunda.nivel.nivel) === 0) {
      return { situacao: "conferir", motivo: `Mesmo nível na Nominata (${primeira.nivel.nivel}): decidir à mão` };
    }
    vencedor = primeira;
    motivo = `${rotulo(primeira)} antes de ${rotulo(segunda)}`;
  }
  if (vencedor.possivelSaida) {
    return { situacao: "conferir", motivo: `Possível saída em ${vencedor.grupoRegra}: confirmar o cargo antes de decidir` };
  }
  return { situacao: "decidido", convidaPor: vencedor, motivo };
}

/**
 * Spec 2026-10-27 §4.3: o eleito sai da disputa (Ata 14); entre os cargos atuais (do Contatos ou
 * da Câmara) vale `escolherGrupo`. Só cargo de ex- fica para conferir.
 */
export function escolherComEleito(ocorrencias: readonly OcorrenciaRepetida[]): Escolha {
  const atuais = ocorrencias.filter((o) => o.origem !== "eleicao" && !o.ex);
  if (atuais.length === 0) return { situacao: "conferir", motivo: MOTIVO_ELEITO_SEM_CARGO_ATUAL };
  const escolha = escolherGrupo(atuais, false);
  return escolha.situacao === "decidido" ? { ...escolha, motivo: MOTIVO_ELEICAO } : escolha;
}

export interface Entrada {
  nome: string;
  ocorrencia: OcorrenciaRepetida;
  /** Nomes da pessoa da Câmara (parlamentar e civil), já normalizados. */
  nomes?: readonly string[];
}

/** Uma entrada por segmento do rótulo que casa uma regra (célula "A; B" vira duas). */
export function entradasDoGrupo(g: ResultadoGrupo): Entrada[] {
  const regras = segmentarGrupo(g.grupo)
    .map(regraDoSegmento)
    .filter((r): r is RegraPrecedencia => r !== undefined)
    .filter((r, i, todas) => todas.findIndex((x) => x.grupo === r.grupo) === i);
  return g.contatos.flatMap((c) => {
    const chave = normalizarNome(c.contato.nome);
    if (!chave) return [];
    const cargo = c.contato.cargo ?? "";
    return regras.map((regra) => {
      const nivel = nivelDoCargo(regra, cargo);
      return {
        nome: c.contato.nome,
        ocorrencia: {
          grupo: g.grupo, grupoRegra: regra.grupo, chave, cargo,
          ...(nivel ? { nivel } : {}),
          ex: regra.ex, possivelSaida: Boolean(c.possivelSaida), origem: "contatos" as const,
        },
      };
    });
  });
}

/** Uma ocorrência por grupo, regra, nome e origem. */
export function semRepeticao(ocorrencias: readonly OcorrenciaRepetida[]): OcorrenciaRepetida[] {
  return ocorrencias.filter((o, i, todas) => todas.findIndex((x) =>
    x.grupo === o.grupo && x.grupoRegra === o.grupoRegra && x.chave === o.chave && x.origem === o.origem) === i);
}

/** Forma equivalente do grupo da ocorrência (spec 2026-10-30 §4.1.1). */
export function equivalenteDaOcorrencia(o: OcorrenciaRepetida): string {
  return o.grupoEquivalente ?? grupoEquivalente(o.grupo, o.origem);
}

/** Mesmo grupo, comparado por `normalizarTexto`. */
export function mesmoGrupo(a: string, b: string): boolean {
  return normalizarTexto(a) === normalizarTexto(b);
}
