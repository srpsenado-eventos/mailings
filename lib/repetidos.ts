import { NIVEIS_ELEITOS, PRECEDENCIA, type NivelPrecedencia, type RegraPrecedencia } from "@/data/precedencia";
import { casaSegmento, segmentarGrupo } from "@/lib/catalogo";
import {
  acharCaso, grupoEquivalente, situacaoDoCaso, vigente,
  type CasoDecidido, type HistoricoDecisoes, type RegistroManual, type SituacaoNoContatos, type TipoDecisao,
} from "@/lib/decisoes";
import { gruposAtuaisDoCaso } from "@/lib/decisoes-coleta";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import type { Etiqueta } from "@/lib/painel";
import { NOME_GRUPO_DEPUTADOS, temGrupoDeputados } from "@/lib/painel-deputados";
import type {
  ContatoDoEleito, DestinoEleito, DestinoGoverno, ResultadoContato, ResultadoEleicao, ResultadoGrupo,
} from "@/lib/types";

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
function escolherComEleito(ocorrencias: readonly OcorrenciaRepetida[]): Escolha {
  const atuais = ocorrencias.filter((o) => o.origem !== "eleicao" && !o.ex);
  if (atuais.length === 0) return { situacao: "conferir", motivo: MOTIVO_ELEITO_SEM_CARGO_ATUAL };
  const escolha = escolherGrupo(atuais, false);
  return escolha.situacao === "decidido" ? { ...escolha, motivo: MOTIVO_ELEICAO } : escolha;
}

interface Entrada {
  nome: string;
  ocorrencia: OcorrenciaRepetida;
  /** Nomes da pessoa da Câmara (parlamentar e civil), já normalizados. */
  nomes?: readonly string[];
}

/** Uma pessoa das listas de fora do Contatos, com os dois nomes dela. */
export interface PessoaDeFora {
  nomes: string[];
  /** `nomes` normalizados, sem repetição nem vazios (calculados uma vez só). */
  nomesNormalizados: string[];
  ocorrencia: OcorrenciaRepetida;
}

const NIVEL_DEPUTADOS = PRECEDENCIA.find((r) => r.grupo === NOME_GRUPO_DEPUTADOS)?.nivel;

function pessoaDeFora(
  nomes: readonly string[], grupoDaLista: string, cargo: string, origem: OrigemOcorrencia, nivel: NivelPrecedencia | undefined,
): PessoaDeFora[] {
  const normalizados = nomes.map(normalizarNome);
  const chave = normalizados.find(Boolean);
  if (!chave) return [];
  const nomesNormalizados = [...new Set(normalizados.filter(Boolean))];
  return [{
    nomes: [...nomes],
    nomesNormalizados,
    ocorrencia: {
      grupo: grupoDaLista, grupoRegra: grupoDaLista, chave, cargo,
      ...(nivel ? { nivel } : {}),
      ex: false, possivelSaida: false, origem,
    },
  }];
}

/**
 * Deputados atuais da planilha da Câmara (spec 2026-10-27 §4.2), só enquanto o grupo não existe
 * no Contatos. Casam com o Contatos pelo nome, exato ou parcial.
 */
export function ocorrenciasDeFora(eleicao: ResultadoEleicao | undefined): PessoaDeFora[] {
  if (!eleicao || !temGrupoDeputados(eleicao)) return [];
  return (eleicao.deputadosAtuais ?? []).flatMap((d) =>
    pessoaDeFora([d.nomeParlamentar, d.nomeCivil], NOME_GRUPO_DEPUTADOS, "Deputado Federal", "camara", NIVEL_DEPUTADOS));
}

/** Eleito de 2026 já ligado pelo eixo da Eleição a linhas do Contatos (spec 2026-10-28 §8). */
export interface EleitoLigado {
  ocorrencia: OcorrenciaRepetida;
  contatos: readonly ContatoDoEleito[];
  /** Destino que o eixo da Eleição deu ao eleito. */
  destino: DestinoEleito | DestinoGoverno;
  motivo?: string;
}

const MOTIVO_ELEICAO_SEM_MOTIVO = "Eleição 2026: conferir no eixo da eleição";
export const MOTIVO_ELEICAO_NOVO = "Eleição 2026: mandato novo de quem já está no Contatos";

function eleitoLigado(
  nomes: readonly string[], contatos: readonly ContatoDoEleito[], destino: DestinoEleito | DestinoGoverno, motivo: string | undefined,
  grupoDaLista: string, cargo: string, nivel: NivelPrecedencia | undefined, grupoDestino: string | undefined,
): EleitoLigado[] {
  if (contatos.length === 0) return [];
  const [pessoa] = pessoaDeFora(nomes, grupoDaLista, cargo, "eleicao", nivel);
  if (!pessoa) return [];
  const ocorrencia = grupoDestino?.trim()
    ? { ...pessoa.ocorrencia, grupoEquivalente: grupoEquivalente(grupoDaLista, "eleicao", grupoDestino) }
    : pessoa.ocorrencia;
  return [{ ocorrencia, contatos, destino, ...(motivo ? { motivo } : {}) }];
}

/**
 * Eleitos de 2026 (Senado, Câmara, governos) com ligação a linhas do Contatos. O eleito nunca casa por
 * nome: sem ligação, não entra.
 */
export function eleitosLigados(eleicao: ResultadoEleicao | undefined): EleitoLigado[] {
  if (!eleicao) return [];
  const parlamentares = eleicao.eleitos.flatMap(({ eleito, contatos, destino, motivo, grupoDestino }) =>
    eleito.casa === "senado"
      ? eleitoLigado([eleito.nomeUrna, eleito.nomeCompleto], contatos, destino, motivo, "Senadores Eleitos", "Senador eleito", NIVEIS_ELEITOS.senado, grupoDestino)
      : eleitoLigado([eleito.nomeUrna, eleito.nomeCompleto], contatos, destino, motivo, "Deputados Federais Eleitos", "Deputado federal eleito", NIVEIS_ELEITOS.camara, grupoDestino));
  const governadores = (eleicao.governadores?.eleitos ?? []).flatMap(({ eleito, contatos, destino, motivo, grupoDestino }) =>
    eleitoLigado(
      [eleito.nomeUrna, eleito.nomeCompleto], contatos, destino, motivo, "Governadores Eleitos", "Governador eleito",
      eleito.uf.trim().toUpperCase() === "DF" ? NIVEIS_ELEITOS.governadorDistritoFederal : NIVEIS_ELEITOS.governador, grupoDestino,
    ));
  return [...parlamentares, ...governadores];
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

/**
 * Junta as chaves de nome parcial (uma contida na outra) que estão em grupos diferentes.
 * Chave só de fora do Contatos se liga apenas a chaves do Contatos, por qualquer dos nomes
 * da pessoa; duas chaves de fora nunca se ligam entre si.
 */
function componentesDeNome(porChave: ReadonlyMap<string, Entrada[]>, doContatos: ReadonlySet<string>): string[][] {
  const chaves = [...porChave.keys()];
  const pai = new Map(chaves.map((k) => [k, k]));
  const raiz = (k: string): string => (pai.get(k) === k ? k : raiz(pai.get(k) as string));
  // Pré-cálculo por chave (uma vez só): palavras de cada nome e grupos. Na chave do Contatos só contam
  // os grupos do Contatos: a pessoa da Câmara casada exata não liga dois nomes do mesmo grupo.
  const perfil = new Map(chaves.map((k) => {
    const entradas = porChave.get(k) ?? [];
    const nomes = doContatos.has(k) ? [k] : [...new Set(entradas.flatMap((e) => e.nomes ?? [k]))];
    const grupos = new Set(entradas
      .filter((e) => !doContatos.has(k) || e.ocorrencia.origem === "contatos")
      .map((e) => e.ocorrencia.grupoRegra));
    return [k, { palavras: nomes.map(palavrasDoNome), grupos }] as const;
  }));
  const gruposDistintos = (x: ReadonlySet<string>, y: ReadonlySet<string>): boolean => {
    const juntos = new Set(x);
    for (const g of y) juntos.add(g);
    return juntos.size >= 2;
  };
  const parcialEntrePerfis = (x: readonly string[][], y: readonly string[][]): boolean =>
    x.some((pa) => y.some((pb) => contido(pa, pb) || contido(pb, pa)));
  // Nome parcial exige palavra em comum: só as chaves que dividem alguma palavra são comparadas.
  const porPalavra = new Map<string, number[]>();
  chaves.forEach((k, i) => {
    for (const palavra of new Set((perfil.get(k)?.palavras ?? []).flat())) {
      const indices = porPalavra.get(palavra);
      if (indices) indices.push(i); else porPalavra.set(palavra, [i]);
    }
  });
  chaves.forEach((a, i) => {
    const pa = perfil.get(a);
    if (!pa) return;
    const candidatas = new Set(pa.palavras.flat().flatMap((palavra) => porPalavra.get(palavra) ?? []));
    for (const j of candidatas) {
      const [b, pb] = [chaves[j], perfil.get(chaves[j])];
      if (j <= i || !pb) continue;
      if (!doContatos.has(a) && !doContatos.has(b)) continue;
      if (!parcialEntrePerfis(pa.palavras, pb.palavras)) continue;
      if (!gruposDistintos(pa.grupos, pb.grupos)) continue;
      pai.set(raiz(a), raiz(b));
    }
  });
  const porRaiz = new Map<string, string[]>();
  for (const k of chaves) {
    const membros = porRaiz.get(raiz(k));
    if (membros) membros.push(k); else porRaiz.set(raiz(k), [k]);
  }
  return [...porRaiz.values()];
}

/**
 * Entrada da pessoa de fora. Casa exata com o Contatos quando qualquer dos nomes é igual a uma
 * chave do Contatos (fica sob essa chave); senão, fica sob a própria chave e só se liga por nome parcial.
 */
function entradaDeFora(p: PessoaDeFora, doContatos: ReadonlySet<string>): { chave: string; entrada: Entrada } | undefined {
  const nomes = p.nomesNormalizados;
  if (nomes.length === 0) return undefined;
  const exata = nomes.find((n) => doContatos.has(n));
  return { chave: exata ?? p.ocorrencia.chave, entrada: { nome: p.nomes.find((n) => n.trim()) ?? p.nomes[0], ocorrencia: p.ocorrencia, nomes } };
}

/** Um caso em formação: chaves de nome ligadas, se há nome parcial entre elas, e os eleitos ligados pelo eixo. */
interface Componente {
  chaves: string[];
  parcial: boolean;
  eleitos: EleitoLigado[];
}

/** Eleito cujo destino o eixo da Eleição deixou para o GT decidir: o app não decide no lugar dele. */
function motivoDoEixo(eleitos: readonly EleitoLigado[]): string | undefined {
  const pendente = eleitos.find((e) => e.destino === "conferir" || e.destino === "novo");
  if (!pendente) return undefined;
  if (pendente.destino === "novo") return MOTIVO_ELEICAO_NOVO;
  return pendente.motivo ? `Eleição 2026: ${pendente.motivo}` : MOTIVO_ELEICAO_SEM_MOTIVO;
}

/** Uma ocorrência por grupo, regra, nome e origem. */
function semRepeticao(ocorrencias: readonly OcorrenciaRepetida[]): OcorrenciaRepetida[] {
  return ocorrencias.filter((o, i, todas) => todas.findIndex((x) =>
    x.grupo === o.grupo && x.grupoRegra === o.grupoRegra && x.chave === o.chave && x.origem === o.origem) === i);
}

function autoridadeDoComponente(c: Componente, porChave: ReadonlyMap<string, Entrada[]>): AutoridadeRepetida[] {
  const doComponente = c.chaves.flatMap((k) => porChave.get(k) ?? []);
  const doCadastro = doComponente.find((e) => e.ocorrencia.origem === "contatos");
  if (!doCadastro) return [];
  const ocorrencias = semRepeticao([...doComponente.map((e) => e.ocorrencia), ...c.eleitos.map((e) => e.ocorrencia)]);
  if (new Set(ocorrencias.map((o) => o.grupoRegra)).size < 2) return [];
  const nome = doCadastro.nome;
  if (c.eleitos.length === 0) return [{ nome, ocorrencias, ...escolherGrupo(ocorrencias, c.parcial) }];
  const doEixo = motivoDoEixo(c.eleitos);
  if (doEixo) {
    const motivo = c.parcial ? `${doEixo} · ${MOTIVO_PARCIAL}` : doEixo;
    return [{ nome, ocorrencias, situacao: "conferir", motivo, eleicao: true }];
  }
  const escolha = c.parcial ? escolherGrupo(ocorrencias, true) : escolherComEleito(ocorrencias);
  return [{ nome, ocorrencias, ...escolha, eleicao: true }];
}

/**
 * Liga cada eleito (pela ligação do eixo da Eleição 2026, nunca pelo nome) ao caso da pessoa do Contatos
 * que ele aponta. Várias linhas com o mesmo nome (Senadores e Presidente do Senado) ficam no mesmo caso.
 * Eleito ligado a nomes distintos é ambíguo (o painel da Eleição já mostra) e não entra; ligação a linha
 * que não é ocorrência do cálculo (grupo de eleitos, PILOTO, grupo fora da Nominata) não conta, e sem
 * nenhuma ligação o eleito também não entra.
 */
function ligarEleitos(
  componentes: readonly string[][], eleitos: readonly EleitoLigado[], porChave: ReadonlyMap<string, Entrada[]>,
): Componente[] {
  const indiceDaChave = new Map(componentes.flatMap((chaves, i) => chaves.map((k) => [k, i] as const)));
  const casoDoEleito = (e: EleitoLigado): number | undefined => {
    const chaves = new Set(e.contatos.map((l) => normalizarNome(l.nome)));
    if (chaves.size !== 1) return undefined;
    const [chave] = chaves;
    const naLinha = e.contatos.some((l) => (porChave.get(chave) ?? [])
      .some((x) => x.ocorrencia.origem === "contatos" && x.ocorrencia.grupo === l.grupo));
    return naLinha ? indiceDaChave.get(chave) : undefined;
  };
  const eleitosDoCaso = new Map<number, EleitoLigado[]>();
  for (const e of eleitos) {
    const caso = casoDoEleito(e);
    if (caso !== undefined) eleitosDoCaso.set(caso, [...(eleitosDoCaso.get(caso) ?? []), e]);
  }
  return componentes.map((chaves, i) => ({
    chaves: [...chaves], parcial: chaves.length > 1, eleitos: eleitosDoCaso.get(i) ?? [],
  }));
}

/** `AAAA-MM-DD` → `DD/MM`. */
export function diaMesDaDecisao(data: string): string {
  const [, mes, dia] = data.split("-");
  return mes && dia ? `${dia}/${mes}` : data;
}

/** Forma equivalente do grupo da ocorrência (spec 2026-10-30 §4.1.1). */
export function equivalenteDaOcorrencia(o: OcorrenciaRepetida): string {
  return o.grupoEquivalente ?? grupoEquivalente(o.grupo, o.origem);
}

const mesmoGrupo = (a: string, b: string): boolean => normalizarTexto(a) === normalizarTexto(b);

export const MOTIVO_PESSOA_NAO_ENCONTRADA = "Pessoa não encontrada no Contatos";

/** Motivo do caso reaberto (spec 2026-10-30 §4.1.4). */
export function textoReaberto(data: string): string {
  return `grupo novo desde a decisão de ${diaMesDaDecisao(data)}`;
}

const TEXTO_TIPO: Record<TipoDecisao, string> = {
  mesma_pessoa: "Mesma pessoa",
  pessoas_diferentes: "Pessoas diferentes",
  nao_recebe_convite: "Não recebe convite",
  ajustar_contatos: "Ajustar no Contatos",
};

/** Decisão vigente em texto: tipo, grupo do convite e quem decidiu. */
export function textoDecisao(d: RegistroManual): string {
  const convite = d.convidaPor?.trim() ? `: convidar pelo grupo ${d.convidaPor.trim()}` : "";
  return `${TEXTO_TIPO[d.tipo] ?? d.tipo}${convite} (${d.quem})`;
}

function motivoDaDecisao(d: RegistroManual): string {
  const observacao = d.observacao.trim() ? ` · ${d.observacao.trim()}` : "";
  return `Decisão do GT de ${diaMesDaDecisao(d.data)}: ${textoDecisao(d)}${observacao}`;
}

/** Caso do histórico com a mesma identidade da autoridade: nomes das ocorrências e grupos equivalentes. */
function casoDaAutoridade(h: HistoricoDecisoes, a: AutoridadeRepetida): CasoDecidido | undefined {
  const nomes = [a.nome, ...a.ocorrencias.map((o) => o.chave)];
  const grupos = [...new Set(a.ocorrencias.map(equivalenteDaOcorrencia))];
  return acharCaso(h, nomes, grupos);
}

/** Ocorrência do Contatos que convida, quando o grupo decidido está entre as da autoridade. */
function ocorrenciaDoConvite(ocorrencias: readonly OcorrenciaRepetida[], convite: string): OcorrenciaRepetida | undefined {
  const casam = ocorrencias.filter((o) => mesmoGrupo(equivalenteDaOcorrencia(o), convite));
  return casam.find((o) => o.origem === "contatos") ?? casam[0];
}

/**
 * Aplica a decisão vigente do caso (spec 2026-10-30 §4.1.3): a situação no Contatos é calculada ao
 * vivo com os grupos do retrato; caso reaberto volta para conferir.
 */
function comDecisao(
  a: AutoridadeRepetida, caso: CasoDecidido, grupos: readonly ResultadoGrupo[], eleicao: ResultadoEleicao | undefined,
): AutoridadeRepetida {
  const decisao = vigente(caso);
  if (!decisao) return a;
  const noContatos = situacaoDoCaso(caso, gruposAtuaisDoCaso(caso, grupos, eleicao));
  const base = { nome: a.nome, ocorrencias: a.ocorrencias, ...(a.eleicao ? { eleicao: true as const } : {}), caso, decisao, noContatos };
  if (noContatos === "reaberto") return { ...base, situacao: "conferir", motivo: textoReaberto(decisao.data) };
  const convite = decisao.convidaPor?.trim();
  const convidaPor = convite ? ocorrenciaDoConvite(a.ocorrencias, convite) : undefined;
  return {
    ...base,
    situacao: noContatos === "tratado" ? "tratado" : "decidido_gt",
    ...(convidaPor ? { convidaPor } : {}),
    motivo: motivoDaDecisao(decisao),
  };
}

/** Linhas do grupo com a pessoa do caso: pela regra da Nominata, ou pelo próprio rótulo quando fora dela. */
function entradasDaPessoa(g: ResultadoGrupo, chaves: ReadonlySet<string>): Entrada[] {
  const pelaRegra = entradasDoGrupo(g).filter((e) => chaves.has(e.ocorrencia.chave));
  if (pelaRegra.length > 0) return pelaRegra;
  return g.contatos
    .filter((c) => chaves.has(normalizarNome(c.contato.nome)))
    .map((c) => ({
      nome: c.contato.nome,
      ocorrencia: {
        grupo: g.grupo, grupoRegra: g.grupo, chave: normalizarNome(c.contato.nome), cargo: c.contato.cargo ?? "",
        ex: false, possivelSaida: Boolean(c.possivelSaida), origem: "contatos" as const,
      },
    }));
}

/**
 * Caso decidido cuja pessoa já não aparece repetida (Nunes Marques, só no TSE): procura a pessoa nos
 * grupos do retrato pelas chaves do caso, sem os grupos marcados como outra pessoa.
 */
function autoridadeForaDoCalculo(
  caso: CasoDecidido, grupos: readonly ResultadoGrupo[], eleicao: ResultadoEleicao | undefined,
): AutoridadeRepetida[] {
  const decisao = vigente(caso);
  if (!decisao) return [];
  const chaves = new Set(caso.chaves);
  const outraPessoa = new Set((decisao.outraPessoa ?? []).map((g) => normalizarTexto(grupoEquivalente(g, "contatos"))));
  const entradas = grupos
    .filter((g) => !outraPessoa.has(normalizarTexto(grupoEquivalente(g.grupo, "contatos"))))
    .flatMap((g) => entradasDaPessoa(g, chaves));
  const ocorrencias = semRepeticao(entradas.map((e) => e.ocorrencia));
  const nome = entradas[0]?.nome ?? caso.nome;
  if (ocorrencias.length > 0) return [comDecisao({ nome, ocorrencias, situacao: "decidido_gt", motivo: "" }, caso, grupos, eleicao)];
  const naoRecebe = decisao.tipo === "nao_recebe_convite";
  return [{
    nome, ocorrencias, caso, decisao,
    noContatos: situacaoDoCaso(caso, gruposAtuaisDoCaso(caso, grupos, eleicao)),
    situacao: naoRecebe ? "tratado" : "decidido_gt",
    motivo: naoRecebe ? motivoDaDecisao(decisao) : MOTIVO_PESSOA_NAO_ENCONTRADA,
  }];
}

/**
 * Cada autoridade com o caso do histórico que casa com ela; depois, os casos decididos que não casaram
 * nenhuma e cuja pessoa (pelas chaves) não está em nenhuma autoridade da lista.
 */
function aplicarDecisoes(
  lista: readonly AutoridadeRepetida[], h: HistoricoDecisoes, grupos: readonly ResultadoGrupo[], eleicao: ResultadoEleicao | undefined,
): AutoridadeRepetida[] {
  const usados = new Set<CasoDecidido>();
  const decididas = lista.map((a) => {
    const caso = casoDaAutoridade(h, a);
    if (!caso || !vigente(caso)) return a;
    usados.add(caso);
    return comDecisao(a, caso, grupos, eleicao);
  });
  const chavesDaLista = new Set(lista.flatMap((a) => a.ocorrencias.filter((o) => o.origem === "contatos").map((o) => o.chave)));
  const foraDoCalculo = h.casos
    .filter((c) => !usados.has(c) && !c.chaves.some((k) => chavesDaLista.has(k)))
    .flatMap((c) => autoridadeForaDoCalculo(c, grupos, eleicao));
  return [...decididas, ...foraDoCalculo];
}

const ORDEM_SITUACAO: Record<SituacaoRepetida, number> = { conferir: 0, decidido: 1, decidido_gt: 2, tratado: 3 };

/**
 * Autoridades em dois ou mais grupos do retrato, com o grupo do convite. "Conferir" primeiro.
 * Com `eleicao`, entram também os deputados atuais da planilha da Câmara (pelo nome) e os eleitos de
 * 2026 (pela ligação do eixo da Eleição, spec 2026-10-28 §8); só conta quem tem ocorrência no Contatos.
 * Com `decisoes`, a decisão vigente do GT vale sobre a regra (spec 2026-10-30 §4.1.3), e os casos
 * decididos cuja pessoa já não está repetida entram também.
 */
export function autoridadesRepetidas(
  grupos: readonly ResultadoGrupo[], eleicao?: ResultadoEleicao, decisoes?: HistoricoDecisoes,
): AutoridadeRepetida[] {
  const porChave = new Map<string, Entrada[]>();
  const juntar = (chave: string, e: Entrada) => porChave.set(chave, [...(porChave.get(chave) ?? []), e]);
  for (const e of grupos.flatMap(entradasDoGrupo)) juntar(e.ocorrencia.chave, e);
  const doContatos = new Set(porChave.keys());
  for (const p of ocorrenciasDeFora(eleicao)) {
    const fora = entradaDeFora(p, doContatos);
    if (fora) juntar(fora.chave, fora.entrada);
  }

  const casos = ligarEleitos(componentesDeNome(porChave, doContatos), eleitosLigados(eleicao), porChave);
  const pelaRegra = casos.flatMap((c) => autoridadeDoComponente(c, porChave));
  const lista = decisoes ? aplicarDecisoes(pelaRegra, decisoes, grupos, eleicao) : pelaRegra;

  return lista.sort((a, b) =>
    a.situacao !== b.situacao ? ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao] : a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** Etiqueta da linha no painel e se a linha fica fosca (atenuada, fora das pendências). */
export interface MarcaDeRepeticao {
  etiqueta: Etiqueta;
  fosca: boolean;
}

/** Etiqueta pela regra da Nominata (sem decisão do GT, ou caso reaberto). */
function etiquetaDaRegra(a: AutoridadeRepetida, grupo: string): Etiqueta | undefined {
  const convidaPor = a.convidaPor;
  if (a.situacao === "conferir" || !convidaPor) {
    return { campo: "grupo", tom: "atencao", texto: "Em mais de um grupo: conferir", explicacao: a.motivo };
  }
  // Eleito decidido: a linha do grupo que convida já tem a etiqueta da Eleição 2026; as outras seguem a regra normal.
  if (a.eleicao && convidaPor.origem === "contatos" && convidaPor.grupo === grupo) return undefined;
  if (convidaPor.origem === "contatos" && convidaPor.grupo === grupo) {
    const outros = [...new Set(a.ocorrencias.filter((o) => o.grupoRegra !== convidaPor.grupoRegra).map((o) => o.grupoRegra))].join(", ");
    return { campo: "grupo", tom: "neutro", texto: `Convidada por este grupo; também em ${outros}`, explicacao: a.motivo };
  }
  return { campo: "grupo", tom: "ruim", texto: `Autoridade a ser convidada pelo grupo ${convidaPor.grupoRegra}`, explicacao: a.motivo };
}

/**
 * Marca pela decisão vigente do GT (spec 2026-10-30 §4.1.3). A linha fosca leva etiqueta neutra: não
 * conta como pendência. Nunca fosca no grupo que convida nem em `ajustar_contatos`.
 */
function marcaDaDecisao(a: AutoridadeRepetida, d: RegistroManual, grupo: string): MarcaDeRepeticao | undefined {
  const dia = diaMesDaDecisao(d.data);
  const daLinha = grupoEquivalente(grupo, "contatos");
  if ((d.outraPessoa ?? []).some((g) => mesmoGrupo(grupoEquivalente(g, "contatos"), daLinha))) return undefined;
  const marca = (tom: Etiqueta["tom"], texto: string, fosca: boolean): MarcaDeRepeticao =>
    ({ etiqueta: { campo: "grupo", tom, texto, explicacao: a.motivo }, fosca });
  switch (d.tipo) {
    case "mesma_pessoa": {
      const convite = d.convidaPor?.trim();
      if (!convite) return undefined;
      if (!mesmoGrupo(daLinha, convite)) return marca("neutro", `Será convidada pelo grupo ${convite} (decisão do GT de ${dia})`, true);
      const outros = [...new Set(a.ocorrencias
        .filter((o) => !mesmoGrupo(equivalenteDaOcorrencia(o), convite))
        .map((o) => o.grupoRegra))].join(", ");
      const tambem = outros ? `; também em ${outros}` : "";
      return marca("neutro", `Convidada por este grupo${tambem} (decisão do GT de ${dia})`, false);
    }
    case "nao_recebe_convite":
      return marca("neutro", `Não recebe convite (decisão do GT de ${dia})`, true);
    case "ajustar_contatos":
      return a.situacao === "tratado" ? undefined : marca("atencao", `Ajustar no Contatos (decisão de ${dia})`, false);
    default:
      return undefined;
  }
}

/** Etiqueta da linha do contato no painel; fora de `etiquetasDoContato`, não pinta a situação. */
export function etiquetaDeRepeticao(
  repetidas: readonly AutoridadeRepetida[],
  c: ResultadoContato,
  grupo: string,
): MarcaDeRepeticao | undefined {
  const chave = normalizarNome(c.contato.nome);
  const a = repetidas.find((r) => r.ocorrencias.some((o) => o.origem === "contatos" && o.grupo === grupo && o.chave === chave));
  if (!a) return undefined;
  if (a.decisao && a.situacao !== "conferir") return marcaDaDecisao(a, a.decisao, grupo);
  const etiqueta = etiquetaDaRegra(a, grupo);
  return etiqueta ? { etiqueta, fosca: false } : undefined;
}

export type FiltroRepetidas = "todas" | "conferir" | "decidido" | "decidido_gt" | "tratado";

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
