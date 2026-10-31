import { normalizarTexto } from "@/lib/normalize";
import { MARCADOR_GENERICO, neutralizarGenero } from "@/lib/cargos";
import { divergenciasDe } from "@/lib/match";
import { contatoEhFeminino } from "@/lib/tratamento";
import type { ComparacaoCampo, ResultadoContato, ResultadoGrupo } from "@/lib/types";

// ---------------------------------------------------------------------------
// Tratamento e endereçamento pela maioria dos pares (spec 2026-10-30 §3.4).
//
// Segundo degrau da Camada B: só quando a tabela de protocolo não tem regra para o cargo
// (`sem_regra`), o campo passa a ser comparado com a maioria dos outros contatos do mesmo
// grupo cujo cargo do Contatos tem o mesmo núcleo. Diferente da maioria é divergência;
// sem maioria (menos de 2 pares com valor, ou empate), continua `sem_regra`.
// ---------------------------------------------------------------------------

/** Mínimo de pares com valor para haver maioria (Ponto 4 da revisão: um par só não decide). */
const MIN_PARES = 2;

/**
 * Cargos diplomáticos: o núcleo é só a função, sem o país ou a embaixada ("Embaixadora de
 * Gana" → "embaixador"; "Encarregado de Negócios da Embaixada do Iraque" → "encarregado de
 * negocios"). A ordem importa: "consul-geral" antes de "consul".
 */
const CABECA_DIPLOMATICA = /^(embaixador|encarregado de negocios|consul-geral|consul)\b/;

/**
 * Núcleo do cargo do Contatos para achar os pares: normalizado, gênero neutralizado, sem a UF
 * ("Governador do Estado de Sergipe" → "governador do estado"; o Distrito Federal conta como
 * estado), sem o país dos diplomatas e sem o período ("… de 2019 a 2021"). O resto fica
 * inteiro, para que "Presidente do Supremo Tribunal Federal" e os convocados nunca sejam pares
 * de "Ministro do Supremo Tribunal Federal".
 */
export function nucleoDoCargo(cargo: string): string {
  const texto = neutralizarGenero(normalizarTexto(cargo)).replace(/[.,;:]+$/, "").trim();
  const diplomatico = texto.match(CABECA_DIPLOMATICA);
  if (diplomatico) return diplomatico[1];
  return texto
    .replace(/ de \d{4} a \d{4}.*$/, "")
    .replace(/\bdo (estado|distrito federal)\b.*$/, "do estado")
    .trim();
}

type GeneroAlvo = "masculino" | "feminino";

/** Palavras de tratamento que mudam com o gênero, masculino e feminino, normalizadas. */
const PALAVRAS_COM_GENERO: readonly (readonly [string, string])[] = [
  ["senhor", "senhora"],
  ["excelentissimo", "excelentissima"],
  ["ilustrissimo", "ilustrissima"],
  ["magnifico", "magnifica"],
  ["eminentissimo", "eminentissima"],
  ["reverendissimo", "reverendissima"],
  ["doutor", "doutora"],
];

/** Artigo antes da palavra trocada: "o Senhor" ↔ "a Senhora", "Ao Senhor" ↔ "À Senhora". */
const ARTIGOS: Readonly<Record<GeneroAlvo, Readonly<Record<string, string>>>> = {
  feminino: { o: "a", ao: "à" },
  masculino: { a: "o", "à": "ao" },
};

/** A letra na caixa do token: "SENHOR" → "A", "Senhor" → "a". */
function naCaixa(token: string, letra: string): string {
  return token === token.toUpperCase() && token !== token.toLowerCase() ? letra.toUpperCase() : letra;
}

/** A palavra de tratamento no gênero pedido, na grafia do token; `undefined` quando não muda. */
function palavraNoGenero(token: string, alvo: GeneroAlvo): string | undefined {
  const chave = normalizarTexto(token);
  const par = PALAVRAS_COM_GENERO.find(([m, f]) => (alvo === "feminino" ? m : f) === chave);
  if (!par) return undefined;
  const [masculino] = par;
  const terminaEmO = masculino.endsWith("o");
  if (alvo === "feminino") return terminaEmO ? `${token.slice(0, -1)}${naCaixa(token, "a")}` : `${token}${naCaixa(token, "a")}`;
  return terminaEmO ? `${token.slice(0, -1)}${naCaixa(token, "o")}` : token.slice(0, -1);
}

/** O artigo trocado, com a inicial na caixa do original. */
function artigoNoGenero(artigo: string, alvo: GeneroAlvo): string | undefined {
  const trocado = ARTIGOS[alvo][artigo.toLowerCase()];
  if (trocado === undefined) return undefined;
  return artigo[0] === artigo[0].toUpperCase() ? `${trocado[0].toUpperCase()}${trocado.slice(1)}` : trocado;
}

/** Espaços aparados e colapsados (inclusive quebras de linha). */
function colapsar(valor: string): string {
  return valor.replace(/\s+/g, " ").trim();
}

/**
 * O valor de tratamento ou endereçamento no gênero pedido: troca as palavras da família
 * "Senhor" e o artigo logo antes delas ("A Sua Excelência o Senhor" ↔ "A Sua Excelência a
 * Senhora"; "Ao Senhor" ↔ "À Senhora"). O resto fica como está.
 */
function noGenero(valor: string, alvo: GeneroAlvo): string {
  const tokens = colapsar(valor).split(" ");
  const trocados = tokens.map((t) => palavraNoGenero(t, alvo) ?? t);
  return trocados
    .map((t, i) => {
      const proximaMudou = i + 1 < tokens.length && trocados[i + 1] !== tokens[i + 1];
      return proximaMudou ? (artigoNoGenero(t, alvo) ?? t) : t;
    })
    .join(" ");
}

/** O gênero em que o valor está escrito: feminino quando tem palavra feminina da família "Senhor". */
function generoDoValor(valor: string): GeneroAlvo {
  return noGenero(valor, "masculino") === colapsar(valor) ? "masculino" : "feminino";
}

/** Caixa alta inteira ("SENHOR"): perde o desempate de grafia para a caixa normal. */
function emCaixaAlta(valor: string): boolean {
  return valor === valor.toUpperCase() && valor !== valor.toLowerCase();
}

/** Chave de comparação: normalizado, no masculino (tratamento e cargo), sem espaços dobrados. */
function chaveDoValor(valor: string): string {
  return neutralizarGenero(normalizarTexto(noGenero(valor, "masculino")));
}

export interface MaioriaDosPares {
  /** A grafia mais frequente da maioria; no empate, a que não está em caixa alta, e depois a primeira. */
  valor: string;
  /** Quantos pares usam a maioria. */
  n: number;
  /** Quantos pares têm valor. */
  m: number;
}

/**
 * Maioria entre os valores dos pares: exige `MIN_PARES` ou mais valores válidos e mais da
 * metade deles iguais, comparados com o gênero neutralizado ("Senhora" conta como "Senhor").
 * Vazio e forma genérica ("Senhor(a)", defeito que a Camada A acusa) não contam nem viram o
 * valor proposto. Empate ou um par só: `undefined`.
 */
export function maioriaDosPares(valores: readonly string[]): MaioriaDosPares | undefined {
  const preenchidos = valores.map(colapsar).filter((v) => v.length > 0 && !MARCADOR_GENERICO.test(v));
  if (preenchidos.length < MIN_PARES) return undefined;
  const porChave = new Map<string, string[]>();
  for (const v of preenchidos) {
    const chave = chaveDoValor(v);
    porChave.set(chave, [...(porChave.get(chave) ?? []), v]);
  }
  const maior = [...porChave.values()].reduce((a, b) => (b.length > a.length ? b : a));
  if (maior.length * 2 <= preenchidos.length) return undefined;
  const contagem = (g: string) => maior.filter((v) => v === g).length;
  const melhor = (a: string, b: string): string => {
    if (contagem(b) !== contagem(a)) return contagem(b) > contagem(a) ? b : a;
    return emCaixaAlta(a) && !emCaixaAlta(b) ? b : a;
  };
  const valor = maior.reduce(melhor);
  return { valor, n: maior.length, m: preenchidos.length };
}

/** Texto fixado pela spec: "Pela maioria dos pares: N de M no grupo usam <valor>". */
function observacaoDosPares(maioria: MaioriaDosPares): string {
  return `Pela maioria dos pares: ${maioria.n} de ${maioria.m} no grupo usam ${maioria.valor}`;
}

/** N e M de volta da observação dos pares (para o export); `undefined` em outra observação. */
export function contagemDosPares(observacao: string | undefined): { n: number; m: number } | undefined {
  const m = (observacao ?? "").match(/^Pela maioria dos pares: (\d+) de (\d+) no grupo usam /);
  return m ? { n: Number(m[1]), m: Number(m[2]) } : undefined;
}

type CampoProtocolo = "tratamento" | "enderecamento";

function campoDoProtocolo(c: ComparacaoCampo): CampoProtocolo | undefined {
  if (c.origemValor !== "protocolo" || c.situacao !== "sem_regra") return undefined;
  if (c.campo !== "tratamento" && c.campo !== "enderecamento") return undefined;
  // Forma genérica ("Senhor(a)") é achado da Camada A; acusá-la aqui de novo duplicaria a linha.
  return MARCADOR_GENERICO.test(c.valorPlanilha) ? undefined : c.campo;
}

/** A comparação `sem_regra` trocada pela dos pares, ou ela mesma quando não há maioria. */
function compararComPares(
  comp: ComparacaoCampo,
  campo: CampoProtocolo,
  c: ResultadoContato,
  pares: readonly ResultadoContato[],
): ComparacaoCampo {
  const maioria = maioriaDosPares(pares.map((p) => p.contato[campo] ?? ""));
  if (!maioria) return comp;
  const confere = chaveDoValor(comp.valorPlanilha) === chaveDoValor(maioria.valor);
  // Divergente: o valor a copiar sai no gênero do contato. Confere: no gênero do próprio valor do
  // cadastro, para o cartão não mostrar "a Senhora" ao lado de "o Senhor" que conferiu (o gênero
  // fica com a Camada A).
  const genero = confere ? generoDoValor(comp.valorPlanilha) : contatoEhFeminino(c.contato) ? "feminino" : "masculino";
  return {
    campo,
    valorPlanilha: comp.valorPlanilha,
    valorEsperado: noGenero(maioria.valor, genero),
    situacao: confere ? "confere" : "divergente",
    origemValor: "pares",
    observacao: observacaoDosPares(maioria),
  };
}

/**
 * O contato com os campos `sem_regra` decididos pelos pares. Divergência nova entra em
 * `camposDivergentes` e só pinta amarelo quem estava verde: vermelho, indeterminado e novo
 * ficam como estão, e `possivelSaida` nunca muda.
 */
function contatoComPares(c: ResultadoContato, pares: readonly ResultadoContato[]): ResultadoContato {
  let mudou = false;
  const comparacoes = c.comparacoes.map((comp) => {
    const campo = campoDoProtocolo(comp);
    if (!campo) return comp;
    const nova = compararComPares(comp, campo, c, pares);
    if (nova !== comp) mudou = true;
    return nova;
  });
  if (!mudou) return c;
  const novasDivergencias = divergenciasDe(comparacoes.filter((x) => x.origemValor === "pares"));
  return {
    ...c,
    comparacoes,
    camposDivergentes: [...c.camposDivergentes, ...novasDivergencias],
    semaforo: c.semaforo === "verde" && novasDivergencias.length > 0 ? "amarelo" : c.semaforo,
  };
}

/**
 * Passada por grupo (spec 2026-10-30 §3.4): em cada contato, as comparações de `tratamento` e
 * `enderecamento` que a tabela deixou `sem_regra` passam a ser julgadas pela maioria dos pares
 * (os outros contatos do grupo com o mesmo `nucleoDoCargo`), com `origemValor: "pares"` e o
 * esperado no gênero do contato. Grupo sem nenhuma mudança volta o mesmo objeto.
 */
export function aplicarPares(grupo: ResultadoGrupo): ResultadoGrupo {
  const nucleos = grupo.contatos.map((c) => nucleoDoCargo(c.contato.cargo ?? ""));
  const contatos = grupo.contatos.map((c, i) => {
    if (nucleos[i].length === 0) return c;
    const pares = grupo.contatos.filter((_, j) => j !== i && nucleos[j] === nucleos[i]);
    return pares.length < MIN_PARES ? c : contatoComPares(c, pares);
  });
  return contatos.every((c, i) => c === grupo.contatos[i]) ? grupo : { ...grupo, contatos };
}
