import { GRUPOS_DE_TRIBUNAL } from "@/data/cargos-tribunal";

/**
 * Regras de escrita do campo `Nome` do cadastro, por grupo canônico (Camada C).
 *
 * Diferente da Camada A (coerência interna do contato) e da Camada B (conformidade
 * com a tabela de protocolo), esta camada não confronta o cadastro com nenhuma
 * referência externa — nem o site, nem a tabela de protocolo. Ela verifica se o
 * campo foi ESCRITO como o GT Gestão de Convidados determinou, e por isso pode
 * contrariar de propósito o que o site publica. Ver
 * docs/superpowers/specs/2026-09-18-regras-de-escrita-do-cadastro.md.
 *
 * Cada entrada é decisão do GT, nunca inferência automática ou generalização por
 * conta própria. Esta primeira vem do e-mail de orientação de 2026-07-20: convite,
 * cartão e cinta da Posse Presidencial 2027 saem deste cadastro, e os ministros do
 * STM não podem levar tratamento acadêmico ("Dr.", "Dra.") no nome. O e-mail não se
 * pronunciou sobre outros grupos nem sobre outros tratamentos — não ampliar por
 * conta própria. Patente militar ("Coronel Tadeu Silva") é nome parlamentar, não
 * tratamento a apagar, e não é afetada por esta regra.
 *
 * A segunda é decisão do Clovis de 2026-10-30 (spec 2026-10-30 §3.3): o Presidente de
 * tribunal leva "Ministro(a)" antes do nome e o Presidente da República leva
 * "Presidente". Presidente do Senado e da Câmara ficam fora.
 *
 * Chave: nome do grupo exatamente como cadastrado em `data/catalogo.ts`
 * (`GrupoCatalogo.nome`) — o grupo CANÔNICO, nunca o rótulo cru da coluna `Grupo`
 * da planilha, que pode ser um apelido ou vir com vários grupos colados por ";".
 */
export interface RegraNome {
  /**
   * Tokens de tratamento acadêmico proibidos no campo `Nome`, já normalizados
   * (sem acento, sem caixa, sem ponto final) — o formato que `normalizarTexto`
   * produz para uma palavra isolada.
   */
  tratamentosProibidos?: readonly string[];
  /**
   * Prefixo que o nome do presidente leva no cadastro (spec 2026-10-30 §3.3, decisão 3 do
   * Clovis). `"ministro"`: o contato cujo cargo começa com "Presidente" (o Presidente do
   * tribunal, nunca o Vice) leva "Ministro " ou "Ministra " antes do nome, no gênero do
   * contato. `"presidente"`: todo contato do grupo leva "Presidente " antes do nome. O app
   * nunca propõe tirar o prefixo; a comparação com a página já o ignora (`normalizarNome`).
   */
  prefixoDoPresidente?: "ministro" | "presidente";
}

/** Os 6 grupos de tribunal: o Presidente leva "Ministro(a)" no nome. */
const PREFIXO_NOS_TRIBUNAIS: Readonly<Record<string, RegraNome>> = Object.fromEntries(
  GRUPOS_DE_TRIBUNAL.map((grupo): [string, RegraNome] => [grupo, { prefixoDoPresidente: "ministro" }]),
);

export const REGRAS_NOME: Readonly<Record<string, RegraNome>> = {
  ...PREFIXO_NOS_TRIBUNAIS,
  "Ministros do STM": {
    tratamentosProibidos: ["dr", "dra", "doutor", "doutora"],
    prefixoDoPresidente: "ministro",
  },
  // O nome é "Presidente Luís Inácio Lula da Silva": o prefixo é regra, não erro (GT, 2026-10-30).
  "Presidente da República": { prefixoDoPresidente: "presidente" },
};
