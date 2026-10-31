import type { RegistroManual } from "@/lib/decisoes";

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
 * `coerencia` — a Camada A, que confronta campos do próprio contato entre si e por isso
 * não tem valor esperado externo nenhum — ou `pares`: a maioria dos contatos do mesmo grupo
 * com o mesmo núcleo de cargo, quando a tabela de protocolo não tem regra (spec 2026-10-30 §3.4).
 */
export type OrigemDado = "pagina" | "conhecimento" | "protocolo" | "coerencia" | "pares";

/**
 * Achado da Camada A (coerência interna de `Tratamento`, `Endereçamento` e `Cargo`) ou
 * da Camada C (regras de escrita do cadastro, `data/regras-nome.ts`). Identifica **qual**
 * verificação apontou. `lib/tratamento.ts` traduz cada código com `rotuloAchado`.
 *
 * Os achados da Camada C (`nome_tratamento_academico`, `nome_sem_prefixo`) são os únicos
 * com `valorEsperado` preenchido na comparação que os carrega: diferente dos achados da
 * Camada A (contradição entre campos do próprio contato, sem "certo" a apontar), a Camada C
 * tem uma correção objetiva — o nome sem o tratamento, o nome com o prefixo do cargo —, e
 * ela precisa chegar ao usuário para copiar.
 */
export type AchadoCoerencia =
  | "genero_tratamento_enderecamento"
  | "genero_cargo_tratamento"
  | "forma_generica"
  | "campo_vazio"
  | "nome_tratamento_academico"
  | "nome_sem_prefixo"
  | "cargo_ex_presidente";

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
  /**
   * Partes do nome em negrito no bloco da pessoa, na ordem, unidas por espaço ("Sérgio Kukina"
   * de "<b>Sérgio</b> Luíz <b>Kukina</b>"). Só em fonte `nomeEmDestaque`; quando existe, é o
   * nome esperado (spec 2026-10-30 §3.1). Ausente: o bloco não tem negrito.
   */
  nomeDestaque?: string;
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

/** Uma página oficial lida com sucesso, guardada para reaproveitamento (spec 2026-10-20 §4.1). */
export interface LeituraGuardada {
  url: string;
  /** Hora da leitura que produziu o conteúdo, ISO 8601. Reaproveitar não muda a data. */
  lidaEm: string;
  conteudo: ConteudoFonte;
}

/** Chave: a URL da página, com o sufixo da forma de extração quando ela não é a padrão (`chaveDaLeitura`). */
export type LeiturasGuardadas = Record<string, LeituraGuardada>;

/** A leitura de hoje foi substituída pela guardada: de quando ela é e por que a de hoje não serviu. */
export interface Reaproveitamento {
  lidaEm: string;
  /** Motivo técnico de hoje ("HTTP 403", "não trouxe ninguém", "página casou 2 de 10 contatos"). Sem PII. */
  motivo: string;
}

/** URL do catálogo que falhou em coletas seguidas (spec 2026-10-23 §3.4). Sem PII: só URL, datas e motivo técnico. */
export interface FalhaDeUrl {
  /** Primeira coleta em que a URL falhou, ISO 8601. Mantida enquanto a URL continuar falhando. */
  desde: string;
  /** Coletas seguidas em que a URL falhou (a de hoje inclusa). */
  coletas: number;
  /** Motivo técnico da falha de hoje ("HTTP 404"). */
  motivo: string;
}
/** Chave: a URL do catálogo. */
export type FalhasPorUrl = Record<string, FalhaDeUrl>;
/** Uma URL que esta varredura tentou ler: `erro` ausente é sucesso. */
export interface TentativaDeUrl { url: string; erro?: string }
/**
 * A URL principal falhou e a alternativa cadastrada respondeu (spec 2026-10-23 §3.3). `url` é a
 * alternativa (a lida); `urlPrincipal` é a que falhou, a que entra em `falhas` e da qual a tela
 * tira o aviso de URL caída.
 */
export interface LeituraAlternativa { url: string; urlPrincipal: string; motivoPrincipal: string }
/** A página de hoje trouxe mais da metade de nomes que não estavam na leitura guardada (spec 2026-10-23 §3.4). */
export interface MudancaDeComposicao { lidaEm: string; trocados: number; total: number }

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
 * `nao_verificado` = a fonte daquele campo caiu, ou não existe para o contato; como
 * `fonte_nao_informa`, não é divergência.
 * Nenhuma das três é divergência.
 */
export type SituacaoCampo = "confere" | "divergente" | "fonte_nao_informa" | "sem_regra" | "nao_verificado";

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
  /**
   * Orientação ao usuário que acompanha o achado, quando o valor esperado não basta
   * ("Informar o período da presidência", spec 2026-10-30 §3.5).
   */
  observacao?: string;
  /** Página de onde saiu o valor esperado, ou que se tentou ler quando `nao_verificado` (spec 2026-10-15 §5.1). */
  fonteUrl?: string;
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
  /** ISO 8601 da leitura reaproveitada da página individual do contato (spec 2026-10-20 §5.2). Ausente quando lida nesta varredura. */
  leituraDe?: string;
  /** A página individual do contato foi lida pela URL alternativa (spec 2026-10-23 §3.3). */
  alternativa?: LeituraAlternativa;
  /**
   * A fonte individual do contato é provisória, e de que tipo (spec 2026-10-23 §5; 2026-10-26 §3.1).
   * Retrato anterior a 26/10 traz `true`, lido como `"noticia"`.
   */
  provisoria?: TipoFonteProvisoria | true;
  /**
   * Auditoria de endereço (Camada D). **Não** entra em `camposDivergentes` nem muda
   * `semaforo`: ver docs/superpowers/specs/2026-10-01-auditoria-de-endereco-camada-d.md
   */
  endereco?: AuditoriaEndereco;
  /** Eleição 2026 (spec 2026-10-05). Eixo próprio: não muda `semaforo`. */
  eleicao?: EleicaoContato;
  /** Governadores eleitos 2026 (spec 2026-10-12). Eixo próprio: não muda `semaforo`. */
  eleicaoGoverno?: EleicaoGovernoContato;
}

export interface ResultadoGrupo {
  grupo: string;
  fonteUrl?: string;
  /** Não há URL oficial cadastrada para o grupo. */
  semFonte: boolean;
  /**
   * Modo de fiscalização do agrupador da Posse 2027 quando não é a página oficial (spec 2026-10-30
   * §4.5): `lista` (comparado com as planilhas) ou `neutro` (convidados, sem fonte oficial).
   * Ausente nos grupos lidos por fonte.
   */
  fiscalizacao?: "lista" | "neutro";
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
   * A fonte primária do grupo foi substituída pela leitura guardada (spec 2026-10-20 §4.1).
   * Nunca junto com `fonteInacessivel` nem com `viaPesquisaAmpla`.
   */
  reaproveitada?: Reaproveitamento & { url: string };
  /** A primária do grupo foi lida pela URL alternativa (spec 2026-10-23 §3.3). */
  alternativa?: LeituraAlternativa;
  /** A composição de hoje trocou mais da metade dos nomes em relação à guardada (spec 2026-10-23 §3.4). Segura a publicação. */
  mudouFormato?: MudancaDeComposicao;
  /**
   * Páginas individuais ligadas a contatos do grupo: lidas com conteúdo hoje, caídas, e as que
   * entraram pela memória (spec 2026-10-15 §6.1; 2026-10-20 §4.1). `reaproveitadas` só aparece
   * quando maior que zero; retrato antigo não o traz. `provisorias` conta contatos ligados a
   * fonte provisória; só aparece quando maior que zero.
   */
  individuais?: { lidas: number; caidas: number; reaproveitadas?: number; provisorias?: number };
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
  /** Grupos com `reaproveitada` ou com `individuais.reaproveitadas > 0` (spec 2026-10-20). */
  gruposReaproveitados: number;
  /** URLs do catálogo tentadas nesta varredura e caídas há `MIN_COLETAS_URL_CAIDA` ou mais coletas seguidas (spec 2026-10-23 §3.4). */
  urlsCaidasRepetidas: number;
  /** Grupos com `mudouFormato`. */
  gruposComMudanca: number;
}

export interface ResultadoAnalise {
  arquivoNome: string;
  grupos: ResultadoGrupo[];
  resumo: ResumoAnalise;
  /** Presente só quando a varredura recebeu as planilhas de eleitos. */
  eleicao?: ResultadoEleicao;
  /** Memória de leitura que sai desta varredura (spec 2026-10-20 §6). Só no retrato local; ausente em retrato antigo. */
  leituras?: LeiturasGuardadas;
  /** URLs do catálogo que falharam em coletas seguidas (spec 2026-10-23 §3.4). Vai para a web: não tem PII. */
  falhas?: FalhasPorUrl;
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
  /** A base de endereços inteira, só no retrato local (PII: sai do retrato publicado). Spec 2026-10-06, §3. */
  baseEnderecos?: BaseEnderecos;
  /** Contagens do Número acima de 6 na base inteira; presente só com a base. */
  numeroNaBase?: NumeroNaBase;
  /** Presente só no retrato publicado na web: hora em que esta máquina o publicou, ISO 8601. */
  publicadoEm?: string;
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
  /** Quantidade de fontes individuais ativas (spec 2026-10-15). */
  fontesIndividuais: number;
  /** Campos que a fonte primária cobre, quando ela declara (`["cargo"]` na lista do Planalto). */
  camposFontePrimaria?: readonly CampoFonte[];
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

/** Campos de que uma fonte é referência (spec 2026-10-15 §3.1). */
export type CampoFonte = "nome" | "cargo";

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
  /**
   * `true`: a página monta a lista por JavaScript e é lida pelo Chrome local sem janela
   * (`lib/navegador.ts`, caso TCU). `"janela"`: lida pelo Chrome com janela visível, numa
   * sessão só por varredura — o gov.br responde CAPTCHA ao `fetch` e ao headless (spec
   * 2026-10-15 §2.9). Só em modo local; sem Chrome a fonte sai inacessível.
   */
  navegador?: true | "janela";
  /** De quais campos esta fonte é referência. Ausente: nome e cargo (composição do grupo, regra atual). */
  campos?: readonly CampoFonte[];
  /**
   * Ausente ou "pessoa": compõe o grupo com pessoas (regra atual). "cargo": a página é só
   * uma lista de denominações de cargo — não casa ninguém pelo nome, não gera possível
   * saída nem proposta de inclusão (spec 2026-10-15 §5.3).
   */
  casamento?: "pessoa" | "cargo";
  /** Lida só quando a principal falha; o que casar é comparado contra ela (spec 2026-10-23 §3.3). Mesmo domínio oficial. */
  urlAlternativa?: string;
  /** Nomes, como estão no Contatos, em que o Contatos prevalece sobre a grafia da página (spec 2026-10-23 §4.2). */
  nomesDoContatos?: readonly string[];
  /** Ausente = HTML. "pdf": o corpo é lido por `extrairConteudoPdf` (spec 2026-10-23 §5.1). */
  tipo?: "html" | "pdf";
  /** Extração por marcador: só as pessoas cujo nome é seguido de um destes textos (spec 2026-10-23 §5.2). */
  marcador?: { textos: readonly string[] };
  /**
   * O nome esperado é só a parte em negrito da página (spec 2026-10-30 §3.1, regra do GT
   * "STJ: usar as partes do nome em negrito"). Só no STJ.
   */
  nomeEmDestaque?: true;
}

/** Chave que liga uma fonte individual ao contato: a UF do cargo, ou o nome como está no Contatos. */
export type ChaveFonteIndividual = { uf: string } | { nome: string };

/**
 * Página oficial de UM contato (spec 2026-10-15 §3). A ligação é pela chave, comparada com
 * `ufDoContato` ou com `normalizarNome`; a página é a referência dos `campos` declarados.
 */
export interface FonteIndividual {
  url: string;
  ativo: boolean;
  chave: ChaveFonteIndividual;
  /** Obrigatório e sempre com "nome": `["nome", "cargo"]` ou `["nome"]`. */
  campos: readonly CampoFonte[];
  navegador?: true | "janela";
  urlAlternativa?: string;
  /**
   * Fonte provisória e de que tipo: notícia de órgão oficial no lugar de página institucional
   * (spec 2026-10-23 §5), ou site de campanha de governador eleito (spec 2026-10-26).
   */
  provisoria?: TipoFonteProvisoria;
  /**
   * Último dia em que a fonte é lida, `AAAA-MM-DD`, inclusive, no fuso de Brasília (spec 2026-10-26
   * §3.3). Depois dele a fonte é ignorada, como se estivesse inativa.
   */
  validaAte?: string;
}

/** Tipo da fonte individual provisória (spec 2026-10-26 §3.1). */
export type TipoFonteProvisoria = "noticia" | "campanha";

/** Uma fonte que o raspador sabe ler: o que `FonteCatalogo` e `FonteIndividual` têm em comum. */
export type FonteLegivel = Pick<
  FonteCatalogo,
  "url" | "tabela" | "navegador" | "urlAlternativa" | "tipo" | "marcador" | "nomeEmDestaque"
>;

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
  /** Páginas individuais, uma por contato, ligadas por UF ou por nome (spec 2026-10-15). */
  fontesIndividuais?: readonly FonteIndividual[];
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
  | "numero_longo"
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

/** Casa legislativa de um eleito ou de um grupo de parlamentares. */
export type CasaLegislativa = "senado" | "camara";

/**
 * Uma linha das planilhas `Senadores Eleitos 2026.xlsx` ou `Deputados Federais Eleitos 2026.xlsx`
 * (aba `Eleitos`, geradas na pasta `GT Posse/Eleitos 2026`). Dado público do TSE.
 * Spec 2026-10-05 §2.
 */
export interface EleitoPlanilha {
  casa: CasaLegislativa;
  /** Sigla da UF, como na planilha ("AC"). */
  uf: string;
  nomeUrna: string;
  nomeCompleto: string;
  partido?: string;
  /** Coluna `Situação (TSE)`: "Eleito", "Eleito por QP", "PROJEÇÃO da imprensa (...)". */
  situacaoTse: string;
  /** Coluna `Status do mandato`: base da classificação (spec §4). */
  statusMandato: string;
  baseStatus?: string;
  genero?: string;
  nascimento?: string;
}

/** Uma linha de `Governadores Eleitos 2026.xlsx` (aba "Eleitos" com "Turno", ou "Eleitos 1º turno" no layout antigo, e aba "2º turno"). Dado público do TSE. */
export interface GovernadorPlanilha {
  uf: string; nomeUrna: string; nomeCompleto: string; partido?: string;
  situacaoTse: string; statusMandato: string; baseStatus?: string; genero?: string; vice?: string;
}
export interface PlanilhaGovernadores { eleitos: GovernadorPlanilha[]; segundoTurno: GovernadorPlanilha[] }

/** Uma linha de `Deputados Federais Atuais (57a legislatura).xlsx`, aba `Em exercício`. */
export interface DeputadoAtual {
  uf: string;
  nomeParlamentar: string;
  nomeCivil: string;
  partido?: string;
  sexo?: string;
  condicao?: string;
  eleicao2026?: string;
  email?: string;
  predio?: string;
  sala?: string;
  telefone?: string;
  idCamara?: string;
}

/**
 * Para onde vai cada eleito no cadastro (spec §4): fica no grupo atual (`reeleito`, `outra_casa`),
 * entra no grupo novo (`novo`) ou fica fora do lote até decisão (`conferir`).
 */
export type DestinoEleito = "reeleito" | "outra_casa" | "novo" | "conferir";

/** Linha do Contatos que casou com o eleito. */
export interface ContatoDoEleito {
  grupo: string;
  nome: string;
  id?: string;
}

export interface EleitoClassificado {
  eleito: EleitoPlanilha;
  destino: DestinoEleito;
  /** `Situação (TSE)` começa com "PROJEÇÃO": eleito ainda não homologado pelo TSE. */
  projecao: boolean;
  /** Por que está em `conferir`. */
  motivo?: string;
  /** Linhas do Contatos da pessoa (pode estar em mais de um grupo). Vazio = não está no Contatos. */
  contatos: ContatoDoEleito[];
  /**
   * Rótulo do grupo do Contatos que convida a pessoa (Ata 14; spec 2026-10-30 §3.6): "Senadores",
   * "Deputados Federais" ou um dos grupos de eleitos de `data/grupos-posse.ts`.
   * Ausente em `conferir` e em retrato gravado antes de 30/10/2026.
   */
  grupoDestino?: string;
  /**
   * Já está no grupo do Contatos cujo rótulo é `grupoDestino` (comparação por `normalizarTexto`).
   * Para "Senadores", vale qualquer grupo de senador atual (inclusive os titulares fora de exercício).
   */
  jaCadastrado?: boolean;
  /** Decisão do GT que se aplicou à pessoa (spec 2026-10-30 §4.1.1), para a tela mostrar o histórico. */
  decisao?: RegistroManual;
}

/** O que o painel mostra na linha de um contato que é eleito. Não pinta o semáforo. */
export interface EleicaoContato {
  casa: CasaLegislativa;
  destino: DestinoEleito;
  projecao: boolean;
  uf: string;
  partido?: string;
  situacaoTse: string;
  statusMandato: string;
  baseStatus?: string;
  nomeUrna: string;
  motivo?: string;
}

export type DestinoGoverno = "reeleito" | "outro_cargo" | "novo" | "conferir";

export interface GovernadorClassificado {
  eleito: GovernadorPlanilha;
  destino: DestinoGoverno;
  motivo?: string;
  /** Linhas do Contatos casadas (Governadores, Senadores ou Deputados Federais). */
  contatos: ContatoDoEleito[];
  /**
   * Grupo do Contatos que convida a pessoa: "Governadores", o grupo de governadores eleitos, ou
   * "Senadores"/"Deputados Federais" para quem vai para outro cargo (Ata 14).
   * Ausente em `conferir` e em retrato gravado antes de 30/10/2026.
   */
  grupoDestino?: string;
  /**
   * Já está no grupo do Contatos cujo rótulo do agrupador é `grupoDestino` (desde 30/10/2026; o
   * rótulo antigo "Governadores Eleitos" não conta mais).
   */
  jaCadastrado?: boolean;
  /** Deputado em exercício (planilha da Câmara) eleito governador, quando o grupo não está no Contatos. */
  deputadoAtual?: { uf: string; nomeParlamentar: string };
  /** Decisão do GT que se aplicou à pessoa (spec 2026-10-30 §4.1.1), para a tela mostrar o histórico. */
  decisao?: RegistroManual;
}

export interface UfSegundoTurno {
  uf: string;
  candidatos: { nomeUrna: string; partido?: string; statusMandato: string }[];
}

/** O que o painel mostra na linha de um contato que é governador eleito. Não pinta o semáforo. */
export interface EleicaoGovernoContato {
  destino: DestinoGoverno;
  uf: string;
  partido?: string;
  situacaoTse: string;
  statusMandato: string;
  baseStatus?: string;
  nomeUrna: string;
  motivo?: string;
}

/** Eleição 2026 no retrato. `deputadosAtuais` vai para a web sem e-mail, telefone, prédio e sala (lib/publicar.ts). */
export interface ResultadoEleicao {
  arquivos: string[];
  eleitos: EleitoClassificado[];
  deputadosAtuais?: DeputadoAtual[];
  /** O grupo "Deputados Federais" existe no Contatos? Sem ele, deputados valem pela planilha. */
  camaraNoContatos: boolean;
  governadores?: { eleitos: GovernadorClassificado[]; segundoTurno: UfSegundoTurno[] };
}

/** Célula da base de endereços como foi lida da planilha (Ids e CEP chegam numéricos). */
export type CelulaBase = string | number | null;

/** A base de endereços inteira, guardada como foi lida (spec 2026-10-06, §3). */
export interface BaseEnderecos {
  cabecalho: string[];
  linhas: CelulaBase[][];
}

/** Contagens do Número acima de 6 na base inteira; sem dado pessoal (vão ao retrato publicado). */
export interface NumeroNaBase {
  enderecos: number;
  acimaDoLimite: number;
  contatos: number;
  foraDaPosse: number;
  naoPrioritarios: number;
}
