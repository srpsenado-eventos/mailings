import stringSimilarity from "string-similarity";
import { normalizarTexto } from "@/lib/normalize";
import { REGRAS_TRATAMENTO } from "@/data/tratamentos";
import { EXCECOES_CARGO } from "@/data/cargos-tratamento";
import { CARGOS_FEMININOS, CARGOS_MASCULINOS } from "@/lib/cargos";
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

/** Abaixo disso o cargo é considerado não correspondente — vira `sem_regra`. */
const LIMIAR_CARGO = 0.6;

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

/**
 * Resolve o `Cargo` livre da planilha para uma entrada da tabela de protocolo.
 * Ordem: exceção manual → casamento exato normalizado → similaridade acima do limiar.
 * Nada correspondendo devolve `undefined` — o chamador marca `sem_regra`.
 */
export function resolverRegra(
  cargo?: string,
  regras: readonly RegraTratamento[] = REGRAS_TRATAMENTO,
  excecoes: Readonly<Record<string, string>> = EXCECOES_CARGO,
): RegraTratamento | undefined {
  if (!cargo) return undefined;
  const alvo = normalizarTexto(cargo);
  if (alvo.length === 0) return undefined;

  // `typeof` protege de chaves herdadas do prototype ("constructor", "toString").
  const excecao = excecoes[alvo];
  if (typeof excecao === "string" && excecao.length > 0) {
    const norm = normalizarTexto(excecao);
    return regras.find((r) => normalizarTexto(r.cargoDestinatario) === norm);
  }

  const exata = regras.find((r) =>
    nomesCandidatos(r).some((n) => normalizarTexto(n) === alvo),
  );
  if (exata) return exata;

  const pontuadas = regras.map((r) => ({
    regra: r,
    score: Math.max(
      ...nomesCandidatos(r).map((n) => stringSimilarity.compareTwoStrings(alvo, normalizarTexto(n))),
    ),
  }));
  const melhor = pontuadas.sort((a, b) => b.score - a.score)[0];
  return melhor && melhor.score >= LIMIAR_CARGO ? melhor.regra : undefined;
}

/** Monta uma comparação de protocolo para um campo, dado o padrão da tabela. */
function compararCampoProtocolo(
  campo: "tratamento" | "enderecamento",
  valorPlanilha: string,
  padrao: string | undefined,
  contato: ContatoPlanilha,
): ComparacaoCampo {
  const semRegra: ComparacaoCampo = {
    campo,
    valorPlanilha,
    situacao: "sem_regra",
    origemValor: "protocolo",
  };
  if (!padrao || padrao.trim().length === 0) return semRegra;

  const aceitas = expandirFormas(padrao, contato);
  if (aceitas.length === 0) return semRegra; // placeholder sem dado no contato

  const situacao = aceitas.includes(normalizarTexto(valorPlanilha)) ? "confere" : "divergente";
  return {
    campo,
    valorPlanilha,
    // A forma canônica da tabela orienta melhor que uma das variantes expandidas.
    valorEsperado: padrao,
    situacao,
    origemValor: "protocolo",
  };
}

/**
 * Auditoria de protocolo de um contato: tratamento (↔ vocativo epistolar) e endereçamento.
 * Independe do site — roda mesmo quando não há fonte oficial ou ela está inacessível.
 * Devolve sempre as duas comparações, nesta ordem, para que a cobertura seja visível:
 * `sem_regra` informa ao usuário quais cargos ainda faltam mapear.
 */
export function comparacoesProtocolo(
  contato: ContatoPlanilha,
  regras: readonly RegraTratamento[] = REGRAS_TRATAMENTO,
): ComparacaoCampo[] {
  const regra = resolverRegra(contato.cargo, regras);
  return [
    compararCampoProtocolo("tratamento", contato.tratamento ?? "", regra?.vocativo, contato),
    compararCampoProtocolo("enderecamento", contato.enderecamento ?? "", regra?.enderecamento, contato),
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

type Genero = "masculino" | "feminino" | "indeterminado";

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

/** Marcador de forma genérica: `(a)`, `(o)`, `(as)`, `(os)` em qualquer posição. */
const MARCADOR_GENERICO = /\((?:a|o|as|os)\)/i;

function estaVazio(valor: string | undefined): boolean {
  return (valor ?? "").trim().length === 0;
}

/**
 * Forma que não compromete o gênero — "Senhor(a)", "A(o) Senhor(a)". Convite, cartão e
 * cinta não podem sair assim, então é achado por si só.
 */
function formaGenerica(valor: string | undefined): boolean {
  return MARCADOR_GENERICO.test(valor ?? "");
}

/**
 * Gênero de um texto pelo léxico recebido. Separa em palavras quebrando também no hífen,
 * para que "advogado-geral" entregue "advogado".
 *
 * Devolve `indeterminado` — que nunca vira acusação — em três casos: nenhuma palavra do
 * léxico, palavras dos dois gêneros no mesmo texto (sinal ambíguo é sinal nenhum), ou
 * forma genérica, cujo "Senhor(a)" traz "senhor" sem de fato afirmar o masculino.
 */
function generoPorLexico(
  valor: string | undefined,
  masculinos: readonly string[],
  femininos: readonly string[],
): Genero {
  if (estaVazio(valor) || formaGenerica(valor)) return "indeterminado";
  const palavras = new Set(normalizarTexto(valor ?? "").split(/[^a-z]+/).filter(Boolean));
  const temMasculino = masculinos.some((p) => palavras.has(p));
  const temFeminino = femininos.some((p) => palavras.has(p));
  if (temMasculino === temFeminino) return "indeterminado";
  return temMasculino ? "masculino" : "feminino";
}

const generoDaForma = (valor?: string): Genero =>
  generoPorLexico(valor, TRATAMENTOS_MASCULINOS, TRATAMENTOS_FEMININOS);

const generoDoCargo = (valor?: string): Genero =>
  generoPorLexico(valor, CARGOS_MASCULINOS, CARGOS_FEMININOS);

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
  }
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
