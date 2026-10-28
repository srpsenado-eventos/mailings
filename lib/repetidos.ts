import { NIVEIS_ELEITOS, PRECEDENCIA, type NivelPrecedencia, type RegraPrecedencia } from "@/data/precedencia";
import { casaSegmento, segmentarGrupo } from "@/lib/catalogo";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import type { Etiqueta } from "@/lib/painel";
import { NOME_GRUPO_DEPUTADOS, temGrupoDeputados } from "@/lib/painel-deputados";
import type { ResultadoContato, ResultadoEleicao, ResultadoGrupo } from "@/lib/types";

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

export type SituacaoRepetida = "decidido" | "conferir";

export interface AutoridadeRepetida {
  nome: string;
  ocorrencias: OcorrenciaRepetida[];
  situacao: SituacaoRepetida;
  /** Só quando decidido. */
  convidaPor?: OcorrenciaRepetida;
  motivo: string;
  /** Há ocorrência de eleito de 2026 (nome exato): pela Ata 14, convida o grupo atual. */
  eleicao?: true;
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
function escolherComEleito(ocorrencias: readonly OcorrenciaRepetida[]): Escolha {
  const atuais = ocorrencias.filter((o) => o.origem !== "eleicao" && !o.ex);
  if (atuais.length === 0) return { situacao: "conferir", motivo: MOTIVO_ELEITO_SEM_CARGO_ATUAL };
  const escolha = escolherGrupo(atuais, false);
  return escolha.situacao === "decidido" ? { ...escolha, motivo: MOTIVO_ELEICAO } : escolha;
}

interface Entrada {
  nome: string;
  ocorrencia: OcorrenciaRepetida;
  /** Nomes da pessoa de fora (parlamentar e civil; urna e completo), já normalizados. */
  nomes?: readonly string[];
}

/** Uma pessoa das listas de fora do Contatos, com os dois nomes dela. */
export interface PessoaDeFora {
  nomes: string[];
  ocorrencia: OcorrenciaRepetida;
}

const NIVEL_DEPUTADOS = PRECEDENCIA.find((r) => r.grupo === NOME_GRUPO_DEPUTADOS)?.nivel;

function pessoaDeFora(
  nomes: readonly string[], grupoDaLista: string, cargo: string, origem: OrigemOcorrencia, nivel: NivelPrecedencia | undefined,
): PessoaDeFora[] {
  const chave = normalizarNome(nomes[0] ?? "");
  if (!chave) return [];
  return [{
    nomes: [...nomes],
    ocorrencia: {
      grupo: grupoDaLista, grupoRegra: grupoDaLista, chave, cargo,
      ...(nivel ? { nivel } : {}),
      ex: false, possivelSaida: false, origem,
    },
  }];
}

/**
 * Pessoas das listas de fora do Contatos (spec 2026-10-27 §4.2): deputados atuais da planilha da
 * Câmara (só enquanto o grupo não existe no Contatos) e eleitos de 2026 (Senado, Câmara, governos).
 */
export function ocorrenciasDeFora(eleicao: ResultadoEleicao | undefined): PessoaDeFora[] {
  if (!eleicao) return [];
  const deputados = temGrupoDeputados(eleicao)
    ? (eleicao.deputadosAtuais ?? []).flatMap((d) =>
        pessoaDeFora([d.nomeParlamentar, d.nomeCivil], NOME_GRUPO_DEPUTADOS, "Deputado Federal", "camara", NIVEL_DEPUTADOS))
    : [];
  const parlamentares = eleicao.eleitos.flatMap(({ eleito }) =>
    eleito.casa === "senado"
      ? pessoaDeFora([eleito.nomeUrna, eleito.nomeCompleto], "Senadores Eleitos", "Senador eleito", "eleicao", NIVEIS_ELEITOS.senado)
      : pessoaDeFora([eleito.nomeUrna, eleito.nomeCompleto], "Deputados Federais Eleitos", "Deputado federal eleito", "eleicao", NIVEIS_ELEITOS.camara));
  const governadores = (eleicao.governadores?.eleitos ?? []).flatMap(({ eleito }) =>
    pessoaDeFora(
      [eleito.nomeUrna, eleito.nomeCompleto], "Governadores Eleitos", "Governador eleito", "eleicao",
      eleito.uf.trim().toUpperCase() === "DF" ? NIVEIS_ELEITOS.governadorDistritoFederal : NIVEIS_ELEITOS.governador,
    ));
  return [...deputados, ...parlamentares, ...governadores];
}

const LIGACOES = new Set(["de", "da", "do", "das", "dos", "e"]);
const MIN_PALAVRAS_PARCIAL = 2;

function palavrasDoNome(chave: string): string[] {
  return chave.split(" ").filter((p) => p.length > 1 && !LIGACOES.has(p));
}

/** Uma entrada por segmento do rótulo que casa uma regra (célula "A; B" vira duas). */
function entradasDoGrupo(g: ResultadoGrupo): Entrada[] {
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

function contido(a: readonly string[], b: readonly string[]): boolean {
  return a.length >= MIN_PALAVRAS_PARCIAL && a.every((p) => b.includes(p));
}

const parcialEntre = (a: string, b: string): boolean => {
  const [pa, pb] = [palavrasDoNome(a), palavrasDoNome(b)];
  return contido(pa, pb) || contido(pb, pa);
};

/**
 * Junta as chaves de nome parcial (uma contida na outra) que estão em grupos diferentes.
 * Chave só de fora do Contatos se liga apenas a chaves do Contatos, por qualquer dos nomes
 * da pessoa; duas chaves de fora nunca se ligam entre si.
 */
function componentesDeNome(porChave: ReadonlyMap<string, Entrada[]>, doContatos: ReadonlySet<string>): string[][] {
  const chaves = [...porChave.keys()];
  const pai = new Map(chaves.map((k) => [k, k]));
  const raiz = (k: string): string => (pai.get(k) === k ? k : raiz(pai.get(k) as string));
  // Na chave do Contatos só contam os grupos do Contatos: o eleito casado exato não liga dois nomes do mesmo grupo.
  const grupos = (k: string) => new Set((porChave.get(k) ?? [])
    .filter((e) => !doContatos.has(k) || e.ocorrencia.origem === "contatos")
    .map((e) => e.ocorrencia.grupoRegra));
  const nomesDaChave = (k: string): string[] =>
    doContatos.has(k) ? [k] : [...new Set((porChave.get(k) ?? []).flatMap((e) => e.nomes ?? [k]))];
  for (let i = 0; i < chaves.length; i++) {
    for (let j = i + 1; j < chaves.length; j++) {
      const [a, b] = [chaves[i], chaves[j]];
      if (!doContatos.has(a) && !doContatos.has(b)) continue;
      if (!nomesDaChave(a).some((na) => nomesDaChave(b).some((nb) => parcialEntre(na, nb)))) continue;
      if (new Set([...grupos(a), ...grupos(b)]).size < 2) continue;
      pai.set(raiz(a), raiz(b));
    }
  }
  const porRaiz = new Map<string, string[]>();
  for (const k of chaves) porRaiz.set(raiz(k), [...(porRaiz.get(raiz(k)) ?? []), k]);
  return [...porRaiz.values()];
}

/**
 * Entrada da pessoa de fora. Casa exata com o Contatos quando qualquer dos nomes é igual a uma
 * chave do Contatos (fica sob essa chave); senão, fica sob a própria chave e só se liga por nome parcial.
 */
function entradaDeFora(p: PessoaDeFora, doContatos: ReadonlySet<string>): { chave: string; entrada: Entrada } | undefined {
  const nomes = [...new Set(p.nomes.map(normalizarNome).filter(Boolean))];
  if (nomes.length === 0) return undefined;
  const exata = nomes.find((n) => doContatos.has(n));
  return { chave: exata ?? p.ocorrencia.chave, entrada: { nome: p.nomes[0], ocorrencia: p.ocorrencia, nomes } };
}

function autoridadeDoComponente(chaves: readonly string[], porChave: ReadonlyMap<string, Entrada[]>): AutoridadeRepetida[] {
  const doComponente = chaves.flatMap((k) => porChave.get(k) ?? []);
  const doCadastro = doComponente.find((e) => e.ocorrencia.origem === "contatos");
  if (!doCadastro) return [];
  const ocorrencias = doComponente
    .map((e) => e.ocorrencia)
    .filter((o, i, todas) => todas.findIndex((x) =>
      x.grupo === o.grupo && x.grupoRegra === o.grupoRegra && x.chave === o.chave && x.origem === o.origem) === i);
  if (new Set(ocorrencias.map((o) => o.grupoRegra)).size < 2) return [];
  const parcial = chaves.length > 1;
  if (!parcial && ocorrencias.some((o) => o.origem === "eleicao")) {
    return [{ nome: doCadastro.nome, ocorrencias, ...escolherComEleito(ocorrencias), eleicao: true }];
  }
  return [{ nome: doCadastro.nome, ocorrencias, ...escolherGrupo(ocorrencias, parcial) }];
}

/**
 * Autoridades em dois ou mais grupos do retrato, com o grupo do convite. "Conferir" primeiro.
 * Com `eleicao`, entram também a planilha da Câmara e os eleitos de 2026 (spec 2026-10-27);
 * só conta quem tem pelo menos uma ocorrência no Contatos.
 */
export function autoridadesRepetidas(grupos: readonly ResultadoGrupo[], eleicao?: ResultadoEleicao): AutoridadeRepetida[] {
  const porChave = new Map<string, Entrada[]>();
  const juntar = (chave: string, e: Entrada) => porChave.set(chave, [...(porChave.get(chave) ?? []), e]);
  for (const e of grupos.flatMap(entradasDoGrupo)) juntar(e.ocorrencia.chave, e);
  const doContatos = new Set(porChave.keys());
  for (const p of ocorrenciasDeFora(eleicao)) {
    const fora = entradaDeFora(p, doContatos);
    if (fora) juntar(fora.chave, fora.entrada);
  }

  const lista = componentesDeNome(porChave, doContatos).flatMap((chaves) => autoridadeDoComponente(chaves, porChave));

  return lista.sort((a, b) =>
    a.situacao !== b.situacao ? (a.situacao === "conferir" ? -1 : 1) : a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** Etiqueta da linha do contato no painel; fora de `etiquetasDoContato`, não pinta a situação. */
export function etiquetaDeRepeticao(
  repetidas: readonly AutoridadeRepetida[],
  c: ResultadoContato,
  grupo: string,
): Etiqueta | undefined {
  const chave = normalizarNome(c.contato.nome);
  const a = repetidas.find((r) => r.ocorrencias.some((o) => o.origem === "contatos" && o.grupo === grupo && o.chave === chave));
  if (!a) return undefined;
  const convidaPor = a.convidaPor;
  if (a.situacao === "conferir" || !convidaPor) {
    return { campo: "grupo", tom: "atencao", texto: "Em mais de um grupo: conferir", explicacao: a.motivo };
  }
  // Eleito decidido: o grupo atual convida e a linha já tem a etiqueta da Eleição 2026.
  if (a.eleicao) return undefined;
  if (convidaPor.origem === "contatos" && convidaPor.grupo === grupo) {
    const outros = [...new Set(a.ocorrencias.filter((o) => o.grupoRegra !== convidaPor.grupoRegra).map((o) => o.grupoRegra))].join(", ");
    return { campo: "grupo", tom: "neutro", texto: `Convidada por este grupo; também em ${outros}`, explicacao: a.motivo };
  }
  return { campo: "grupo", tom: "ruim", texto: `Autoridade a ser convidada pelo grupo ${convidaPor.grupoRegra}`, explicacao: a.motivo };
}

export type FiltroRepetidas = "todas" | "decidido" | "conferir";

export function filtrarRepetidas(lista: readonly AutoridadeRepetida[], busca: string, filtro: FiltroRepetidas): AutoridadeRepetida[] {
  const termo = normalizarTexto(busca);
  return lista.filter((a) => (filtro === "todas" || a.situacao === filtro) && (!termo || normalizarTexto(a.nome).includes(termo)));
}

/** Texto do link; `n` conta só as autoridades sem `eleicao` (as de eleito vão em `textoEleitosRepetidos`). */
export function textoRepetidas(n: number): string {
  return n === 1 ? "1 autoridade em mais de um grupo" : `${n} autoridades em mais de um grupo`;
}

export function textoEleitosRepetidos(n: number): string {
  return n === 1 ? "1 eleito já no Contatos" : `${n} eleitos já no Contatos`;
}

/** Divide a lista em eleitos de 2026 (seção própria da tela) e demais, mantendo a ordem. */
export function separarRepetidas(lista: readonly AutoridadeRepetida[]): { demais: AutoridadeRepetida[]; eleitos: AutoridadeRepetida[] } {
  return {
    demais: lista.filter((a) => !a.eleicao),
    eleitos: lista.filter((a) => a.eleicao),
  };
}

/** Texto do link do painel: as demais e, quando há, o contador de eleitos já no Contatos. */
export function textoLinkRepetidas(lista: readonly AutoridadeRepetida[]): string {
  const { demais, eleitos } = separarRepetidas(lista);
  if (eleitos.length === 0) return textoRepetidas(demais.length);
  if (demais.length === 0) return textoEleitosRepetidos(eleitos.length);
  return `${textoRepetidas(demais.length)} · ${textoEleitosRepetidos(eleitos.length)}`;
}
