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

/**
 * Procedência do valor esperado: página oficial, conhecimento da IA, tabela de protocolo,
 * ou `coerencia` — a Camada A, que confronta campos do próprio contato entre si e por isso
 * não tem valor esperado externo nenhum.
 */
export type OrigemDado = "pagina" | "conhecimento" | "protocolo" | "coerencia";

/**
 * Achado da Camada A (coerência interna de `Tratamento`, `Endereçamento` e `Cargo`).
 * Identifica **qual** das quatro verificações apontou, já que as quatro recaem sobre
 * apenas dois campos. `lib/tratamento.ts` traduz cada código com `rotuloAchado`.
 */
export type AchadoCoerencia =
  | "genero_tratamento_enderecamento"
  | "genero_cargo_tratamento"
  | "forma_generica"
  | "campo_vazio";

/** Uma pessoa extraída (estruturada) da fonte oficial. */
export interface PessoaSite {
  nome: string;
  cargo?: string;
  endereco?: string;
  /** De onde veio o registro (página oficial vs conhecimento da IA). */
  origem?: OrigemDado;
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

/**
 * `fonte_nao_informa` = o site não publica esse campo.
 * `sem_regra` = não há regra de protocolo aplicável (cargo não mapeado, ou contato sem cargo).
 * São coisas diferentes: a primeira é limite da fonte, a segunda é limite do cadastro de regras.
 * Nenhuma das duas é divergência.
 */
export type SituacaoCampo = "confere" | "divergente" | "fonte_nao_informa" | "sem_regra";

export interface ComparacaoCampo {
  campo: string;
  valorPlanilha: string;
  /** Valor correto — do site, da IA ou da tabela de protocolo. Ausente quando não há referência. */
  valorEsperado?: string;
  situacao: SituacaoCampo;
  /** Procedência do valor esperado (página oficial, conhecimento da IA ou tabela de protocolo). */
  origemValor?: OrigemDado;
  /**
   * Só na Camada A (`origemValor: "coerencia"`): qual verificação de coerência apontou.
   * Ali não há `valorEsperado` — a contradição é entre campos do próprio contato, e dizer
   * qual dos dois está certo seria adivinhação.
   */
  achado?: AchadoCoerencia;
}

export interface ResultadoContato {
  contato: ContatoPlanilha;
  semaforo: Semaforo;
  score: number;
  /** Auditoria campo a campo (fonte da verdade para as colunas planilha×site). */
  comparacoes: ComparacaoCampo[];
  /** Subconjunto de `comparacoes` com situacao "divergente" (compat/badge). */
  camposDivergentes: CampoDivergente[];
  /** Contato não encontrado na fonte (possível saída) — distinto de "campo ausente". */
  possivelSaida?: boolean;
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

/** Grupo do catálogo com seus responsáveis e status de fonte (para a tela de visualização). */
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

/** Fonte oficial de um grupo no catálogo versionado (`data/catalogo.ts`). */
export interface FonteCatalogo {
  url: string;
  ativo: boolean;
}

/**
 * Grupo no catálogo versionado (`data/catalogo.ts`), com responsáveis internos
 * e fontes oficiais. A **primeira fonte ativa da lista é a primária** — a ordem
 * do array é significativa e substitui o `created_at` do antigo schema Postgres.
 */
export interface GrupoCatalogo {
  nome: string;
  responsavel1?: string;
  responsavel2?: string;
  backup?: string;
  emailResp1?: string;
  emailResp2?: string;
  emailBackup?: string;
  fontes: FonteCatalogo[];
}

/**
 * Uma entrada da tabela de protocolo (`data/tratamentos.ts`), aba "Tratamentos Simplificado".
 * Os textos são **padrões**, não valores literais: podem conter marcador de gênero `(a)`,
 * alternativas ("ou", " / "), feminino por extenso entre parênteses e os placeholders
 * `[Cargo]`, `[Patente]` e `[Nome]`. Ver lib/tratamento.ts para a expansão.
 * `cargoDestinatario` é multilinha: a 1ª linha é o nome do cargo; as demais são notas
 * entre parênteses ou listas de patentes ("- Almirante", "Ex.: Coronel, ...").
 */
export interface RegraTratamento {
  cargoDestinatario: string;
  nominata: string;
  vocativo: string;
  pronome: string;
  enderecamento: string;
}
