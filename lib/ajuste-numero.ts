import * as XLSX from "xlsx";
import { LIMITE_NUMERO } from "@/lib/endereco";
import { normalizarTexto } from "@/lib/normalize";
import { ColunaFaltanteError } from "@/lib/planilha";
import type { BaseEnderecos, CelulaBase, ResultadoGrupo } from "@/lib/types";

/**
 * Ajuste do campo Número acima de 6 caracteres para a carga do PRODASEN
 * (spec 2026-10-06). Porte literal de `numero_mais_de_6.py` (rodada de 05/10/2026).
 */

const ABREVIACAO: Record<string, string> = {
  lote: "LT", lotes: "LT", casa: "CS", chacara: "CH", "chácara": "CH", bloco: "BL",
};

const OBSERVACAO_BLOCO = "Valor novo desde 23/09: Bloco não é número; conferir se BL A é aceito ou se vira S/N";

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const FUSO = "America/Sao_Paulo";

const CABECALHO_AJUSTES = [
  "Contato Id", "Endereço Id", "Tratamento", "Nome", "Logradouro", "Número ATUAL", "Caracteres (atual)",
  "Número PROPOSTO", "Caracteres (proposto)", "Observação", "Complemento", "Bairro", "Cidade", "UF", "CEP", "Grupo na Posse",
] as const;
const CABECALHO_DE_PARA = ["Número ATUAL", "Número PROPOSTO", "Qtd de endereços"] as const;
const CABECALHO_SEM_PROPOSTA = ["Contato Id", "Endereço Id", "Nome", "Número ATUAL"] as const;

const PADRAO_NUMERO = /^(lotes?|casa|ch[aá]cara|bloco)\s*(.+)$/i;

/** Proposta para um Número que passa do limite; `undefined` quando a regra não resolve. */
export function proporNumero(numero: string): string | undefined {
  const m = PADRAO_NUMERO.exec(numero.trim());
  if (!m) return undefined;
  const sigla = ABREVIACAO[m[1].toLowerCase()];
  let resto = m[2].trim().replace(/\s*[,/]\s*/g, "/");
  let proposta = `${sigla} ${resto}`;
  if (proposta.length > LIMITE_NUMERO) {
    resto = resto.split("/").map((p) => p.replace(/^0+/, "") || "0").join("/");
    proposta = `${sigla} ${resto}`;
  }
  if (proposta.length > LIMITE_NUMERO) proposta = `${sigla}${resto}`;
  return proposta;
}

/** Texto da célula, sem espaços nas pontas; vazio para null. */
export function textoCelula(valor: CelulaBase): string {
  return valor === null ? "" : String(valor).trim();
}

export interface ColunasDaBase {
  contatoId: number;
  enderecoId: number;
  tratamento: number;
  nome: number;
  logradouro: number;
  numero: number;
  complemento: number;
  bairro: number;
  cidade: number;
  uf: number;
  cep: number;
  prioritario: number;
}

const ROTULOS_COLUNAS: Record<keyof ColunasDaBase, string> = {
  contatoId: "contato id", enderecoId: "endereco id", tratamento: "tratamento", nome: "nome",
  logradouro: "logradouro", numero: "numero", complemento: "complemento", bairro: "bairro",
  cidade: "cidade", uf: "uf", cep: "cep", prioritario: "prioritario",
};
const OBRIGATORIAS: (keyof ColunasDaBase)[] = ["contatoId", "enderecoId", "numero"];

/** Posição de cada coluna da base pelo cabeçalho normalizado; -1 quando ausente (só as obrigatórias lançam). */
export function colunasDaBase(cabecalho: readonly string[]): ColunasDaBase {
  const normalizado = cabecalho.map((c) => normalizarTexto(c));
  const colunas = Object.fromEntries(
    (Object.keys(ROTULOS_COLUNAS) as (keyof ColunasDaBase)[]).map((k) => [k, normalizado.indexOf(ROTULOS_COLUNAS[k])]),
  ) as unknown as ColunasDaBase;
  const faltantes = OBRIGATORIAS.filter((k) => colunas[k] < 0).map((k) => ROTULOS_COLUNAS[k]);
  if (faltantes.length > 0) throw new ColunaFaltanteError(faltantes);
  return colunas;
}

export interface CasoAjuste {
  contatoId: CelulaBase;
  enderecoId: CelulaBase;
  tratamento: CelulaBase;
  nome: string;
  logradouro: CelulaBase;
  numeroAtual: string;
  numeroProposto: string;
  observacao: string;
  complemento: CelulaBase;
  bairro: CelulaBase;
  cidade: CelulaBase;
  uf: CelulaBase;
  cep: string;
  grupos: string[];
}

export interface CasoSemProposta {
  contatoId: CelulaBase;
  enderecoId: CelulaBase;
  nome: string;
  numeroAtual: string;
}

export interface AjusteNumero {
  casos: CasoAjuste[];
  semProposta: CasoSemProposta[];
  /** Endereços na base inteira. */
  enderecos: number;
  /** Contato Id distintos entre os casos. */
  contatos: number;
}

/** Endereços com Número acima do limite, com proposta (`casos`) e sem ela (`semProposta`). */
export function montarAjusteNumero(base: BaseEnderecos, gruposPorContato: ReadonlyMap<string, string[]>): AjusteNumero {
  const c = colunasDaBase(base.cabecalho);
  const celula = (l: CelulaBase[], i: number): CelulaBase => (i < 0 ? null : (l[i] ?? null));
  const casos: CasoAjuste[] = [];
  const semProposta: CasoSemProposta[] = [];

  for (const l of base.linhas) {
    const numeroAtual = textoCelula(celula(l, c.numero));
    if (numeroAtual.length <= LIMITE_NUMERO) continue;
    const nome = textoCelula(celula(l, c.nome));
    const contatoId = celula(l, c.contatoId);
    const enderecoId = celula(l, c.enderecoId);
    const numeroProposto = proporNumero(numeroAtual);
    if (numeroProposto === undefined) {
      semProposta.push({ contatoId, enderecoId, nome, numeroAtual });
      continue;
    }
    casos.push({
      contatoId, enderecoId, tratamento: celula(l, c.tratamento), nome,
      logradouro: celula(l, c.logradouro), numeroAtual, numeroProposto,
      observacao: numeroAtual.toLowerCase().startsWith("bloco") ? OBSERVACAO_BLOCO : "",
      complemento: celula(l, c.complemento), bairro: celula(l, c.bairro), cidade: celula(l, c.cidade),
      uf: celula(l, c.uf), cep: textoCelula(celula(l, c.cep)),
      grupos: [...(gruposPorContato.get(textoCelula(contatoId)) ?? [])],
    });
  }

  const ordenados = [...casos].sort((a, b) => {
    const x = a.nome.toLowerCase();
    const y = b.nome.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const contatos = new Set(ordenados.map((k) => textoCelula(k.contatoId))).size;
  return { casos: ordenados, semProposta, enderecos: base.linhas.length, contatos };
}

function partesDaData(iso: string): { dia: string; mes: number; ano: string } {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" })
    .formatToParts(new Date(iso));
  const valor = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? "";
  return { dia: valor("day"), mes: Number(valor("month")), ano: valor("year") };
}

/** Sufixo `<DD><MÊS><AAAA>` da data em Brasília, como `05OUT2026`. */
export function sufixoDaData(iso: string): string {
  const { dia, mes, ano } = partesDaData(iso);
  return `${dia}${MESES[mes - 1]}${ano}`;
}

function dataBrasileira(iso: string): string {
  const { dia, mes, ano } = partesDaData(iso);
  return `${dia}/${String(mes).padStart(2, "0")}/${ano}`;
}

export function nomesArquivosProdasen(iso: string): { carga: string; ajustes: string } {
  const sufixo = sufixoDaData(iso);
  return {
    carga: `BASE DE ENDERECO - ${sufixo} - carga PRODASEN.xlsx`,
    ajustes: `Numero mais de 6 caracteres - ajustes ${sufixo}.xlsx`,
  };
}

function escreverXlsx(abas: readonly (readonly [string, unknown[][]])[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [nome, linhas] of abas) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nome);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

/** Base inteira no layout de carga, com só o Número trocado nos endereços ajustados. */
export function gerarXlsxCarga(base: BaseEnderecos, ajuste: AjusteNumero): ArrayBuffer {
  const c = colunasDaBase(base.cabecalho);
  // Endereço sem Id não é chave: a proposta não pode cair em toda linha sem Id.
  const novo = new Map(ajuste.casos.map((k) => [textoCelula(k.enderecoId), k.numeroProposto] as const).filter(([id]) => id !== ""));
  const linhas = base.linhas.map((l) => {
    const id = textoCelula(l[c.enderecoId] ?? null);
    const proposta = id === "" ? undefined : novo.get(id);
    return proposta === undefined ? [...l] : l.map((v, i) => (i === c.numero ? proposta : v));
  });
  return escreverXlsx([["Folha1", [[...base.cabecalho], ...linhas]]]);
}

function abaResumo(ajuste: AjusteNumero, meta: { fonte: string; geradoEm: string }, pares: number): unknown[][] {
  const aindaPassam = ajuste.casos.filter((k) => k.numeroProposto.length > LIMITE_NUMERO).length;
  return [
    [`Número do endereço com mais de ${LIMITE_NUMERO} caracteres: rodada de ${dataBrasileira(meta.geradoEm)}`, null],
    [null, null],
    ["Fonte", meta.fonte],
    [null, null],
    ["Indicador", "Qtd"],
    ["Endereços na base", ajuste.enderecos],
    ["Endereços com Número acima de 6 caracteres", ajuste.casos.length],
    ["Usuários (Contato Id distintos) afetados", ajuste.contatos],
    ["Valores distintos a trocar (aba De-Para)", pares],
    ["Propostos que ainda passam de 6", aindaPassam],
    ["Casos sem proposta automática", ajuste.semProposta.length],
    [null, null],
    ["Regra (a mesma validada em 23/09; o campo aceita letras e barra)", null],
    ["Lote → LT, Casa → CS, Chácara → CH, Bloco → BL.", null],
    ["Se ainda passar de 6: tira zeros à esquerda (05/06 → 5/6) e, por último, o espaço (LT 9/10 → LT9/10).", null],
    ['"Lotes 1, 2" e "Lotes 1/2" viram "LT 1/2".', null],
    ["A aba Ajustes traz um endereço por linha, com o usuário; a aba De-Para serve para localizar/substituir em lote.", null],
    ["O arquivo de carga traz a base inteira com só o campo Numero alterado nestes endereços.", null],
  ];
}

/** Planilha de ajustes (Resumo, Ajustes, De-Para, Sem proposta), só com valores. */
export function gerarXlsxAjustes(ajuste: AjusteNumero, meta: { fonte: string; geradoEm: string }): ArrayBuffer {
  const quantidade = new Map<string, { atual: string; proposto: string; qtd: number }>();
  for (const k of ajuste.casos) {
    const chave = `${k.numeroAtual}\u0000${k.numeroProposto}`;
    const existente = quantidade.get(chave);
    quantidade.set(chave, { atual: k.numeroAtual, proposto: k.numeroProposto, qtd: (existente?.qtd ?? 0) + 1 });
  }
  const pares = [...quantidade.values()].sort((a, b) => (a.atual < b.atual ? -1 : a.atual > b.atual ? 1 : 0));

  const ajustes = ajuste.casos.map((k) => [
    k.contatoId, k.enderecoId, k.tratamento, k.nome, k.logradouro, k.numeroAtual, k.numeroAtual.length,
    k.numeroProposto, k.numeroProposto.length, k.observacao || null, k.complemento, k.bairro, k.cidade, k.uf, k.cep,
    k.grupos.join("; ") || null,
  ]);

  return escreverXlsx([
    ["Resumo", abaResumo(ajuste, meta, pares.length)],
    ["Ajustes", [[...CABECALHO_AJUSTES], ...ajustes]],
    ["De-Para", [[...CABECALHO_DE_PARA], ...pares.map((p) => [p.atual, p.proposto, p.qtd])]],
    ["Sem proposta", [[...CABECALHO_SEM_PROPOSTA], ...ajuste.semProposta.map((s) => [s.contatoId, s.enderecoId, s.nome, s.numeroAtual])]],
  ]);
}

/** Grupos da Posse de cada contato do retrato, por Contato Id (texto), sem repetir grupo. */
export function gruposPorContatoDoRetrato(grupos: readonly ResultadoGrupo[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const g of grupos) {
    for (const k of g.contatos) {
      const id = k.contato.id;
      if (id === undefined || id === "") continue;
      const atuais = mapa.get(id) ?? [];
      if (!atuais.includes(g.grupo)) mapa.set(id, [...atuais, g.grupo]);
    }
  }
  return mapa;
}
