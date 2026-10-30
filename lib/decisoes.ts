import { GRUPO_DEPUTADOS_FEDERAIS } from "@/data/grupos-posse";
import { grupoDoAgrupador } from "@/lib/agrupador";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";

/**
 * Registro das decisões do GT sobre os casos a conferir (spec 2026-10-30 §4.1).
 * Funções puras: recebem o histórico e devolvem um novo; nunca mutam a entrada nem leem arquivo.
 * As datas são `AAAA-MM-DD`, passadas por quem chama.
 */

export type TipoDecisao = "mesma_pessoa" | "pessoas_diferentes" | "nao_recebe_convite" | "ajustar_contatos";
export type SituacaoNoContatos = "tratado" | "pendente" | "reaberto" | "sem_efeito";

export interface RegistroManual {
  tipo: TipoDecisao;
  /** AAAA-MM-DD */
  data: string;
  quem: string;
  observacao: string;
  validacao: "validado" | "a_validar";
  convidaPor?: string;
  outraPessoa?: string[];
  grupos: string[];
}

export interface RegistroColeta {
  tipo: "coleta";
  data: string;
  situacao: SituacaoNoContatos;
  grupos: string[];
}

export type Registro = RegistroManual | RegistroColeta;

export interface CasoDecidido {
  id: string;
  nome: string;
  chaves: string[];
  registros: Registro[];
}

export interface HistoricoDecisoes {
  versao: 1;
  casos: CasoDecidido[];
}

export const HISTORICO_VAZIO: HistoricoDecisoes = Object.freeze({
  versao: 1,
  casos: Object.freeze([]) as unknown as CasoDecidido[],
});

/**
 * Forma equivalente do grupo de uma ocorrência (spec §4.1.1): rótulo do Contatos vira o rótulo
 * oficial do agrupador quando casa; a planilha da Câmara vale como "Deputados Federais"; o eleito
 * vale como o seu grupo de destino.
 */
export function grupoEquivalente(
  grupo: string,
  origem: "contatos" | "camara" | "eleicao",
  grupoDestino?: string,
): string {
  if (origem === "camara") return GRUPO_DEPUTADOS_FEDERAIS;
  const rotulo = origem === "eleicao" ? (grupoDestino ?? grupo) : grupo;
  return grupoDoAgrupador(rotulo)?.rotulo ?? rotulo.trim();
}

function chavesDe(nomes: readonly string[]): string[] {
  return [...new Set(nomes.map(normalizarNome).filter((c) => c.length > 0))];
}

/** Caso que tem alguma das chaves (`normalizarNome`) dos nomes informados. */
export function acharCaso(h: HistoricoDecisoes, nomes: readonly string[]): CasoDecidido | undefined {
  const procuradas = new Set(chavesDe(nomes));
  return h.casos.find((c) => c.chaves.some((ch) => procuradas.has(ch)));
}

function copiarRegistro(r: RegistroManual): RegistroManual {
  return {
    ...r,
    grupos: [...r.grupos],
    ...(r.outraPessoa ? { outraPessoa: [...r.outraPessoa] } : {}),
  };
}

/** Acrescenta o registro ao caso achado por qualquer chave (unindo as chaves) ou cria o caso. */
export function registrar(
  h: HistoricoDecisoes,
  nome: string,
  nomes: readonly string[],
  r: RegistroManual,
): HistoricoDecisoes {
  const novas = chavesDe([nome, ...nomes]);
  const existente = acharCaso(h, [nome, ...nomes]);
  if (!existente) {
    const caso: CasoDecidido = {
      id: normalizarNome(nome),
      nome,
      chaves: novas,
      registros: [copiarRegistro(r)],
    };
    return { versao: 1, casos: [...h.casos, caso] };
  }
  const atualizado: CasoDecidido = {
    ...existente,
    chaves: chavesDe([...existente.chaves, ...novas]),
    registros: [...existente.registros, copiarRegistro(r)],
  };
  return { versao: 1, casos: h.casos.map((c) => (c === existente ? atualizado : c)) };
}

function ehManual(r: Registro): r is RegistroManual {
  return r.tipo !== "coleta";
}

/** Registro manual mais recente pela data; no empate, o último na ordem. */
export function vigente(c: CasoDecidido): RegistroManual | undefined {
  return c.registros.filter(ehManual).reduce<RegistroManual | undefined>(
    (melhor, r) => (melhor === undefined || r.data >= melhor.data ? r : melhor),
    undefined,
  );
}

/** Situação do caso no Contatos (spec §4.1.4); `gruposAtuais` já na forma equivalente. */
export function situacaoDoCaso(c: CasoDecidido, gruposAtuais: readonly string[]): SituacaoNoContatos {
  const decisao = vigente(c);
  if (!decisao) return "sem_efeito";
  const daDecisao = new Set(decisao.grupos.map(normalizarTexto));
  const atuais = gruposAtuais.map(normalizarTexto);
  if (atuais.some((g) => !daDecisao.has(g))) return "reaberto";
  const convite = decisao.convidaPor === undefined ? undefined : normalizarTexto(decisao.convidaPor);
  const soNoConvite = atuais.every((g) => g === convite);
  switch (decisao.tipo) {
    case "mesma_pessoa":
    case "ajustar_contatos":
      return soNoConvite ? "tratado" : "pendente";
    case "nao_recebe_convite":
      return atuais.length === 0 ? "tratado" : "pendente";
    case "pessoas_diferentes":
      return "sem_efeito";
  }
}

function ultimaColetaDepoisDoVigente(c: CasoDecidido, decisao: RegistroManual): RegistroColeta | undefined {
  const posicao = c.registros.indexOf(decisao);
  return c.registros
    .slice(posicao + 1)
    .filter((r): r is RegistroColeta => r.tipo === "coleta")
    .at(-1);
}

/**
 * Acrescenta uma entrada `coleta` a cada caso com decisão vigente cuja situação mudou desde a
 * última coleta posterior à decisão. "Sem efeito" não gera entrada.
 */
export function registrarColetas(
  h: HistoricoDecisoes,
  gruposPorCaso: (c: CasoDecidido) => string[],
  data: string,
): HistoricoDecisoes {
  const casos = h.casos.map((c) => {
    const decisao = vigente(c);
    if (!decisao) return c;
    const grupos = [...gruposPorCaso(c)];
    const situacao = situacaoDoCaso(c, grupos);
    if (situacao === "sem_efeito") return c;
    if (ultimaColetaDepoisDoVigente(c, decisao)?.situacao === situacao) return c;
    const entrada: RegistroColeta = { tipo: "coleta", data, situacao, grupos };
    return { ...c, registros: [...c.registros, entrada] };
  });
  return { versao: 1, casos };
}
