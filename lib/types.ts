/** Uma linha da planilha do Sistema Contatos (campos opcionais exceto nome/grupo). */
export interface ContatoPlanilha {
  /**
   * `Id` do contato no Sistema Contatos. Chave exata da junção com a base de
   * endereços: casar por nome deixa 26 dos 418 contatos do agrupador ambíguos
   * (medido em 2026-10-01), e endereço de outra pessoa é pior que endereço ausente.
   */
  id?: string;
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
 * Achado da Camada A (coerência interna de `Tratamento`, `Endereçamento` e `Cargo`) ou
 * da Camada C (regras de escrita do cadastro, `data/regras-nome.ts`). Identifica **qual**
 * verificação apontou. `lib/tratamento.ts` traduz cada código com `rotuloAchado`.
 *
 * `nome_tratamento_academico` é o único achado com `valorEsperado` preenchido na
 * comparação que o carrega: diferente dos achados da Camada A (contradição entre campos
 * do próprio contato, sem "certo" a apontar), a Camada C tem uma correção objetiva — o
 * nome sem o tratamento —, e ela precisa chegar ao usuário para copiar.
 */
export type AchadoCoerencia =
  | "genero_tratamento_enderecamento"
  | "genero_cargo_tratamento"
  | "forma_generica"
  | "campo_vazio"
  | "nome_tratamento_academico";

/** Uma pessoa extraída (estruturada) da fonte oficial. */
export interface PessoaSite {
  nome: string;
  cargo?: string;
  endereco?: string;
  /** De onde veio o registro (página oficial vs conhecimento da IA). */
  origem?: OrigemDado;
  /** Motivo da situação da fonte rotulada (ex.: "Ocupação de cargo de ministro/secretário"); exibido na tela e no export. */
  contexto?: string;
  /** UF publicada pela fonte (só em fonte tabular que tenha a coluna). */
  uf?: string;
  /** Rótulo da fonte de onde a pessoa veio ("fora de exercício"). */
  rotuloFonte?: string;
  /** URL da fonte de onde a pessoa veio. */
  fonteUrl?: string;
  /** A fonte de origem propõe inclusão: não casar com ninguém faz desta pessoa um "novo". */
  propoeInclusao?: boolean;
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
   * Só nas Camadas A e C (`origemValor: "coerencia"`): qual verificação apontou. Na
   * Camada A não há `valorEsperado` — a contradição é entre campos do próprio contato, e
   * dizer qual dos dois está certo seria adivinhação. Na Camada C (`nome_tratamento_academico`)
   * há: a regra do grupo dá a correção objetiva, e `valorEsperado` a carrega.
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
  /**
   * Auditoria de endereço (Camada D). **Não** entra em `camposDivergentes` nem muda
   * `semaforo`: ver docs/superpowers/specs/2026-10-01-auditoria-de-endereco-camada-d.md
   */
  endereco?: AuditoriaEndereco;
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
  /** `responsavel1` do grupo no catálogo. Só o nome; e-mails não saem do catálogo. */
  responsavel?: string;
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
  /** Contatos cujo endereço precisa de confirmação humana (situacao `pendente`). */
  enderecosAConfirmar: number;
  /** Contatos marcados `possivelSaida`. Subconjunto de `vermelho`. */
  possivelSaida: number;
  /** Contatos de grupo sem URL cadastrada. Subconjunto de `vermelho`. */
  contatosSemFonte: number;
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

/**
 * O que o app guarda entre uma abertura e outra: o resultado de uma varredura, a hora em
 * que terminou e as planilhas que a alimentaram. Um só, em `.fiscal/retrato.json`, fora do
 * git. Ver docs/superpowers/specs/2026-10-01-painel-local-retrato-em-arquivo.md
 */
export interface Retrato extends ResultadoAnalise {
  /** Hora em que a varredura terminou, ISO 8601. */
  geradoEm: string;
  /** Nome e linhas lidas da planilha de contatos. */
  planilhaContatos: { nome: string; linhas: number };
  /** Presente só quando a planilha de endereços foi enviada. */
  planilhaEnderecos?: { nome: string; linhas: number };
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

/**
 * Extração estruturada de uma página que publica a lista como tabela. Declarada no
 * catálogo, por fonte: os índices de coluna e os nomes de seção são cadastro, não
 * dedução em tempo de execução. Ver
 * docs/superpowers/specs/2026-09-24-segunda-fonte-senadores-fora-de-exercicio.md
 */
export interface ExtracaoTabela {
  /** Índice da tabela na página, 0-based. Padrão: 0. */
  indice?: number;
  /** Índice da coluna, 0-based. `nome` é obrigatório; as demais, quando a página publica. */
  colunas: { nome: number; uf?: number; motivo?: number };
  /**
   * Só as linhas sob estas seções entram na composição. Casamento normalizado e por
   * prefixo. Lista vazia ou ausente = todas as seções entram.
   */
  secoes?: readonly string[];
}

/** Fonte oficial de um grupo no catálogo versionado (`data/catalogo.ts`). */
export interface FonteCatalogo {
  url: string;
  ativo: boolean;
  /**
   * Nota curta mostrada no veredito de quem casar por esta fonte ("fora de exercício").
   * Ausente na fonte principal: casar por ela é o caso normal e não merece nota.
   */
  rotulo?: string;
  /** A página publica a lista como tabela; sem isto vale a extração de texto padrão. */
  tabela?: ExtracaoTabela;
  /**
   * Pessoas desta fonte sem par na planilha viram "novo". Padrão `false`: uma fonte só
   * compõe o grupo; propor inclusão é decisão de cadastro.
   */
  propoeInclusao?: boolean;
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
  /**
   * UFs que pertencem ao grupo, quando ele é uma faixa geográfica ("Senadores (Acre a
   * Goiás)"). Filtra **apenas** a proposta de inclusão: para casar contato existente a
   * composição inteira vale, senão contato arquivado na faixa errada viraria "saída".
   */
  ufs?: readonly string[];
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

/** Uma linha da planilha de endereços do Sistema Contatos, com os campos separados. */
export interface EnderecoEstruturado {
  contatoId: string;
  enderecoId?: string;
  /** Nome como está na base de endereços — usado só na junção por nome, sem `Id`. */
  nome?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  pais?: string;
  cep?: string;
  /** Coluna `Prioritário` (Sim/Não): qual endereço vale quando o contato tem vários. */
  prioritario: boolean;
}

/**
 * Situação do endereço de um contato. Eixo **separado** do semáforo: endereço
 * incompleto não é divergência contra fonte nenhuma, é trabalho de telefone pendente.
 * `sem_base` = nenhuma planilha de endereços foi enviada (comportamento de hoje).
 */
export type SituacaoEndereco = "completo" | "a_completar" | "pendente" | "nao_verificado" | "sem_base";

/** O que a auditoria de endereço encontrou. `rotuloAchadoEndereco` traduz cada código. */
export type AchadoEndereco =
  | "sem_linha"
  | "sem_logradouro"
  | "sem_numero"
  | "sem_bairro"
  | "cep_ausente"
  | "cep_invalido"
  | "cep_recuperavel"
  | "nome_ambiguo"
  | "sem_prioritario"
  | "varios_prioritarios";

export interface AuditoriaEndereco {
  situacao: SituacaoEndereco;
  achados: AchadoEndereco[];
  /** A linha escolhida da base. Ausente quando não há linha ou a junção não resolveu. */
  endereco?: EnderecoEstruturado;
  /** Endereço montado no formato do Contatos, pronto para copiar. Só quando `situacao` é `completo`. */
  formatado?: string;
  /** Quantas linhas de endereço o contato tem na base (para explicar a escolha). */
  linhas?: number;
}
