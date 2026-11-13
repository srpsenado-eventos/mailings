import type { CheerioAPI } from "cheerio";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import type { PessoaSite } from "@/lib/types";

/**
 * Extração por gabinete (spec 2026-11-13 §3.3, página "Quem é Quem" do STM). A página lista cada
 * ministro como "Gabinete Min <patente> <nome>" e traz, no organograma, os blocos da direção
 * ("<nome>" numa linha, "Ministra-Presidente" na seguinte). Só esses dois desenhos viram pessoa:
 * biografias, chefes de gabinete, juízes e servidores ficam de fora. Funções puras; este módulo
 * não importa `lib/scrape.ts`, que o chama de `extrairConteudo`.
 */

/** Opção da fonte: os prefixos que marcam o gabinete de um ministro e o cargo fixo de quem sai dele. */
export interface OpcoesGabinetes {
  prefixos: readonly string[];
  cargo: string;
}

/**
 * Função da direção, a linha inteira: "Ministra-Presidente", "Ministro Vice-Presidente",
 * "Ministro-Corregedor", "Ouvidor" (texto normalizado). "Juíza-Corregedora Auxiliar" e
 * "Diretor-Geral" não casam: são de servidores e juízes.
 */
const FUNCAO_DA_DIRECAO = /^(ministr[oa][- ])?(presidente|vice[- ]presidente|corregedora?|ouvidora?)$/;

/** Mínimo de partes do nome para a direção ser ligada a um gabinete pelo nome mais curto. */
const MIN_PARTES_NOME_CURTO = 2;

const compactar = (texto: string): string => texto.replace(/\s+/g, " ").trim();

/**
 * O resto do texto depois do prefixo, ou `undefined`. Sem caixa, com espaços colapsados, o
 * prefixo mais longo primeiro, e o prefixo tem que terminar numa palavra ("Gabinete Min" não
 * casa "Gabinete Ministerial"). Sem nome depois do prefixo, também `undefined`.
 */
export function nomeDepoisDoPrefixo(texto: string, prefixos: readonly string[]): string | undefined {
  const compacto = compactar(texto);
  const minusculo = compacto.toLocaleLowerCase("pt-BR");
  const ordenados = prefixos.map(compactar).sort((a, b) => b.length - a.length);
  for (const prefixo of ordenados) {
    if (!minusculo.startsWith(prefixo.toLocaleLowerCase("pt-BR"))) continue;
    if (compacto[prefixo.length] !== " ") continue;
    const nome = compacto.slice(prefixo.length + 1).trim();
    return nome || undefined;
  }
  return undefined;
}

/** Um gabinete achado: a posição do elemento em `body *` (ordem do documento) e o nome depois do prefixo. */
interface Gabinete {
  posicao: number;
  nome: string;
}

/** As posições (em `body *`) dos ancestrais de cada elemento, do mais próximo ao mais distante. */
function ancestraisPorPosicao($: CheerioAPI): (posicao: number) => number[] {
  const elementos = $("body *").toArray();
  const posicaoDe = new Map(elementos.map((el, i) => [el, i]));
  return (posicao) =>
    $(elementos[posicao])
      .parents()
      .toArray()
      .flatMap((a) => {
        const p = posicaoDe.get(a);
        return p === undefined ? [] : [p];
      });
}

/** Os elementos mais internos cujo texto começa por um prefixo (o botão, não o acordeão que o contém). */
function elementosDeGabinete(
  $: CheerioAPI,
  prefixos: readonly string[],
  ancestrais: (posicao: number) => number[],
): Gabinete[] {
  const candidatos: Gabinete[] = [];
  $("body *").each((posicao, el) => {
    const nome = nomeDepoisDoPrefixo($(el).text(), prefixos);
    if (nome) candidatos.push({ posicao, nome });
  });
  const contem = new Set(candidatos.flatMap((c) => ancestrais(c.posicao)));
  return candidatos.filter((c) => !contem.has(c.posicao));
}

/**
 * Só a primeira lista de gabinetes da página. A lista é o ancestral mais próximo que contém outro
 * gabinete. O STM repete os gabinetes no organograma, e essa cópia estava defasada em 13/11 (um
 * ministro que já saiu, três que entraram faltando): tomá-la poria quem saiu na composição.
 */
function primeiraLista(gabinetes: readonly Gabinete[], ancestrais: (posicao: number) => number[]): Gabinete[] {
  if (gabinetes.length === 0) return [];
  const ancestraisDe = gabinetes.map((g) => ancestrais(g.posicao));
  const contagem = new Map<number, number>();
  for (const lista of ancestraisDe) for (const a of lista) contagem.set(a, (contagem.get(a) ?? 0) + 1);
  const listaDe = (i: number): number | undefined => ancestraisDe[i].find((a) => (contagem.get(a) ?? 0) >= 2);
  const primeira = listaDe(0);
  return gabinetes.filter((_, i) => listaDe(i) === primeira);
}

interface Direcao {
  nome: string;
  cargo: string;
}

/** Blocos "nome numa linha, função da direção na seguinte", na ordem da página. */
function blocosDaDirecao($: CheerioAPI): Direcao[] {
  const blocos: Direcao[] = [];
  $("body *").each((_, el) => {
    const linha = $(el);
    if (linha.children().length > 0) return;
    const seguinte = linha.next();
    if (seguinte.length === 0 || seguinte.children().length > 0) return;
    const cargo = compactar(seguinte.text());
    const nome = compactar(linha.text());
    if (!FUNCAO_DA_DIRECAO.test(normalizarTexto(cargo))) return;
    if (normalizarNome(nome).split(" ").filter(Boolean).length < MIN_PARTES_NOME_CURTO) return;
    blocos.push({ nome, cargo });
  });
  return blocos;
}

/** As partes de `curto` aparecem em `longo`, na ordem (nome igual ou com prenomes a menos). */
function mesmaPessoa(curto: string, longo: string): boolean {
  const partes = normalizarNome(curto).split(" ").filter(Boolean);
  const alvo = normalizarNome(longo).split(" ").filter(Boolean);
  if (partes.length < MIN_PARTES_NOME_CURTO) return false;
  let j = 0;
  for (const parte of alvo) if (parte === partes[j]) j += 1;
  return j === partes.length;
}

/**
 * Pessoas da página por gabinete. Cada gabinete da primeira lista vira uma pessoa com o nome como
 * a página o escreve depois do prefixo (patente e "Dr./Dra." incluídos) e o `cargo` fixo. Bloco
 * da direção que reconhece exatamente um gabinete (`mesmaPessoa`) só lhe dá a função como cargo,
 * a primeira na ordem da página ("Vice-Presidente" antes de "Corregedor", quando é a mesma
 * pessoa); o nome fica o do gabinete. Bloco que não reconhece nenhum entra como pessoa própria;
 * o que reconhece mais de um é ambíguo e não muda nada. Nome repetido entra uma vez. A `url`
 * fica na assinatura por simetria com os outros extratores.
 */
export function extrairPorGabinetes($: CheerioAPI, _url: string, opcoes: OpcoesGabinetes): PessoaSite[] {
  const vistos = new Set<string>();
  const ancestrais = ancestraisPorPosicao($);
  const doGabinete = primeiraLista(elementosDeGabinete($, opcoes.prefixos, ancestrais), ancestrais).filter((g) => {
    const chave = normalizarNome(g.nome);
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
  const cargos = new Map<number, string>();
  const avulsas: PessoaSite[] = [];
  for (const bloco of blocosDaDirecao($)) {
    const reconhecidos = doGabinete.flatMap((g, i) => (mesmaPessoa(bloco.nome, g.nome) ? [i] : []));
    if (reconhecidos.length === 1) {
      if (!cargos.has(reconhecidos[0])) cargos.set(reconhecidos[0], bloco.cargo);
      continue;
    }
    if (reconhecidos.length > 1) continue;
    const jaAvulsa = avulsas.some((p) => mesmaPessoa(bloco.nome, p.nome) || mesmaPessoa(p.nome, bloco.nome));
    if (!jaAvulsa) avulsas.push({ nome: bloco.nome, cargo: bloco.cargo, origem: "pagina" });
  }
  return [
    ...doGabinete.map((g, i): PessoaSite => ({ nome: g.nome, cargo: cargos.get(i) ?? opcoes.cargo, origem: "pagina" })),
    ...avulsas,
  ];
}
