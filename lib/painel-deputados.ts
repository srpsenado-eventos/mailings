import { ORIENTACAO_OUTRA_CASA, RESUMO_NAO_ELEITO } from "@/lib/eleitos";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import type { Etiqueta } from "@/lib/painel";
import type { DeputadoAtual, EleitoClassificado, ResultadoEleicao } from "@/lib/types";

/**
 * Grupo "Deputados Federais" montado na tela a partir da planilha da Câmara (spec 2026-10-12 §3),
 * enquanto o grupo não existe no Contatos. Não é auditoria: não entra no resumo nem no semáforo.
 */
export const NOME_GRUPO_DEPUTADOS = "Deputados Federais";
const AVISO = "Planilha da Câmara: o grupo ainda não está no Contatos";
const PROJECAO: Etiqueta = { campo: "eleicao", texto: "Projeção — aguarda TSE", tom: "neutro", explicacao: "O TSE ainda não homologou os eleitos desta UF; a lista segue a projeção da imprensa" };

export interface LinhaDeputado { nome: string; nomeCivil: string; uf: string; partido?: string; condicao?: string; etiquetas: Etiqueta[] }
export interface GrupoDeputados { titulo: string; aviso: string; atuais: LinhaDeputado[]; aCadastrar: EleitoClassificado[]; totalAtuais: number }

const EXPLICACAO_COLUNA = "Coluna Eleição 2026 da planilha da Câmara";
const reeleito: Etiqueta = { campo: "eleicao", texto: "Reeleito", tom: "ok", explicacao: "Reeleito em 04/10/2026: fica neste grupo" };
const ETIQUETA_GOVERNADOR: Etiqueta = { campo: "eleicao", texto: "Eleito governador — atenção", tom: "atencao", explicacao: ORIENTACAO_OUTRA_CASA };
/** Resumo calculado pelo app para o `deputado.xls` (spec 2026-10-30 §4.2): "não reeleito" e "não concorreu" juntos. */
const NAO_ELEITO: Etiqueta = {
  campo: "eleicao", texto: RESUMO_NAO_ELEITO, tom: "neutro",
  explicacao: "Não está nas planilhas de eleitos de 2026 (não reeleito ou não concorreu)",
};

export function etiquetasDoDeputado(resumo: string | undefined): Etiqueta[] {
  const bruto = (resumo ?? "").trim();
  if (bruto === "") return [];
  const r = normalizarTexto(bruto);
  if (r === "reeleito deputado federal") return [reeleito];
  if (r === "reeleito deputado federal (projecao)") return [reeleito, PROJECAO];
  if (r === "eleito senador") return [{ campo: "eleicao", texto: "Eleito senador — atenção", tom: "atencao", explicacao: ORIENTACAO_OUTRA_CASA }];
  if (r === "eleito governador") return [ETIQUETA_GOVERNADOR];
  if (r === normalizarTexto(RESUMO_NAO_ELEITO)) return [NAO_ELEITO];
  if (r.startsWith("concorreu e nao se elegeu")) return [{ campo: "eleicao", texto: "Não reeleito / aguarda definição", tom: "neutro", explicacao: EXPLICACAO_COLUNA }];
  if (r === "nao concorreu em 2026") return [{ campo: "eleicao", texto: "Não concorreu", tom: "neutro", explicacao: EXPLICACAO_COLUNA }];
  return [{ campo: "eleicao", texto: bruto, tom: "neutro", explicacao: EXPLICACAO_COLUNA }];
}

export function temGrupoDeputados(eleicao: ResultadoEleicao | undefined): boolean {
  return (eleicao?.deputadosAtuais?.length ?? 0) > 0 && !eleicao?.camaraNoContatos;
}

const casaBusca = (valores: readonly (string | undefined)[], b: string) =>
  b === "" || valores.some((v) => v !== undefined && normalizarTexto(v).includes(b));

const chaveGovernador = (uf: string, nome: string) => `${uf}|${normalizarNome(nome)}`;

/** O eixo de governadores e o resumo da eleição podem apontar o mesmo governador: a etiqueta sai uma vez. */
function etiquetasDaLinha(d: DeputadoAtual, eleitosGovernador: ReadonlySet<string>): Etiqueta[] {
  const doResumo = etiquetasDoDeputado(d.eleicao2026);
  const governador = eleitosGovernador.has(chaveGovernador(d.uf, d.nomeParlamentar))
    && !doResumo.some((e) => e.texto === ETIQUETA_GOVERNADOR.texto);
  return governador ? [...doResumo, ETIQUETA_GOVERNADOR] : doResumo;
}

const linha = (d: DeputadoAtual, eleitosGovernador: ReadonlySet<string>): LinhaDeputado => ({
  nome: d.nomeParlamentar, nomeCivil: d.nomeCivil, uf: d.uf,
  ...(d.partido ? { partido: d.partido } : {}), ...(d.condicao ? { condicao: d.condicao } : {}),
  etiquetas: etiquetasDaLinha(d, eleitosGovernador),
});

/** Quais linhas cada filtro deixa passar. Filtro fora desta tabela (situação do Contatos) esconde o grupo. */
const FILTRO: Record<string, { atual: (l: LinhaDeputado) => boolean; novos: boolean }> = {
  tudo: { atual: () => true, novos: true },
  reeleitos: { atual: (l) => l.etiquetas.some((e) => e.texto === "Reeleito"), novos: false },
  outra_casa: { atual: (l) => l.etiquetas.some((e) => e.tom === "atencao"), novos: false },
  a_cadastrar: { atual: () => false, novos: true },
};

export function grupoDeputados(
  eleicao: ResultadoEleicao | undefined,
  { busca, filtro, grupo }: { busca: string; filtro: string; grupo: string },
): GrupoDeputados | undefined {
  if (!eleicao || !temGrupoDeputados(eleicao)) return undefined;
  if (grupo !== "" && grupo !== NOME_GRUPO_DEPUTADOS) return undefined;
  const regra = FILTRO[filtro];
  if (!regra) return undefined;
  const b = normalizarTexto(busca.trim());
  const eleitosGovernador = new Set(
    (eleicao.governadores?.eleitos ?? []).flatMap((g) => (g.deputadoAtual ? [chaveGovernador(g.deputadoAtual.uf, g.deputadoAtual.nomeParlamentar)] : [])),
  );
  const todos = [...(eleicao.deputadosAtuais ?? [])]
    .sort((a, c) => a.uf.localeCompare(c.uf, "pt-BR") || a.nomeParlamentar.localeCompare(c.nomeParlamentar, "pt-BR"))
    .map((d) => linha(d, eleitosGovernador));
  const atuais = todos.filter((l) => regra.atual(l) && casaBusca([l.nome, l.nomeCivil, l.uf, l.partido], b));
  const aCadastrar = regra.novos
    ? eleicao.eleitos.filter((x) => x.eleito.casa === "camara" && x.destino === "novo" && !x.jaCadastrado
        && casaBusca([x.eleito.nomeUrna, x.eleito.nomeCompleto, x.eleito.uf, x.eleito.partido], b))
    : [];
  if (atuais.length === 0 && aCadastrar.length === 0) return undefined;
  return { titulo: NOME_GRUPO_DEPUTADOS, aviso: AVISO, atuais, aCadastrar, totalAtuais: todos.length };
}

export function resumoGrupoDeputados(g: GrupoDeputados): string {
  const n = g.aCadastrar.length;
  return [
    g.atuais.length === g.totalAtuais
      ? `${g.totalAtuais} ${g.totalAtuais === 1 ? "deputado" : "deputados"} em exercício`
      : `${g.atuais.length} de ${g.totalAtuais} ${g.totalAtuais === 1 ? "deputado" : "deputados"} em exercício`,
    n > 0 ? `${n} ${n === 1 ? "eleito" : "eleitos"} a cadastrar` : "",
  ].filter(Boolean).join(" · ");
}
