import stringSimilarity from "string-similarity";
import { chaveToken, normalizarTexto } from "@/lib/normalize";
import { REGRAS_TRATAMENTO } from "@/data/tratamentos";
import { EXCECOES_CARGO } from "@/data/cargos-tratamento";
import { REGRAS_NOME, type RegraNome } from "@/data/regras-nome";
import { generoDoCargo, generoPorLexico, MARCADOR_GENERICO, neutralizarGenero, type Genero } from "@/lib/cargos";
import type {
  AchadoCoerencia,
  ComparacaoCampo,
  ContatoPlanilha,
  RegraTratamento,
} from "@/lib/types";

/**
 * Passo 1 — alternativas separadas por "ou" numa linha isolada.
 * Ex.: "Eminentíssimo Senhor Cardeal\nou\nEminentíssimo e Reverendíssimo Senhor Cardeal".
 */
function porOu(padrao: string): string[] {
  return padrao.split(/\r?\n\s*ou\s*\r?\n/i);
}

/**
 * Passo 2 — alternativas separadas por " / ". A barra troca só o final: em
 * "Senhor(a) Ministro(a) / Conselheiro(a)" a segunda forma é "Senhor(a) Conselheiro(a)",
 * não "Conselheiro(a)" solto. Por isso o prefixo da primeira alternativa é herdado.
 * A forma curta também entra, pelo viés permissivo declarado no spec.
 */
function porBarra(forma: string): string[] {
  const partes = forma.split(" / ").map((p) => p.trim()).filter((p) => p.length > 0);
  if (partes.length <= 1) return [forma];
  const [primeira, ...resto] = partes;
  const palavras = primeira.split(" ");
  const prefixo = palavras.slice(0, -1).join(" ");
  return [primeira, ...resto.flatMap((p) => (prefixo ? [`${prefixo} ${p}`, p] : [p]))];
}

/**
 * Passo 3 — marcador de gênero colado à palavra: `Senhor(a)`, `Ministro(a)`.
 * Palavra terminada em "o" troca o "o" por "a" (Ministro→Ministra); caso contrário
 * acrescenta (Senhor→Senhora). Irregularidades como Juiz(a)→"Juíza" são absorvidas
 * pela normalização, que remove acentos.
 */
function porGenero(forma: string): string[] {
  const i = forma.indexOf("(a)");
  if (i === -1) return [forma];
  const antes = forma.slice(0, i);
  const depois = forma.slice(i + 3);
  const m = antes.match(/(\S+)$/);
  if (!m) return porGenero(antes + depois); // "(a)" solto: descarta o marcador
  const palavra = m[1];
  const base = antes.slice(0, antes.length - palavra.length);
  const feminino = palavra.endsWith("o") ? `${palavra.slice(0, -1)}a` : `${palavra}a`;
  return [
    ...porGenero(base + palavra + depois),
    ...porGenero(base + feminino + depois),
  ];
}

/**
 * Passo 4 — feminino por extenso: ` (Consulesa)` precedido de espaço, com palavra
 * inteira dentro dos parênteses. Distingue-se do passo 3 porque o marcador `(a)` vem
 * colado à palavra, sem espaço.
 */
function porParenteses(forma: string): string[] {
  const m = forma.match(/(\S+) \(([^)]+)\)/);
  if (!m) return [forma];
  const [inteiro, palavra, alternativa] = m;
  return [
    ...porParenteses(forma.replace(inteiro, palavra)),
    ...porParenteses(forma.replace(inteiro, alternativa)),
  ];
}

/**
 * Passo 5 — placeholders vindos do próprio contato. `[Cargo]` e `[Patente]` usam o campo
 * `cargo`; `[Nome]`, o campo `nome`. Placeholder sem dado correspondente devolve
 * `undefined`: o caso é **não auditável**, e vira `sem_regra` — nunca divergente.
 */
function substituirMarcadores(forma: string, contato: ContatoPlanilha): string | undefined {
  let resultado = forma;
  if (/\[(Cargo|Patente)\]/.test(resultado)) {
    if (!contato.cargo) return undefined;
    resultado = resultado.replace(/\[(Cargo|Patente)\]/g, contato.cargo);
  }
  if (resultado.includes("[Nome]")) {
    resultado = resultado.replace(/\[Nome\]/g, contato.nome);
  }
  return resultado;
}

/**
 * Expande um padrão da tabela de protocolo no conjunto de formas aceitas, normalizadas.
 * Lista vazia significa **não expansível** (padrão vazio, ou placeholder sem dado no
 * contato) — o chamador deve tratar como `sem_regra`, não como divergência.
 */
export function expandirFormas(padrao: string, contato: ContatoPlanilha): string[] {
  const formas = porOu(padrao)
    .flatMap(porBarra)
    .flatMap(porGenero)
    .flatMap(porParenteses)
    .map((f) => substituirMarcadores(f, contato))
    .filter((f): f is string => f !== undefined)
    .map(normalizarTexto)
    .filter((f) => f.length > 0);
  return [...new Set(formas)];
}

// ---------------------------------------------------------------------------
// Compartilhado pelas duas camadas.
// ---------------------------------------------------------------------------

function estaVazio(valor: string | undefined): boolean {
  return (valor ?? "").trim().length === 0;
}

/**
 * Forma que não compromete o gênero — "Senhor(a)", "A(o) Senhor(a)". Convite, cartão e
 * cinta não podem sair assim, então é achado por si só — da Camada A, que é quem acusa.
 */
function formaGenerica(valor: string | undefined): boolean {
  return MARCADOR_GENERICO.test(valor ?? "");
}

// ---------------------------------------------------------------------------
// Camada B — conformidade com a tabela de protocolo.
// Ver docs/superpowers/specs/2026-09-15-auditoria-tratamento-correcao-de-alvo.md,
// Decisões 1 a 3.
// ---------------------------------------------------------------------------

/** Abaixo disso o cargo é considerado não correspondente — vira `sem_regra`. */
const LIMIAR_CARGO = 0.6;

/**
 * Vantagem mínima do primeiro colocado sobre o segundo na similaridade. Sem ela, devolve
 * `undefined` — e `sem_regra` é melhor que uma regra errada, que não aparece na lista do
 * que falta mapear.
 *
 * Medida contra os 329 contatos reais: os empates que hoje resolvem para a regra errada
 * ficam todos em 0,116 ou menos ("Ministra do Supremo Tribunal Federal" → "Presidente do
 * Supremo Tribunal Federal", margem 0,112, é o maior deles que o filtro de qualificador
 * abaixo não pega). O acerto seguinte na escala está em 0,121, então 0,12 é o menor valor
 * de dois decimais dentro da faixa vazia entre um e outro.
 */
const MARGEM_CARGO = 0.12;

/**
 * Palavras que mudam **quem** é a pessoa em relação ao titular do cargo. A similaridade de
 * Dice não as enxerga: "Vice-Presidente do Supremo Tribunal Federal" fica a 0,930 de
 * "Presidente do Supremo Tribunal Federal", margem larga o bastante para passar por
 * qualquer limiar — e o vice herdaria o protocolo do titular.
 *
 * Por isso um candidato só concorre quando carrega exatamente os mesmos qualificadores do
 * cargo da planilha: "Vice-Governador do Pará" casa "Vice-Governador" e não "Governador".
 * Vale apenas na similaridade — casamento exato e `EXCECOES_CARGO` continuam vencendo.
 */
const QUALIFICADORES = [
  "vice", "ex", "substituto", "substituta", "interino", "interina",
  "adjunto", "adjunta", "suplente", "emerito", "emerita", "exercicio",
];

/** Assinatura de qualificadores de um texto, em ordem fixa, para comparação por igualdade. */
function qualificadoresDe(texto: string): string {
  const palavras = new Set(normalizarTexto(texto).split(/[^a-z]+/).filter(Boolean));
  return QUALIFICADORES.filter((q) => palavras.has(q)).join(" ");
}

/** Fecho que a tabela usa para deixar a lista de exemplos aberta; não é cargo. */
const FECHO_DE_LISTA = /^entre outros\b/;

/**
 * Linhas de `cargoDestinatario` que valem como nome de cargo. A primeira é sempre candidata;
 * as seguintes só quando são **itens de detalhe**: patentes listadas com "- " ou exemplos
 * depois de "Ex.:". É o que faz "General de Exército" e "Coronel" resolverem para as regras
 * militares, cuja primeira linha é só o rótulo da categoria.
 * Linha entre parênteses é nota de aplicação da regra ("(Incluir nesse padrão ...)"), não
 * cargo, e fica de fora — casá-la seria inventar correspondência.
 */
function linhasCandidatas(cargoDestinatario: string): string[] {
  const [primeira, ...resto] = cargoDestinatario.split("\n");
  const detalhes = resto.flatMap((linha) => {
    const limpa = linha.trim();
    if (limpa.startsWith("- ")) return [limpa.slice(2)];
    if (/^Ex\.:/i.test(limpa)) return limpa.replace(/^Ex\.:/i, "").split(",");
    return [];
  });
  return [primeira, ...detalhes]
    .map((linha) => linha.trim().replace(/\.$/, "").trim())
    .filter((linha) => linha.length > 0 && !FECHO_DE_LISTA.test(normalizarTexto(linha)));
}

/**
 * Nomes candidatos de uma regra: as linhas de cargo acima, cada uma expandida pelas
 * alternativas separadas por " / " com a mesma herança de prefixo do vocativo (`porBarra`).
 * "Presidente do Congresso Nacional / Senado Federal" também casa "Presidente do Senado
 * Federal" e "Senado Federal".
 */
function nomesCandidatos(regra: RegraTratamento): string[] {
  return [...new Set(linhasCandidatas(regra.cargoDestinatario).flatMap(porBarra))];
}

interface Candidato {
  /** Nome do cargo já normalizado, pronto para a similaridade. */
  readonly nome: string;
  /** Assinatura de qualificadores do nome — ver `QUALIFICADORES`. */
  readonly qualificacao: string;
}

/**
 * Memória dos candidatos já derivados de cada regra. `resolverRegra` roda uma vez por
 * contato sobre as mesmas 38 regras imutáveis; sem isto, a planilha de 329 linhas refaz o
 * mesmo recorte de texto milhares de vezes. Chave fraca: nada é retido além das regras.
 */
const candidatosPorRegra = new WeakMap<RegraTratamento, readonly Candidato[]>();

function candidatosDe(regra: RegraTratamento): readonly Candidato[] {
  const memorizados = candidatosPorRegra.get(regra);
  if (memorizados) return memorizados;
  const candidatos = nomesCandidatos(regra).map((nome) => ({
    nome: normalizarTexto(nome),
    qualificacao: qualificadoresDe(nome),
  }));
  candidatosPorRegra.set(regra, candidatos);
  return candidatos;
}

/**
 * Regras da tabela achadas pelo prefixo do cargo (normalizado, gênero neutralizado), sem a
 * similaridade, que cai abaixo do limiar quando o complemento é longo: Ministro de Estado e o
 * Advogado-Geral da União (decisão do Clovis, 2026-10-27; "…da Justiça e Segurança Pública"
 * ficava a 0,54); Governador e Vice-Governador "do Estado de …" ou "do Distrito Federal"
 * (spec 2026-10-30 §3.4; "Governador do Estado de São Paulo" ficava a 0,45). `qualificacao`
 * é a que o cargo tem de ter (`QUALIFICADORES`): substituto, interino e ex não herdam a regra.
 */
const REGRAS_POR_PREFIXO: readonly { cargo: string; qualificacao: string; casa: RegExp }[] = [
  { cargo: "ministro de estado", qualificacao: "", casa: /^(ministro de estado\b|advogad[oa]-geral da uniao$)/ },
  { cargo: "governador", qualificacao: "", casa: /^governador\b/ },
  { cargo: "vice-governador", qualificacao: "vice", casa: /^vice[- ]governador\b/ },
];

/**
 * Resolve o `Cargo` livre da planilha para uma entrada da tabela de protocolo.
 * Ordem: exceção manual → casamento exato normalizado → similaridade.
 *
 * A similaridade só conclui quando o melhor candidato passa do limiar **e** abre
 * `MARGEM_CARGO` sobre o segundo colocado, e só concorrem candidatos com os mesmos
 * qualificadores do cargo (nem vice nem ex herdam a regra do titular). Nada correspondendo
 * devolve `undefined` — o chamador marca `sem_regra`, que é o resultado seguro.
 */
export function resolverRegra(
  cargo?: string,
  regras: readonly RegraTratamento[] = REGRAS_TRATAMENTO,
  excecoes: Readonly<Record<string, string>> = EXCECOES_CARGO,
): RegraTratamento | undefined {
  if (!cargo) return undefined;
  // Gênero não muda a regra: "Senadora" procura como "senador". Só a busca; ver §4.2 do spec.
  const alvo = neutralizarGenero(normalizarTexto(cargo));
  if (alvo.length === 0) return undefined;

  // `typeof` protege de chaves herdadas do prototype ("constructor", "toString").
  const excecao = excecoes[alvo];
  if (typeof excecao === "string" && excecao.length > 0) {
    const norm = normalizarTexto(excecao);
    return regras.find((r) => normalizarTexto(r.cargoDestinatario) === norm);
  }

  const exata = regras.find((r) => candidatosDe(r).some((c) => c.nome === alvo));
  if (exata) return exata;

  const qualificacaoAlvo = qualificadoresDe(alvo);

  const porPrefixo = REGRAS_POR_PREFIXO.find((p) => p.qualificacao === qualificacaoAlvo && p.casa.test(alvo));
  const regraDoPrefixo = porPrefixo && regras.find((r) => candidatosDe(r).some((c) => c.nome === porPrefixo.cargo));
  if (regraDoPrefixo) return regraDoPrefixo;
  const pontuadas = regras
    .flatMap((r) => {
      const nomes = candidatosDe(r).filter((c) => c.qualificacao === qualificacaoAlvo);
      if (nomes.length === 0) return [];
      return [{
        regra: r,
        score: Math.max(...nomes.map((c) => stringSimilarity.compareTwoStrings(alvo, c.nome))),
      }];
    })
    .sort((a, b) => b.score - a.score);

  const [melhor, segundo] = pontuadas;
  if (!melhor || melhor.score < LIMIAR_CARGO) return undefined;
  // Candidato único não tem com o que ser confundido: nada a desempatar.
  if (segundo && melhor.score - segundo.score < MARGEM_CARGO) return undefined;
  return melhor.regra;
}

/**
 * Primeira linha do bloco de endereçamento — é só ela que o Sistema Contatos guarda na
 * célula `Endereçamento`. As linhas 2 a 4 trazem nome, cargo e órgão: descrevem como montar
 * a etiqueta, não o conteúdo do cadastro. (Decisão 1)
 */
export function linhaDeEnderecamento(enderecamento: string | undefined): string | undefined {
  const linha = (enderecamento ?? "").split("\n")[0].trim();
  return linha.length > 0 ? linha : undefined;
}

/** Palavra da família "Senhor", já sem o marcador de gênero: `Senhor`, `Senhora`, `Senhor(a)`. */
const NUCLEO_NOMINAL = /^senhor(a)?$/;

/**
 * Corta o preâmbulo de endereçamento: tudo que vem antes da palavra da família "Senhor"
 * ("A Sua Excelência o(a)", "Ao", "À", "Reverendíssimo") é fórmula de endereçamento, não
 * forma nominal. `undefined` quando a linha não tem núcleo — o caso vira `sem_regra`.
 */
function cortarPreambulo(texto: string): string | undefined {
  const tokens = texto.trim().split(/\s+/).filter(Boolean);
  const i = tokens.findIndex((t) => NUCLEO_NOMINAL.test(normalizarTexto(t).replace(/\(a\)$/, "")));
  return i === -1 ? undefined : tokens.slice(i).join(" ");
}

/**
 * Alternativas completas de uma primeira linha. O parêntese precedido de espaço troca a
 * linha **inteira**, não só a última palavra: em "Ao Senhor (À Senhora)" a forma feminina
 * muda também a contração do artigo, e tratá-la como troca de palavra produziria
 * "Ao À Senhora", reprovando um cadastro correto.
 *
 * O marcador de gênero colado — "Senhor(a)" — não é alternativa de linha e fica para
 * `expandirFormas`.
 */
function alternativasDaLinha(linha: string): string[] {
  const m = linha.match(/^(.*\S) \(([^)]+)\)$/);
  if (!m) return [linha];
  const [, antes, dentro] = m;
  return [antes, dentro];
}

/**
 * Núcleo nominal da primeira linha do endereçamento — o que a coluna `Tratamento` do
 * Sistema Contatos guarda. "A Sua Excelência o(a) Senhor(a)" → "Senhor(a)";
 * "Ao Senhor (À Senhora)" → "Senhor (Senhora)". (Decisão 2)
 *
 * O vocativo epistolar e o pronome da tabela não são auditados: a planilha não tem coluna
 * que os guarde. `undefined` quando não há núcleo, e aí o campo vira `sem_regra`.
 */
export function formaNominal(primeiraLinha: string): string | undefined {
  const nucleos = alternativasDaLinha(primeiraLinha).map(cortarPreambulo);
  const [principal, alternativa] = nucleos;
  if (principal === undefined) return undefined;
  return alternativa === undefined ? principal : `${principal} (${alternativa})`;
}

/**
 * Monta uma comparação de protocolo para um campo, dado o padrão da tabela.
 * `exibicao` é o texto que vai para a tela como `valorEsperado`; separa-se do `padrao`
 * porque a linha "Ao Senhor (À Senhora)" se compara como duas alternativas e se lê como uma.
 */
function compararCampoProtocolo(
  campo: "tratamento" | "enderecamento",
  valorPlanilha: string,
  padrao: string | undefined,
  contato: ContatoPlanilha,
  exibicao: string | undefined = padrao,
): ComparacaoCampo {
  const semRegra: ComparacaoCampo = {
    campo,
    valorPlanilha,
    situacao: "sem_regra",
    origemValor: "protocolo",
  };
  // Forma genérica é achado da Camada A. Acusá-la aqui de novo duplicaria a linha amarela
  // sobre a mesma célula, e "Senhor(a)" nunca casaria padrão nenhum.
  if (formaGenerica(valorPlanilha)) return semRegra;
  if (!padrao || padrao.trim().length === 0) return semRegra;

  const aceitas = expandirFormas(padrao, contato);
  if (aceitas.length === 0) return semRegra; // placeholder sem dado no contato

  const situacao = aceitas.includes(normalizarTexto(valorPlanilha)) ? "confere" : "divergente";
  return {
    campo,
    valorPlanilha,
    // A forma canônica da tabela orienta melhor que uma das variantes expandidas.
    valorEsperado: exibicao,
    situacao,
    origemValor: "protocolo",
  };
}

/**
 * Camada B: auditoria de protocolo de um contato. Os dois campos saem da **primeira linha**
 * do bloco de endereçamento da regra — o endereçamento contra a linha inteira (Decisão 1),
 * o tratamento contra o núcleo nominal dela (Decisão 2). O vocativo epistolar e o pronome
 * da tabela não são auditados: a planilha não tem coluna que os guarde.
 *
 * Independe do site — roda mesmo quando não há fonte oficial ou ela está inacessível.
 * Devolve sempre as duas comparações, nesta ordem, para que a cobertura seja visível:
 * `sem_regra` informa ao usuário quais cargos ainda faltam mapear.
 */
export function comparacoesProtocolo(
  contato: ContatoPlanilha,
  regras: readonly RegraTratamento[] = REGRAS_TRATAMENTO,
): ComparacaoCampo[] {
  const regra = resolverRegra(contato.cargo, regras);
  const linha = linhaDeEnderecamento(regra?.enderecamento);
  const alternativas = linha === undefined ? undefined : alternativasDaLinha(linha).join("\nou\n");
  return [
    compararCampoProtocolo(
      "tratamento",
      contato.tratamento ?? "",
      linha === undefined ? undefined : formaNominal(linha),
      contato,
    ),
    compararCampoProtocolo(
      "enderecamento",
      contato.enderecamento ?? "",
      alternativas,
      contato,
      linha,
    ),
  ];
}

// ---------------------------------------------------------------------------
// Camada A — coerência interna de `Tratamento`, `Endereçamento` e `Cargo`.
//
// Não consulta a tabela de protocolo e não depende de resolver cargo, então vale para
// todos os contatos, inclusive os que não resolvem para regra nenhuma — que, medido
// contra a planilha real, é justamente onde moram os erros de gênero.
// Ver docs/superpowers/specs/2026-09-15-auditoria-tratamento-correcao-de-alvo.md, Decisão 4.
// ---------------------------------------------------------------------------

/**
 * Formas nominais de tratamento que marcam gênero. Só palavras que **distinguem**:
 * "excelencia", "santidade" e "eminencia" valem para os dois e ficam de fora, assim como
 * os artigos, que em "A Sua Excelência o Senhor" apareceriam nos dois gêneros na mesma
 * linha. O sinal vem sempre do substantivo ou do adjetivo, nunca do artigo.
 */
const TRATAMENTOS_MASCULINOS = [
  "senhor", "excelentissimo", "ilustrissimo", "magnifico",
  "eminentissimo", "reverendissimo", "doutor", "dom",
];

const TRATAMENTOS_FEMININOS = [
  "senhora", "excelentissima", "ilustrissima", "magnifica",
  "eminentissima", "reverendissima", "doutora", "dona",
];

const generoDaForma = (valor?: string): Genero =>
  generoPorLexico(valor, TRATAMENTOS_MASCULINOS, TRATAMENTOS_FEMININOS);

/** Dois gêneros se contradizem só quando ambos são conhecidos e diferentes. */
function discordam(a: Genero, b: Genero): boolean {
  return a !== "indeterminado" && b !== "indeterminado" && a !== b;
}

function achadoDe(
  campo: "tratamento" | "enderecamento",
  valorPlanilha: string,
  achado: AchadoCoerencia,
): ComparacaoCampo {
  return {
    campo,
    valorPlanilha,
    // Sem `valorEsperado`: a contradição é entre campos do próprio contato, e apontar
    // qual dos dois está certo seria adivinhação. Quem corrige é o usuário.
    situacao: "divergente",
    origemValor: "coerencia",
    achado,
  };
}

/** Texto em português de cada achado, para a tela e para o export. */
export function rotuloAchado(achado: AchadoCoerencia): string {
  switch (achado) {
    case "genero_tratamento_enderecamento":
      return "gênero do Tratamento discorda do Endereçamento";
    case "genero_cargo_tratamento":
      return "gênero do Cargo discorda do Tratamento";
    case "forma_generica":
      return "forma genérica: falta o gênero da pessoa";
    case "campo_vazio":
      return "campo vazio";
    case "nome_tratamento_academico":
      return "nome traz tratamento acadêmico; grafar sem ele no cadastro";
    case "nome_sem_prefixo":
      return "Nome sem o prefixo do cargo";
    case "cargo_ex_presidente":
      return "Cargo de ex-presidente fora do formato do GT";
  }
}

/** A regra do prefixo no nome do presidente, como o GT a fixou (spec 2026-10-30 §3.3). */
export const EXPLICACAO_PREFIXO_NOME =
  'O Presidente de tribunal leva "Ministro(a)" antes do nome; o Presidente da República leva "Presidente" (regra do GT, 2026-10-30)';

/**
 * Rótulos de exibição dos dois campos que a Camada A audita. Moram aqui — e não em
 * `lib/export.ts` — porque `textoCoerencia` (abaixo) precisa deles e a dependência entre os
 * dois módulos só pode correr num sentido: `lib/export.ts` já importa de `lib/tratamento.ts`,
 * nunca o contrário. `lib/export.ts` reaproveita este mapa para as mesmas duas colunas do seu
 * próprio catálogo de campos, em vez de repetir os rótulos.
 */
export const ROTULOS_CAMPO_TRATAMENTO: Readonly<Record<string, string>> = {
  tratamento: "Tratamento",
  enderecamento: "Endereçamento",
};

/**
 * Texto de um achado de coerência, pronto para exibição — usado pela tela e pelo export, que
 * antes formatavam a mesma informação de dois jeitos parecidos e não idênticos. As duas
 * verificações de gênero já nomeiam os dois campos envolvidos no próprio rótulo
 * ("gênero do Cargo discorda do Tratamento"), então repetir o campo seria redundante. Forma
 * genérica e campo vazio valem para os dois campos auditados e precisam dizer qual.
 */
export function textoCoerencia(c: ComparacaoCampo): string {
  const rotulo = rotuloAchado(c.achado!);
  if (c.achado === "genero_tratamento_enderecamento" || c.achado === "genero_cargo_tratamento") {
    return rotulo;
  }
  // Camada C: o parêntese leva o nome já corrigido (não o rótulo do campo), para o
  // usuário copiar direto para o cadastro — é o que o spec pede para a coluna Coerência.
  if (c.achado === "nome_tratamento_academico") {
    return `${rotulo} (${c.valorEsperado ?? ""})`;
  }
  if (c.achado === "nome_sem_prefixo") {
    return `${rotulo} (${c.valorEsperado ?? ""}). ${EXPLICACAO_PREFIXO_NOME}`;
  }
  if (c.achado === "cargo_ex_presidente") {
    return c.observacao ? `${rotulo} (${c.valorEsperado ?? ""}). ${c.observacao}` : `${rotulo} (${c.valorEsperado ?? ""})`;
  }
  const nome = ROTULOS_CAMPO_TRATAMENTO[c.campo] ?? c.campo;
  return `${rotulo} (${nome})`;
}

/**
 * Achados da Camada A que chegam ao usuário, depois do colapso da dupla acusação sobre a
 * mesma célula (Decisão 1 da T6, Clovis 2026-09-16): quando a Camada B (ou a maioria dos pares) tem valor esperado
 * para o campo, a linha `campo_vazio` some, porque a linha do protocolo já mostra a célula
 * vazia e o texto que deveria estar nela. Sem regra aplicável (`sem_regra`) ela permanece,
 * senão a célula vazia passaria batida.
 *
 * Os demais achados nunca colapsam: gênero e forma genérica são contradições internas que a
 * Camada B não cobre, e a linha do protocolo não diz o que elas dizem.
 *
 * Apresentação apenas — `comparacoes` e `camposDivergentes` seguem intactos em `lib/match.ts`.
 */
export function coerenciasVisiveis(
  comparacoes: readonly ComparacaoCampo[],
): ComparacaoCampo[] {
  const temValorDeProtocolo = (campo: string): boolean =>
    comparacoes.some(
      (c) =>
        c.campo === campo &&
        (c.origemValor === "protocolo" || c.origemValor === "pares") &&
        c.situacao === "divergente" &&
        (c.valorEsperado ?? "").trim().length > 0,
    );

  return comparacoes.filter(
    (c) =>
      c.origemValor === "coerencia" &&
      !(c.achado === "campo_vazio" && temValorDeProtocolo(c.campo)),
  );
}

/**
 * Camada A: confronta `Tratamento`, `Endereçamento` e `Cargo` do contato entre si.
 *
 * Devolve **uma comparação por achado**, e nada quando o contato é coerente — `campo` pode
 * repetir, porque as quatro verificações recaem sobre dois campos. Não emite `confere`:
 * ausência de contradição interna não é confirmação de que o valor está certo, que é
 * assunto da Camada B e do site.
 *
 * As duas verificações de gênero são ancoradas no campo `tratamento` e nomeiam o outro
 * campo pelo `achado`, para que um achado seja uma linha só. Campo vazio é `divergente`,
 * não `sem_regra`: não falta regra para julgá-lo — célula vazia gera convite sem
 * tratamento, qualquer que seja a autoridade.
 */
export function comparacoesCoerencia(contato: ContatoPlanilha): ComparacaoCampo[] {
  const tratamento = contato.tratamento ?? "";
  const enderecamento = contato.enderecamento ?? "";
  const achados: ComparacaoCampo[] = [];

  if (estaVazio(tratamento)) {
    achados.push(achadoDe("tratamento", tratamento, "campo_vazio"));
  } else if (formaGenerica(tratamento)) {
    achados.push(achadoDe("tratamento", tratamento, "forma_generica"));
  } else {
    const genero = generoDaForma(tratamento);
    if (discordam(genero, generoDaForma(enderecamento))) {
      achados.push(achadoDe("tratamento", tratamento, "genero_tratamento_enderecamento"));
    }
    if (discordam(genero, generoDoCargo(contato.cargo))) {
      achados.push(achadoDe("tratamento", tratamento, "genero_cargo_tratamento"));
    }
  }

  if (estaVazio(enderecamento)) {
    achados.push(achadoDe("enderecamento", enderecamento, "campo_vazio"));
  } else if (formaGenerica(enderecamento)) {
    achados.push(achadoDe("enderecamento", enderecamento, "forma_generica"));
  }

  return achados;
}

// ---------------------------------------------------------------------------
// Camada C — regras de escrita do cadastro (`data/regras-nome.ts`).
//
// Ao contrário das Camadas A e B, não há referência (nem o próprio contato, nem a
// tabela de protocolo): a regra é uma decisão do GT sobre como o campo `Nome` deve
// ser ESCRITO no cadastro, e por isso pode contrariar de propósito o que o site
// publica. Ver docs/superpowers/specs/2026-09-18-regras-de-escrita-do-cadastro.md.
//
// Independe do site — como as Camadas A e B, vale nos quatro caminhos de veredito.
// ---------------------------------------------------------------------------

/** Forma comparável de um token do nome: sem acento, sem caixa, sem ponto final. */
function chaveTokenNome(token: string): string {
  return normalizarTexto(token).replace(/\.$/, "");
}

/** Algum token do nome é um tratamento proibido pela regra do grupo. */
function temTratamentoProibido(nome: string, proibidos: readonly string[]): boolean {
  const proibidosSet = new Set(proibidos);
  return nome
    .split(/\s+/)
    .some((token) => token.length > 0 && proibidosSet.has(chaveTokenNome(token)));
}

/**
 * Nome sem os tratamentos proibidos pela regra — o valor corrigido que o usuário copia
 * para o cadastro. Remove só os tokens proibidos (comparação por token inteiro, nunca
 * substring: "Drummond" não é "Dr"), preservando os demais tokens e a ordem original.
 */
function semTratamentosProibidos(nome: string, proibidos: readonly string[]): string {
  const proibidosSet = new Set(proibidos);
  return nome
    .split(/\s+/)
    .filter((token) => token.length > 0 && !proibidosSet.has(chaveTokenNome(token)))
    .join(" ");
}

/**
 * Camada C: confronta o campo `Nome` do cadastro com a regra de escrita do grupo
 * canônico, em `data/regras-nome.ts`. Sem regra cadastrada para o grupo (a maioria),
 * ou grupo canônico não resolvido, devolve `[]` — não é `sem_regra`: essa situação é
 * exclusiva de comparações com referência externa (Camada B), e aqui simplesmente não
 * há o que auditar.
 *
 * Devolve no máximo uma comparação: cadastro já limpo não gera achado.
 */
export function comparacaoRegraNome(
  contato: ContatoPlanilha,
  grupoCanonico: string | undefined,
  regras: Readonly<Record<string, RegraNome>> = REGRAS_NOME,
): ComparacaoCampo[] {
  const proibidos = (grupoCanonico ? regras[grupoCanonico] : undefined)?.tratamentosProibidos ?? [];
  if (!temTratamentoProibido(contato.nome, proibidos)) return [];
  return [
    {
      campo: "nome",
      valorPlanilha: contato.nome,
      valorEsperado: semTratamentosProibidos(contato.nome, proibidos),
      situacao: "divergente",
      origemValor: "coerencia",
      achado: "nome_tratamento_academico",
    },
  ];
}

/**
 * O contato é mulher pelo próprio cadastro: tratamento ou endereçamento no feminino
 * ("Senhora", "Excelentíssima Senhora", "a Senhora") ou cargo feminino pelo léxico de
 * cargos ("Ministra"). Forma genérica ("Senhor(a)") e cargo sem gênero ("Presidente do
 * STF") não dizem nada; sem sinal feminino, `false`.
 */
export function contatoEhFeminino(contato: ContatoPlanilha): boolean {
  return (
    generoDaForma(contato.tratamento) === "feminino" ||
    generoDaForma(contato.enderecamento) === "feminino" ||
    generoDoCargo(contato.cargo) === "feminino"
  );
}

type TipoPrefixo = NonNullable<RegraNome["prefixoDoPresidente"]>;

/** Primeiras palavras aceitas como prefixo, já normalizadas, por tipo de regra. */
const PREFIXOS_ACEITOS: Readonly<Record<TipoPrefixo, readonly string[]>> = {
  ministro: ["ministro", "ministra"],
  presidente: ["presidente"],
};

/**
 * Tratamentos que podem vir antes do prefixo e que nunca entram no esperado, na forma de
 * `chaveToken` (sem acento, sem pontuação, sem "(a)"): "Exmo. Ministro Fulano" já tem o
 * prefixo, "Dr. Fulano" vira "Ministro Fulano". Os prefixos de cargo também saem, para não
 * empilhar ("Ministro(a) Fulana" → "Ministra Fulana"). Patente não está aqui: é nome.
 */
const TRATAMENTOS_ANTES_DO_PREFIXO: ReadonlySet<string> = new Set([
  "exmo", "exma", "excelentissimo", "excelentissima", "sr", "sra", "senhor", "senhora",
  "dr", "dra", "doutor", "doutora", "ministro", "ministra", "presidente", "presidenta",
]);

/** O cargo é o de Presidente (não "Vice-Presidente", que começa com "vice"). */
function cargoDePresidente(cargo: string | undefined): boolean {
  return /^presidente\b/.test(neutralizarGenero(normalizarTexto(cargo ?? "")));
}

/**
 * O prefixo que o nome do contato deve levar, já no gênero dele ("Ministro", "Ministra",
 * "Presidente"), ou `undefined` quando a regra do grupo não vale para ele: `"ministro"` só
 * para o cargo que começa com "Presidente"; `"presidente"` para todo contato do grupo, menos
 * um "Vice-…" que caia nele.
 */
function prefixoDoContato(
  contato: ContatoPlanilha,
  regra: RegraNome | undefined,
): { tipo: TipoPrefixo; prefixo: string } | undefined {
  const tipo = regra?.prefixoDoPresidente;
  if (!tipo || /^vice\b/.test(normalizarTexto(contato.cargo ?? ""))) return undefined;
  if (tipo === "presidente") return { tipo, prefixo: "Presidente" };
  if (!cargoDePresidente(contato.cargo)) return undefined;
  return { tipo, prefixo: contatoEhFeminino(contato) ? "Ministra" : "Ministro" };
}

/**
 * Separa os tratamentos e o prefixo do início do nome: `temPrefixo` diz se o prefixo aceito
 * estava lá por extenso (a forma genérica "Ministro(a)" não conta), `nucleo` é o nome que
 * sobra, na grafia original.
 */
function separarPrefixo(nome: string, aceitos: readonly string[]): { temPrefixo: boolean; nucleo: string } {
  const tokens = nome.split(/\s+/).filter((t) => t.length > 0);
  let temPrefixo = false;
  let i = 0;
  while (i < tokens.length && TRATAMENTOS_ANTES_DO_PREFIXO.has(chaveToken(tokens[i]))) {
    if (aceitos.includes(normalizarTexto(tokens[i]).replace(/[.,;:]/g, ""))) temPrefixo = true;
    i += 1;
  }
  return { temPrefixo, nucleo: tokens.slice(i).join(" ") };
}

/**
 * O nome que o contato deve ter, a partir do nome da página (ou da IA), quando a regra do
 * prefixo vale para ele (spec 2026-10-30 §3.3): o prefixo no gênero do contato seguido do
 * nome da página sem tratamento nem prefixo ("Ministro X Z Y" para a página "X Z Y"). Sem a
 * regra, devolve o nome da página como veio. É o valor copiável da comparação de nome com a
 * composição, que assim nunca propõe tirar o prefixo.
 */
export function nomeEsperadoComPrefixo(
  contato: ContatoPlanilha,
  grupoCanonico: string | undefined,
  nomeDaPagina: string,
  regras: Readonly<Record<string, RegraNome>> = REGRAS_NOME,
): string {
  const aplicavel = prefixoDoContato(contato, grupoCanonico ? regras[grupoCanonico] : undefined);
  if (!aplicavel) return nomeDaPagina;
  const { nucleo } = separarPrefixo(nomeDaPagina, PREFIXOS_ACEITOS[aplicavel.tipo]);
  return nucleo.length > 0 ? `${aplicavel.prefixo} ${nucleo}` : nomeDaPagina;
}

/**
 * Camada C, prefixo no nome do presidente (spec 2026-10-30 §3.3). Com
 * `prefixoDoPresidente: "ministro"` (grupos de tribunal) vale só para o contato cujo cargo
 * começa com "Presidente"; com `"presidente"` (Presidente da República), para todo contato
 * do grupo (menos um "Vice-…"). Nome que já começa com o prefixo, depois de tratamentos
 * como "Exmo." (qualquer gênero de "Ministro"), não gera achado; sem ele, o nome diverge e o
 * esperado é o prefixo, no gênero do contato, seguido do nome do cadastro — sem o tratamento
 * proibido do grupo, sem "Dr."/"Exmo." no início e sem a forma genérica "Ministro(a)".
 * Nunca propõe tirar o prefixo, e nos grupos sem a regra não tem efeito.
 */
export function comparacaoPrefixoNome(
  contato: ContatoPlanilha,
  grupoCanonico: string | undefined,
  regras: Readonly<Record<string, RegraNome>> = REGRAS_NOME,
): ComparacaoCampo[] {
  const regra = grupoCanonico ? regras[grupoCanonico] : undefined;
  const aplicavel = prefixoDoContato(contato, regra);
  if (!aplicavel) return [];
  const nome = semTratamentosProibidos(contato.nome, regra?.tratamentosProibidos ?? []);
  const { temPrefixo, nucleo } = separarPrefixo(nome, PREFIXOS_ACEITOS[aplicavel.tipo]);
  if (temPrefixo || nucleo.length === 0) return [];

  return [
    {
      campo: "nome",
      valorPlanilha: contato.nome,
      valorEsperado: `${aplicavel.prefixo} ${nucleo}`,
      situacao: "divergente",
      origemValor: "coerencia",
      achado: "nome_sem_prefixo",
    },
  ];
}
