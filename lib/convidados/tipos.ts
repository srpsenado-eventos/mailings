import type { OrigemLista } from "./lista";
export const CAMPOS_MODELO = [
  "NOME", "TRATAMENTO", "ENDERECAMENTO", "CARGO", "CEP", "LOGRADOURO", "NUMERO", "COMPLEMENTO", "BAIRRO", "CIDADE", "UF",
] as const;
export type CampoModelo = (typeof CAMPOS_MODELO)[number];

export const CABECALHO_PRODASEN = [...CAMPOS_MODELO, "FOTO", "SITE_OFICIAL"] as const;

export type Valores = Record<CampoModelo, string>;

/** `linha` é a linha da planilha (1-based); `orgao` é lido e nunca usado nas saídas. */
export interface LinhaLista {
  linha: number;
  valores: Valores;
  orgao: string;
}

export type Marca = "alterado" | "validar" | "revisar";

export interface Revisao {
  marca: Marca;
  texto: string;
  sugestao?: string;
}

export interface ResultadoCampo {
  valor: string;
  regras: string[];
  revisao?: Revisao;
}

export type Situacao = "novo" | "ja_grupo_escolhido" | "ja_outro_grupo" | "repetida" | "sem_protocolo";

export const TEXTO_SITUACAO: Readonly<Record<Situacao, string>> = {
  novo: "Novo: importar",
  ja_grupo_escolhido: "Já no Contatos: no grupo escolhido",
  ja_outro_grupo: "Já no Contatos: incluir no grupo",
  repetida: "Repetida na própria lista",
  sem_protocolo: "Fora do arquivo: Tratamento ou Endereçamento vazio",
};

export type TipoAchado =
  | "validar"
  | "revisar"
  | "ja_outro_grupo"
  | "ja_grupo_escolhido"
  | "endereco_novo"
  | "endereco_diferente"
  | "repetida"
  | "conferir_duplicidade";

export const TEXTO_TIPO_ACHADO: Readonly<Record<TipoAchado, string>> = {
  validar: "Validar",
  revisar: "Revisar",
  ja_outro_grupo: "Já no Contatos: outro grupo",
  ja_grupo_escolhido: "Já no Contatos: grupo escolhido",
  endereco_novo: "Endereço novo para contato já cadastrado",
  endereco_diferente: "Endereço diferente do cadastrado",
  repetida: "Repetida na lista",
  conferir_duplicidade: "Conferir duplicidade",
};

export interface Achado {
  linha: number;
  nome: string;
  tipo: TipoAchado;
  campo: CampoModelo | "—";
  valorRecebido: string;
  sugestao: string;
  motivo: string;
}

export interface Ocorrencia {
  id: string;
  grupo: string;
}

export interface LinhaTratada {
  linha: number;
  situacao: Situacao;
  recebido: Valores;
  gravado: Valores;
  camposAlterados: CampoModelo[];
  regras: string[];
  marcas: Marca[];
  achados: Achado[];
  trechoQueNaoCoube: string;
  ocorrencias: Ocorrencia[];
  conferirDuplicidade: Ocorrencia[];
  referencia: string;
  repeteLinha?: number;
  entraNoArquivo: boolean;
}

export interface Rodada {
  grupo: string;
  linhas: LinhaTratada[];
  contagens: {
    linhas: number;
    novos: number;
    novosAlterados: number;
    novosValidar: number;
    novosRevisar: number;
    jaGrupoEscolhido: number;
    jaOutroGrupo: number;
    repetidas: number;
    semProtocolo: number;
    enderecoNovo: number;
  };
}

/** `geradoEm` já formatado "DD/MM/AAAA HH:MM"; `comando` é o texto do comando ou "tela"; `origem` e `aba` dizem de onde a lista foi lida. */
export interface MetaRodada {
  listaNome: string;
  primeiraLinha: number;
  ultimaLinha: number;
  baseNome: string;
  enderecosNome: string;
  referencias: string[];
  geradoEm: string;
  comando: string;
  origem: OrigemLista;
  aba: string;
}
