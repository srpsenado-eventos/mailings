import { chaveToken, normalizarTexto } from "@/lib/normalize";
import { REGRAS_NOME, type RegraNome } from "@/data/regras-nome";
import { neutralizarGenero } from "@/lib/cargos";
import { contatoEhFeminino, semTratamentosProibidos, temTratamentoProibido } from "@/lib/tratamento";
import type { ComparacaoCampo, ContatoPlanilha } from "@/lib/types";

type TipoPrefixo = NonNullable<RegraNome["prefixoDoPresidente"]>;

/** Primeiras palavras aceitas como prefixo, já normalizadas, por tipo de regra. */
const PREFIXOS_ACEITOS: Readonly<Record<TipoPrefixo, readonly string[]>> = {
  ministro: ["ministro", "ministra"],
  presidente: ["presidente"],
  deputado_federal: ["deputado federal", "deputada federal"],
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
  "deputado", "deputada",
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
  const feminino = contatoEhFeminino(contato);
  if (tipo === "deputado_federal") return { tipo, prefixo: feminino ? "Deputada Federal" : "Deputado Federal" };
  return { tipo, prefixo: feminino ? "Ministra" : "Ministro" };
}

/**
 * Separa os tratamentos e o prefixo do início do nome: `temPrefixo` diz se o prefixo aceito
 * estava lá por extenso (a forma genérica "Ministro(a)" não conta), `nucleo` é o nome que
 * sobra, na grafia original.
 */
function separarPrefixo(nome: string, aceitos: readonly string[]): { temPrefixo: boolean; nucleo: string } {
  const tokens = nome.split(/\s+/).filter((t) => t.length > 0);
  const limpo = (t: string | undefined): string => normalizarTexto(t ?? "").replace(/[.,;:]/g, "");
  let temPrefixo = false;
  let i = 0;
  while (i < tokens.length) {
    // "federal" nunca é consumido sozinho: só como segundo token de um prefixo aceito ("deputado federal").
    if (aceitos.includes(`${limpo(tokens[i])} ${limpo(tokens[i + 1])}`)) {
      temPrefixo = true;
      i += 2;
      continue;
    }
    if (!TRATAMENTOS_ANTES_DO_PREFIXO.has(chaveToken(tokens[i]))) break;
    if (aceitos.includes(limpo(tokens[i]))) temPrefixo = true;
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
  // Quando a regra do prefixo vale para o contato, o esperado já leva o prefixo: uma sugestão só,
  // a mesma do achado `nome_sem_prefixo`.
  const semTratamento = semTratamentosProibidos(contato.nome, proibidos);
  return [
    {
      campo: "nome",
      valorPlanilha: contato.nome,
      valorEsperado: nomeEsperadoComPrefixo(contato, grupoCanonico, semTratamento, regras),
      situacao: "divergente",
      origemValor: "coerencia",
      achado: "nome_tratamento_academico",
    },
  ];
}
