import {
  casosDaPessoa,
  dataDaDecisao,
  grupoEquivalente,
  quadroDeBloqueio,
  textoDasPendencias,
  vigente,
  type CasoDecidido,
  type HistoricoDecisoes,
  type TipoDecisao,
} from "@/lib/decisoes";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import type { Ocorrencia } from "./tipos";

/**
 * Coluna "Registro do GT (duplicidade / grupo do convite)" das planilhas de conferência
 * (spec 2026-11-08 §16.6, regra do Clovis de 19/11): o que `.fiscal/decisoes.json` já diz sobre a
 * pessoa da linha. Função pura: recebe o histórico já lido (ou `null`, quando não pôde ser lido).
 */

export const TITULO_COLUNA_REGISTRO_GT = "Registro do GT (duplicidade / grupo do convite)";
export const TEXTO_REGISTRO_NAO_LIDO = "registro de decisões não lido";
export const TEXTO_SEM_DECISAO = "sem decisão registrada";
export const TEXTO_MAIS_DE_UM_GRUPO = `Em mais de um grupo · ${TEXTO_SEM_DECISAO}`;

const SEPARADOR_PARTES = " · ";
const SEPARADOR_CASOS = " | ";

const TEXTO_TIPO: Readonly<Record<TipoDecisao, string>> = {
  mesma_pessoa: "mesma pessoa",
  pessoas_diferentes: "pessoas diferentes",
  nao_recebe_convite: "não recebe convite",
  ajustar_contatos: "ajustar no Contatos",
};

/** `historico === null`: o arquivo de decisões não foi lido (ausente ou ilegível; o comando avisa e segue). */
export interface EntradaRegistroGt {
  nome: string;
  ocorrencias: readonly Ocorrencia[];
  grupoEscolhido: string;
  historico: HistoricoDecisoes | null;
}

/** Grupos distintos das ocorrências, na forma equivalente do Contatos (a primeira grafia de cada um). */
function gruposAtuaisDe(ocorrencias: readonly Ocorrencia[]): string[] {
  const vistos = new Set<string>();
  return ocorrencias.flatMap((o) => {
    const grupo = grupoEquivalente(o.grupo, "contatos");
    const chave = normalizarTexto(grupo);
    if (chave === "" || vistos.has(chave)) return [];
    vistos.add(chave);
    return [grupo];
  });
}

function temCasoComONome(historico: HistoricoDecisoes, nome: string): boolean {
  const chave = normalizarNome(nome);
  return chave !== "" && historico.casos.some((c) => c.chaves.includes(chave));
}

/** Sem caso: a duplicidade na base é dita, e a pessoa nova só ganha texto quando já teve caso. */
function textoSemCaso(historico: HistoricoDecisoes, nome: string, gruposAtuais: readonly string[]): string {
  if (gruposAtuais.length >= 2) return TEXTO_MAIS_DE_UM_GRUPO;
  if (gruposAtuais.length === 1) return TEXTO_SEM_DECISAO;
  return temCasoComONome(historico, nome) ? TEXTO_SEM_DECISAO : "";
}

/** "Decisão do GT (DD/MM/AAAA, validado): <tipo> · convite pelo grupo X · <observação> · <pendências>". */
function textoDoCaso(caso: CasoDecidido, gruposAtuais: readonly string[]): string {
  const decisao = vigente(caso);
  if (decisao === undefined) return "";
  const validacao = decisao.validacao === "validado" ? "validado" : "a validar";
  const convite = decisao.convidaPor?.trim() ?? "";
  const observacao = decisao.observacao.trim();
  const pendencias = textoDasPendencias(quadroDeBloqueio(caso, gruposAtuais).pendencias);
  return [
    `Decisão do GT (${dataDaDecisao(decisao.data, true)}, ${validacao}): ${TEXTO_TIPO[decisao.tipo]}`,
    convite === "" ? "" : `convite pelo grupo ${convite}`,
    observacao,
    pendencias,
  ].filter((parte) => parte !== "").join(SEPARADOR_PARTES);
}

/**
 * Texto da coluna para uma linha da lista. Os casos da pessoa saem pelo nome normalizado e pelos
 * grupos das ocorrências mais o grupo escolhido (`casosDaPessoa`); as pendências de bloqueio
 * consideram só os grupos atuais da pessoa na base. Vários casos saem separados por " | ".
 */
export function textoDoRegistroGt({ nome, ocorrencias, grupoEscolhido, historico }: EntradaRegistroGt): string {
  if (historico === null) return ocorrencias.length > 0 ? TEXTO_REGISTRO_NAO_LIDO : "";
  const gruposAtuais = gruposAtuaisDe(ocorrencias);
  const casos = casosDaPessoa(historico, [nome], [...gruposAtuais, grupoEquivalente(grupoEscolhido, "contatos")]);
  if (casos.length === 0) return textoSemCaso(historico, nome, gruposAtuais);
  return casos.map((c) => textoDoCaso(c, gruposAtuais)).filter((t) => t !== "").join(SEPARADOR_CASOS);
}
