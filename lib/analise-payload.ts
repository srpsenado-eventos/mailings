import type { BaseEnderecos, CasaLegislativa, CelulaBase, ContatoPlanilha, DeputadoAtual, EleitoPlanilha, EnderecoEstruturado } from "@/lib/types";

/** Corpo JSON do `/api/analise` inválido (estrutura inesperada vinda do cliente). */
export class PayloadInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadInvalidoError";
  }
}

export interface PayloadAnalise {
  arquivoNome: string;
  contatos: ContatoPlanilha[];
  /** Nome da planilha de endereços, quando enviada. */
  arquivoEnderecosNome?: string;
  /** Linhas da planilha de endereços. Ausente = auditoria de endereço não roda. */
  enderecos?: EnderecoEstruturado[];
  /** Planilhas de eleitos (spec 2026-10-05 §2). Ausente = a eleição não roda. */
  eleitos?: EleitoPlanilha[];
  deputadosAtuais?: DeputadoAtual[];
  arquivosEleicao?: string[];
  /** A base de endereços inteira, para o ajuste do Número (spec 2026-10-06, §3). */
  baseEnderecos?: BaseEnderecos;
}

/** Teto defensivo contra abuso/erro — não é o limite real de uso (uma base tem dezenas/centenas). */
const MAX_CONTATOS = 50_000;

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function textoOpcional(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Converte um item desconhecido vindo do JSON em um ContatoPlanilha seguro (sem `any`). */
function narrowContato(v: unknown): ContatoPlanilha {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  return {
    nome: texto(o.nome),
    grupo: texto(o.grupo),
    id: textoOpcional(o.id),
    foto: textoOpcional(o.foto),
    tratamento: textoOpcional(o.tratamento),
    enderecamento: textoOpcional(o.enderecamento),
    telefone: textoOpcional(o.telefone),
    email: textoOpcional(o.email),
    redeSocial: textoOpcional(o.redeSocial),
    endereco: textoOpcional(o.endereco),
    orgao: textoOpcional(o.orgao),
    cargo: textoOpcional(o.cargo),
    departamento: textoOpcional(o.departamento),
  };
}

/** Converte uma linha de endereço vinda do JSON num `EnderecoEstruturado` seguro. */
function narrowEndereco(v: unknown): EnderecoEstruturado {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  return {
    contatoId: texto(o.contatoId),
    enderecoId: textoOpcional(o.enderecoId),
    nome: textoOpcional(o.nome),
    logradouro: textoOpcional(o.logradouro),
    numero: textoOpcional(o.numero),
    complemento: textoOpcional(o.complemento),
    bairro: textoOpcional(o.bairro),
    cidade: textoOpcional(o.cidade),
    uf: textoOpcional(o.uf),
    pais: textoOpcional(o.pais),
    cep: textoOpcional(o.cep),
    prioritario: o.prioritario === true,
  };
}

const CASAS: readonly CasaLegislativa[] = ["senado", "camara"];

function objeto(v: unknown): Record<string, unknown> {
  return (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
}

function narrowEleito(v: unknown): EleitoPlanilha {
  const o = objeto(v);
  const casa = CASAS.find((c) => c === o.casa);
  if (!casa) throw new PayloadInvalidoError("Eleito com casa legislativa inválida.");
  const opcionais = { partido: textoOpcional(o.partido), baseStatus: textoOpcional(o.baseStatus), genero: textoOpcional(o.genero), nascimento: textoOpcional(o.nascimento) };
  return {
    casa, uf: texto(o.uf), nomeUrna: texto(o.nomeUrna), nomeCompleto: texto(o.nomeCompleto),
    situacaoTse: texto(o.situacaoTse), statusMandato: texto(o.statusMandato),
    ...Object.fromEntries(Object.entries(opcionais).filter(([, x]) => x !== undefined)),
  };
}

const CAMPOS_DEPUTADO_OPCIONAIS = ["partido", "sexo", "condicao", "eleicao2026", "email", "predio", "sala", "telefone", "idCamara"] as const;

function narrowDeputado(v: unknown): DeputadoAtual {
  const o = objeto(v);
  const opcionais = Object.fromEntries(
    CAMPOS_DEPUTADO_OPCIONAIS.map((c) => [c, textoOpcional(o[c])] as const).filter(([, x]) => x !== undefined),
  );
  return { uf: texto(o.uf), nomeParlamentar: texto(o.nomeParlamentar), nomeCivil: texto(o.nomeCivil), ...opcionais };
}

function narrowCelulaBase(v: unknown): CelulaBase {
  if (v === null || typeof v === "string" || typeof v === "number") return v;
  throw new PayloadInvalidoError("Base de endereços com célula inválida.");
}

function narrowBaseEnderecos(v: unknown): BaseEnderecos {
  const o = objeto(v);
  if (!Array.isArray(o.cabecalho) || !o.cabecalho.every((c) => typeof c === "string")) {
    throw new PayloadInvalidoError("Base de endereços com cabeçalho inválido.");
  }
  if (!Array.isArray(o.linhas)) throw new PayloadInvalidoError("Base de endereços com linhas inválidas.");
  if (o.linhas.length > MAX_CONTATOS) {
    throw new PayloadInvalidoError(`Base de endereços muito grande (máximo ${MAX_CONTATOS} linhas).`);
  }
  const linhas = o.linhas.map((l): CelulaBase[] => {
    if (!Array.isArray(l)) throw new PayloadInvalidoError("Base de endereços com linha inválida.");
    return l.map(narrowCelulaBase);
  });
  return { cabecalho: [...(o.cabecalho as string[])], linhas };
}

function listaOpcional<T>(valor: unknown, rotulo: string, narrow: (v: unknown) => T): T[] | undefined {
  if (valor === undefined) return undefined;
  if (!Array.isArray(valor)) throw new PayloadInvalidoError(`Lista de ${rotulo} inválida.`);
  if (valor.length > MAX_CONTATOS) throw new PayloadInvalidoError(`Lista de ${rotulo} muito grande (máximo ${MAX_CONTATOS} linhas).`);
  return valor.map(narrow);
}

/**
 * Valida e normaliza o corpo JSON enviado pelo cliente (que faz o parse da planilha no navegador).
 * Lança `PayloadInvalidoError` para qualquer formato inesperado — o route devolve 422 com a mensagem.
 */
export function parsePayloadAnalise(corpo: unknown): PayloadAnalise {
  if (typeof corpo !== "object" || corpo === null) {
    throw new PayloadInvalidoError("Payload ausente ou inválido.");
  }
  const { arquivoNome, contatos } = corpo as Record<string, unknown>;
  if (typeof arquivoNome !== "string" || arquivoNome.length === 0) {
    throw new PayloadInvalidoError("Nome do arquivo ausente.");
  }
  if (!Array.isArray(contatos)) {
    throw new PayloadInvalidoError("Lista de contatos ausente.");
  }
  if (contatos.length > MAX_CONTATOS) {
    throw new PayloadInvalidoError(`Planilha muito grande (máximo ${MAX_CONTATOS} linhas).`);
  }
  const { arquivoEnderecosNome, enderecos } = corpo as Record<string, unknown>;
  if (enderecos !== undefined && !Array.isArray(enderecos)) {
    throw new PayloadInvalidoError("Lista de endereços inválida.");
  }
  if (Array.isArray(enderecos) && enderecos.length > MAX_CONTATOS) {
    throw new PayloadInvalidoError(`Planilha de endereços muito grande (máximo ${MAX_CONTATOS} linhas).`);
  }
  const extra = corpo as Record<string, unknown>;
  const eleitos = listaOpcional(extra.eleitos, "eleitos", narrowEleito);
  const deputadosAtuais = listaOpcional(extra.deputadosAtuais, "deputados atuais", narrowDeputado);
  const arquivosEleicao = Array.isArray(extra.arquivosEleicao)
    ? extra.arquivosEleicao.filter((x): x is string => typeof x === "string" && x.length > 0)
    : undefined;
  const baseEnderecos = extra.baseEnderecos === undefined ? undefined : narrowBaseEnderecos(extra.baseEnderecos);
  return {
    arquivoNome,
    contatos: contatos.map(narrowContato),
    ...(typeof arquivoEnderecosNome === "string" && arquivoEnderecosNome.length > 0
      ? { arquivoEnderecosNome }
      : {}),
    ...(Array.isArray(enderecos) ? { enderecos: enderecos.map(narrowEndereco) } : {}),
    ...(eleitos ? { eleitos } : {}),
    ...(deputadosAtuais ? { deputadosAtuais } : {}),
    ...(arquivosEleicao ? { arquivosEleicao } : {}),
    ...(baseEnderecos ? { baseEnderecos } : {}),
  };
}
