/** Uma linha da planilha do Sistema Contatos (campos opcionais exceto nome/grupo). */
export interface ContatoPlanilha {
  foto?: string;
  tratamento?: string;
  enderecamento?: string;
  nome: string;
  telefone?: string;
  email?: string;
  redeSocial?: string;
  endereco?: string;
  orgao?: string;
  cargo?: string;
  departamento?: string;
  grupo: string;
}

/** Uma pessoa extraída do site oficial. */
export interface PessoaSite {
  nomeCompleto?: string;
  /** Nome em destaque (negrito) — geralmente o nome político. */
  nomePolitico?: string;
  cargo?: string;
  /** Trecho de texto bruto onde a pessoa foi encontrada. */
  contexto: string;
}

/** Conteúdo limpo de uma página oficial. */
export interface ConteudoFonte {
  url: string;
  textoLimpo: string;
  /** Strings encontradas dentro de <strong>/<b>. */
  destaques: string[];
}

export type Semaforo = "verde" | "amarelo" | "vermelho" | "novo";
export type OrigemVeredito = "oficial" | "pesquisa_ampla";

export interface CampoDivergente {
  campo: string;
  valorPlanilha?: string;
  valorEncontrado?: string;
}

export interface ResultadoContato {
  contato: ContatoPlanilha;
  semaforo: Semaforo;
  score: number;
  camposDivergentes: CampoDivergente[];
  origem: OrigemVeredito;
  fonteUrl?: string;
  observacao?: string;
}

export interface ResultadoGrupo {
  grupo: string;
  fonteUrl?: string;
  semFonte: boolean;
  contatos: ResultadoContato[];
  /** Pessoas no site sem correspondência na planilha. */
  novos: PessoaSite[];
}

export interface ResumoAnalise {
  total: number;
  verde: number;
  amarelo: number;
  vermelho: number;
  novo: number;
  gruposSemFonte: number;
}

export interface ResultadoAnalise {
  arquivoNome: string;
  grupos: ResultadoGrupo[];
  resumo: ResumoAnalise;
}

/** Grupo cadastrado no Supabase com seus responsáveis e status de fonte (para a tela de visualização). */
export interface GrupoCadastro {
  nome: string;
  responsavel1?: string;
  responsavel2?: string;
  backup?: string;
  emailResp1?: string;
  emailResp2?: string;
  emailBackup?: string;
  /** URL oficial primária ativa, se houver. */
  fonteUrl?: string;
  temFonte: boolean;
}
