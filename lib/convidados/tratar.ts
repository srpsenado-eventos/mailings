import type { ContatoPlanilha, EnderecoEstruturado } from "@/lib/types";
import { encaixarLogradouroComplemento } from "./abreviacoes";
import { tratarBairro, tratarCidade, tratarUf } from "./bairro-cidade-uf";
import { tratarCep } from "./cep";
import {
  compararEnderecoCadastrado,
  enderecoDaLinha,
  indexarBase,
  referenciaCamaraTse,
  repetidasNaLista,
  situacaoNaBase,
  type IndiceBase,
  type ReferenciasEleicao,
} from "./duplicidade";
import { tratarNome } from "./nome";
import { REVISAO_COMPLEMENTO_REGRA_A, tratarNumero } from "./numero";
import { LIMITES } from "./limites";
import { conferirProtocolo } from "./protocolo";
import {
  CAMPOS_MODELO,
  TEXTO_SITUACAO,
  type Achado,
  type CampoModelo,
  type LinhaLista,
  type LinhaTratada,
  type Marca,
  type Ocorrencia,
  type ResultadoCampo,
  type Revisao,
  type Rodada,
  type Situacao,
  type Valores,
} from "./tipos";

export interface EntradaTratamento {
  linhas: readonly LinhaLista[];
  grupo: string;
  base: readonly ContatoPlanilha[];
  enderecos: readonly EnderecoEstruturado[];
  referencias?: ReferenciasEleicao;
}

const SEPARADOR = " · ";
const CAMPOS_DE_ENDERECO: readonly CampoModelo[] = ["CEP", "LOGRADOURO", "NUMERO", "COMPLEMENTO", "BAIRRO", "CIDADE", "UF"];
const SEM_REFERENCIAS: ReferenciasEleicao = { deputados: [], eleitos: [], governadores: [] };
const MOTIVO_SEM_PROTOCOLO = "Tratamento e Endereçamento são obrigatórios no modelo; linha fora do arquivo até ser preenchida.";

interface RevisaoDeCampo {
  campo: CampoModelo;
  revisao: Revisao;
}

interface Curadoria {
  gravado: Valores;
  regras: string[];
  revisoes: RevisaoDeCampo[];
  trechoQueNaoCoube: string;
}

function campoDaRevisaoDeNumero(texto: string): CampoModelo {
  return texto.startsWith("Complemento") ? "COMPLEMENTO" : "NUMERO";
}

/** A regra A pode deixar o Complemento acima de 30, e o encaixe seguinte pode fazê-lo caber abreviado. */
function complementoCoubeNoEncaixe(revisao: Revisao, encaixe: { complemento: string; trechoQueNaoCoube: string }): boolean {
  if (revisao.texto !== REVISAO_COMPLEMENTO_REGRA_A) return false;
  return encaixe.complemento.length <= (LIMITES.COMPLEMENTO ?? Infinity) && encaixe.trechoQueNaoCoube === "";
}

/** A revisão do encaixe pode juntar avisos do Logradouro e do Complemento com "; ". */
function revisoesDoEncaixe(revisao: Revisao | undefined): RevisaoDeCampo[] {
  if (revisao === undefined) return [];
  return revisao.texto.split("; ").map((texto) => ({
    campo: texto.startsWith("Complemento") ? "COMPLEMENTO" : "LOGRADOURO",
    revisao: { ...revisao, texto },
  }));
}

function curarCampos(recebido: Valores): Curadoria {
  const revisoes: RevisaoDeCampo[] = [];
  const regras: string[] = [];
  const aplicar = (campo: CampoModelo, resultado: ResultadoCampo): string => {
    regras.push(...resultado.regras);
    if (resultado.revisao !== undefined) revisoes.push({ campo, revisao: resultado.revisao });
    return resultado.valor;
  };

  const nome = aplicar("NOME", tratarNome(recebido.NOME));
  const uf = aplicar("UF", tratarUf(recebido.UF));
  const cidade = aplicar("CIDADE", tratarCidade(recebido.CIDADE));
  const cep = aplicar("CEP", tratarCep(recebido.CEP, uf));
  const bairro = aplicar("BAIRRO", tratarBairro(recebido.BAIRRO));

  const numero = tratarNumero({ numero: recebido.NUMERO, logradouro: recebido.LOGRADOURO, complemento: recebido.COMPLEMENTO, uf, cidade });
  regras.push(...numero.regras);
  const encaixe = encaixarLogradouroComplemento(numero.logradouro, numero.complemento);
  if (numero.revisao !== undefined && !complementoCoubeNoEncaixe(numero.revisao, encaixe)) {
    revisoes.push({ campo: campoDaRevisaoDeNumero(numero.revisao.texto), revisao: numero.revisao });
  }
  regras.push(...encaixe.regras);
  revisoes.push(...revisoesDoEncaixe(encaixe.revisao));

  const gravado: Valores = {
    NOME: nome,
    TRATAMENTO: recebido.TRATAMENTO.trim(),
    ENDERECAMENTO: recebido.ENDERECAMENTO.trim(),
    CARGO: recebido.CARGO.trim(),
    CEP: cep,
    LOGRADOURO: encaixe.logradouro,
    NUMERO: numero.numero,
    COMPLEMENTO: encaixe.complemento,
    BAIRRO: bairro,
    CIDADE: cidade,
    UF: uf,
  };
  return { gravado, regras, revisoes, trechoQueNaoCoube: encaixe.trechoQueNaoCoube };
}

function achadoDeRevisao(linha: number, nome: string, recebido: Valores, item: RevisaoDeCampo): Achado | undefined {
  const { campo, revisao } = item;
  if (revisao.marca === "alterado") return undefined;
  return {
    linha, nome, tipo: revisao.marca, campo,
    valorRecebido: recebido[campo], sugestao: revisao.sugestao ?? "", motivo: revisao.texto,
  };
}

function marcasDe(achados: readonly Achado[], revisoes: readonly RevisaoDeCampo[]): Marca[] {
  const marcas = new Set<Marca>(revisoes.map((r) => r.revisao.marca));
  if (achados.some((a) => a.tipo === "revisar")) marcas.add("revisar");
  return [...marcas];
}

function enderecoEmTexto(v: Valores): string {
  const e = enderecoDaLinha(v);
  return [e.logradouro, e.numero, e.complemento, e.bairro, e.cidade, e.uf, e.cep].map((x) => (x ?? "").trim()).filter((x) => x !== "").join(", ");
}

function achadoDeRepetida(linha: number, nome: string, primeira: LinhaTratada, gravado: Valores): Achado {
  const dela = enderecoEmTexto(primeira.gravado);
  const desta = enderecoEmTexto(gravado);
  const complemento = dela === desta ? " Mesmo endereço." : ` Endereços diferem: ${dela}${SEPARADOR}${desta}`;
  const sugestao = primeira.entraNoArquivo
    ? `Só a linha ${primeira.linha} entra no arquivo`
    : `A linha ${primeira.linha} também não entra no arquivo (${textoDaSituacao(primeira)})`;
  return {
    linha, nome, tipo: "repetida", campo: "—", valorRecebido: "",
    sugestao,
    motivo: `Mesmo nome da linha ${primeira.linha}.${complemento}`,
  };
}

function idsDe(ocorrencias: readonly Ocorrencia[]): string {
  return ocorrencias.map((o) => o.id).join(", ");
}

function gruposDe(ocorrencias: readonly Ocorrencia[]): string {
  return [...new Set(ocorrencias.map((o) => o.grupo))].join(SEPARADOR);
}

interface ContextoDuplicidade {
  grupo: string;
  indice: IndiceBase;
  enderecos: readonly EnderecoEstruturado[];
  referencias: ReferenciasEleicao;
}

interface ParteDaBase {
  situacao: Situacao;
  achados: Achado[];
  ocorrencias: Ocorrencia[];
  conferirDuplicidade: Ocorrencia[];
}

function tratarContraABase(linha: number, gravado: Valores, recebido: Valores, ctx: ContextoDuplicidade): ParteDaBase {
  const nome = gravado.NOME;
  const naBase = situacaoNaBase(nome, ctx.grupo, ctx.indice);
  const achados: Achado[] = [];
  const base = (tipo: Achado["tipo"], sugestao: string, motivo: string): Achado => ({
    linha, nome, tipo, campo: "—", valorRecebido: "", sugestao, motivo,
  });

  if (naBase.situacao === "ja_grupo_escolhido") {
    achados.push(base("ja_grupo_escolhido", "Nada a fazer", `Já cadastrado em '${ctx.grupo}' (Id ${idsDe(naBase.ocorrencias)}). Era o esperado.`));
  } else if (naBase.situacao === "ja_outro_grupo") {
    achados.push(base(
      "ja_outro_grupo",
      `Incluir no grupo escolhido dentro do Contatos (Id ${idsDe(naBase.ocorrencias)})`,
      `Cadastrado em '${gruposDe(naBase.ocorrencias)}'. Fora do arquivo de importação.`,
    ));
  }
  if (naBase.conferir.length > 0) {
    achados.push({
      linha, nome, tipo: "conferir_duplicidade", campo: "NOME", valorRecebido: nome,
      sugestao: naBase.conferir.map((o) => `Comparar com Id ${o.id} (${o.grupo})`).join(SEPARADOR),
      motivo: "Nome parcial no Contatos; pode ser a mesma pessoa.",
    });
  }
  const jaCadastrado = naBase.situacao !== "novo";
  const trouxeEndereco = CAMPOS_DE_ENDERECO.some((c) => recebido[c].trim() !== "");
  if (jaCadastrado && trouxeEndereco) {
    const endereco = compararEnderecoCadastrado(linha, nome, gravado, naBase.ocorrencias, ctx.enderecos);
    if (endereco !== undefined) achados.push(endereco);
  }
  return { situacao: naBase.situacao, achados, ocorrencias: naBase.ocorrencias, conferirDuplicidade: naBase.conferir };
}

function achadosSemProtocolo(linha: number, gravado: Valores): Achado[] {
  const vazios: CampoModelo[] = (["TRATAMENTO", "ENDERECAMENTO"] as const).filter((c) => gravado[c] === "");
  return vazios.map((campo) => ({
    linha, nome: gravado.NOME, tipo: "revisar" as const, campo, valorRecebido: "", sugestao: "", motivo: MOTIVO_SEM_PROTOCOLO,
  }));
}

function tratarUma(
  item: LinhaLista,
  repeteDe: LinhaTratada | undefined,
  ctx: ContextoDuplicidade,
): LinhaTratada {
  const recebido = item.valores;
  const { gravado, regras, revisoes, trechoQueNaoCoube } = curarCampos(recebido);
  const nome = gravado.NOME;
  const camposAlterados = CAMPOS_MODELO.filter((c) => gravado[c] !== recebido[c]);

  const achados: Achado[] = [
    ...revisoes.map((r) => achadoDeRevisao(item.linha, nome, recebido, r)).filter((a): a is Achado => a !== undefined),
    ...conferirProtocolo({ linha: item.linha, nome, cargo: gravado.CARGO, tratamento: gravado.TRATAMENTO, enderecamento: gravado.ENDERECAMENTO }),
  ];
  const parcial = {
    linha: item.linha, recebido, gravado, camposAlterados, regras, trechoQueNaoCoube,
    referencia: referenciaCamaraTse(nome, ctx.referencias),
  };

  if (repeteDe !== undefined) {
    const todos = [...achados, achadoDeRepetida(item.linha, nome, repeteDe, gravado)];
    return {
      ...parcial, referencia: "", situacao: "repetida", achados: todos, marcas: marcasDe(todos, revisoes),
      ocorrencias: [], conferirDuplicidade: [], repeteLinha: repeteDe.linha, entraNoArquivo: false,
    };
  }

  const naBase = tratarContraABase(item.linha, gravado, recebido, ctx);
  const faltaProtocolo = naBase.situacao === "novo" ? achadosSemProtocolo(item.linha, gravado) : [];
  // Campo vazio já tem o achado de sem_protocolo; o da tabela no mesmo campo seria repetido.
  const camposVazios = new Set(faltaProtocolo.map((a) => a.campo));
  const semRepetirCampo = achados.filter((a) => !(camposVazios.has(a.campo) && a.valorRecebido === ""));
  const todos = [...semRepetirCampo, ...naBase.achados, ...faltaProtocolo];
  const situacao: Situacao = faltaProtocolo.length > 0 ? "sem_protocolo" : naBase.situacao;
  return {
    ...parcial, situacao, achados: todos, marcas: marcasDe(todos, revisoes),
    ocorrencias: naBase.ocorrencias, conferirDuplicidade: naBase.conferirDuplicidade, entraNoArquivo: situacao === "novo",
  };
}

function contar(linhas: readonly LinhaTratada[]): Rodada["contagens"] {
  const quantas = (situacao: Situacao): number => linhas.filter((l) => l.situacao === situacao).length;
  const novos = linhas.filter((l) => l.situacao === "novo");
  return {
    linhas: linhas.length,
    novos: novos.length,
    novosAlterados: novos.filter((l) => l.camposAlterados.length > 0).length,
    novosValidar: novos.filter((l) => l.marcas.includes("validar")).length,
    novosRevisar: novos.filter((l) => l.marcas.includes("revisar")).length,
    jaGrupoEscolhido: quantas("ja_grupo_escolhido"),
    jaOutroGrupo: quantas("ja_outro_grupo"),
    repetidas: quantas("repetida"),
    semProtocolo: quantas("sem_protocolo"),
    enderecoNovo: linhas.flatMap((l) => l.achados).filter((a) => a.tipo === "endereco_novo").length,
  };
}

export function tratarLista(entrada: EntradaTratamento): Rodada {
  const ctx: ContextoDuplicidade = {
    grupo: entrada.grupo,
    indice: indexarBase(entrada.base),
    enderecos: entrada.enderecos,
    referencias: entrada.referencias ?? SEM_REFERENCIAS,
  };
  const primeiras = repetidasNaLista(entrada.linhas.map((l) => l.valores.NOME));
  const linhas: LinhaTratada[] = [];
  entrada.linhas.forEach((item, i) => {
    const indicePrimeira = primeiras[i];
    const repeteDe = indicePrimeira === undefined ? undefined : linhas[indicePrimeira];
    linhas.push(tratarUma(item, repeteDe, ctx));
  });
  return { grupo: entrada.grupo, linhas, contagens: contar(linhas) };
}

export function textoDaSituacao(l: LinhaTratada): string {
  const base = TEXTO_SITUACAO[l.situacao];
  if (l.situacao !== "novo") return base;
  if (l.marcas.includes("revisar")) return `${base} (REVISAR)`;
  if (l.marcas.includes("validar")) return `${base} (VALIDAR)`;
  return base;
}
