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

/** Uma pessoa extraída (estruturada) da fonte oficial. */
export interface PessoaSite {
  nome: string;
  cargo?: string;
  /** Trecho de origem (para depuração). */
  contexto?: string;
}

/** Conteúdo limpo de uma página oficial. */
export interface ConteudoFonte {
  url: string;
  textoLimpo: string;
  /** Strings em <strong>/<b> já filtradas (dica de nomes). */
  destaques: string[];
  /** Pessoas estruturadas extraídas da página. */
  pessoas: PessoaSite[];
}

export type Semaforo = "verde" | "amarelo" | "vermelho" | "novo" | "indeterminado";
export type OrigemVeredito = "oficial" | "pesquisa_ampla";

export interface CampoDivergente {
  campo: string;
  valorPlanilha?: string;
  valorEncontrado?: string;
}

export type SituacaoCampo = "confere" | "divergente" | "fonte_nao_informa";

export interface ComparacaoCampo {
  campo: string;
  valorPlanilha: string;
  /** Valor correto vindo do site (ausente quando a fonte não informa). */
  valorSite?: string;
  situacao: SituacaoCampo;
}

export interface ResultadoContato {
  contato: ContatoPlanilha;
  semaforo: Semaforo;
  score: number;
  /** Auditoria campo a campo (fonte da verdade para as colunas planilha×site). */
  comparacoes: ComparacaoCampo[];
  /** Subconjunto de `comparacoes` com situacao "divergente" (compat/badge). */
  camposDivergentes: CampoDivergente[];
  origem: OrigemVeredito;
  fonteUrl?: string;
  observacao?: string;
}

export interface ResultadoGrupo {
  grupo: string;
  fonteUrl?: string;
  /** Não há URL oficial cadastrada para o grupo. */
  semFonte: boolean;
  /**
   * Há URL cadastrada, mas o scrape falhou (TLS, WAF, timeout, bloqueio de IP).
   * Distinto de `semFonte`: a fonte existe, só não foi possível lê-la agora.
   */
  fonteInacessivel?: boolean;
  /** Motivo técnico da falha de acesso (ex.: "HTTP 403"). Sem PII. */
  erroFonte?: string;
  /**
   * A verificação veio da 2ª etapa (pesquisa ampla via Gemini + Google Search),
   * porque a fonte oficial estava inacessível ou ausente. Veredito complementar,
   * não oficial — sinalizado ao usuário.
   */
  viaPesquisaAmpla?: boolean;
  /**
   * Quando o rótulo da planilha não casa nenhum grupo cadastrado (semFonte),
   * nomes cadastrados mais próximos para orientar o usuário a alinhar a planilha.
   */
  sugestoesCadastro?: string[];
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
  indeterminado: number;
  gruposSemFonte: number;
  gruposFonteInacessivel: number;
  /** Grupos verificados pela 2ª etapa (pesquisa ampla via Gemini). */
  gruposViaPesquisaAmpla: number;
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
