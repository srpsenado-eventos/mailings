import { pontuarPessoa } from "@/lib/match";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import { siglaDaUf } from "@/lib/uf";
import type {
  CasaLegislativa,
  ContatoDoEleito,
  ContatoPlanilha,
  DeputadoAtual,
  EleicaoContato,
  EleitoClassificado,
  EleitoPlanilha,
  ResultadoAnalise,
  ResultadoGrupo,
} from "@/lib/types";

/**
 * Classificação dos eleitos de 04/10/2026 contra o Contatos. Spec 2026-10-05 §4.
 * O `Status do mandato` (TSE cruzado por CPF) decide o destino; o Contatos acha a linha
 * da pessoa e pega contradições, que nunca viram decisão automática: vão para `conferir`.
 * Eixo próprio: não toca semáforo, comparações nem possível saída.
 */

export const OBSERVACAO_NOME_URNA = "Nome de urna (TSE): aguarda aprovação do nome político";
export const ORIENTACAO_OUTRA_CASA = "Convidado pelo cargo atual (Ata 14 do GT Cerimonial, 09/06/2026)";

const MOTIVO_AMBIGUO = "Nome casa mais de um contato do Contatos";
const MOTIVO_VERIFICAR = "Planilha pede verificação: provável deputado estadual ou distrital";

type Regra =
  | { destino: "reeleito" | "outra_casa"; casaAtual: CasaLegislativa }
  | { destino: "novo" }
  | { destino: "conferir"; motivo: string };

const outra = (c: CasaLegislativa): CasaLegislativa => (c === "senado" ? "camara" : "senado");

function regraDoStatus(e: EleitoPlanilha): Regra {
  const s = normalizarTexto(e.statusMandato);
  switch (s) {
    case "reeleicao":
    case "atual deputado (suplente em exercicio)":
    case "mandato novo (em exercicio como 1º suplente)":
      return { destino: "reeleito", casaAtual: e.casa };
    case "mandato novo (atual deputado federal)":
    case "mandato novo (atual senador)":
      return { destino: "outra_casa", casaAtual: outra(e.casa) };
    case "mandato novo":
      return { destino: "novo" };
    case "mandato novo (verificar)":
      return { destino: "conferir", motivo: MOTIVO_VERIFICAR };
    default:
      return { destino: "conferir", motivo: `Status do mandato não previsto: "${e.statusMandato.trim()}"` };
  }
}

interface Candidato {
  contato: ContatoPlanilha;
  grupo: string;
  casa: CasaLegislativa;
  /** Grupo novo ("Senadores Eleitos", "Deputados Federais Eleitos"). */
  eleitos: boolean;
}

function casaDoGrupo(grupo: string): { casa: CasaLegislativa; eleitos: boolean } | undefined {
  const g = normalizarTexto(grupo);
  if (g.startsWith("ex-") || g.startsWith("ex ")) return undefined;
  if (g.includes("eleit")) {
    if (g.includes("senador")) return { casa: "senado", eleitos: true };
    if (g.includes("deputad")) return { casa: "camara", eleitos: true };
    return undefined;
  }
  if (g.includes("senadores")) return { casa: "senado", eleitos: false };
  if (g.includes("deputados federais")) return { casa: "camara", eleitos: false };
  return undefined;
}

function candidatos(grupos: readonly ResultadoGrupo[]): Candidato[] {
  return grupos.flatMap((g) => {
    const casa = casaDoGrupo(g.grupo);
    return casa ? g.contatos.map((c) => ({ contato: c.contato, grupo: g.grupo, ...casa })) : [];
  });
}

function casaPessoa(contato: ContatoPlanilha, e: EleitoPlanilha): boolean {
  const uf = siglaDaUf(contato.departamento);
  if (uf && uf !== e.uf.toUpperCase()) return false;
  const nomes = [e.nomeUrna, e.nomeCompleto].filter((n) => n.trim().length > 0);
  const alvo = normalizarNome(contato.nome);
  return nomes.some((n) => normalizarNome(n) === alvo || pontuarPessoa(contato.nome, n) >= 1);
}

function constaEntreAtuais(e: EleitoPlanilha, atuais: readonly DeputadoAtual[]): boolean {
  const civil = normalizarNome(e.nomeCompleto);
  const urna = normalizarNome(e.nomeUrna);
  return atuais.some(
    (d) => d.uf.toUpperCase() === e.uf.toUpperCase()
      && (normalizarNome(d.nomeCivil) === civil || normalizarNome(d.nomeParlamentar) === urna),
  );
}

const chavePessoa = (c: ContatoPlanilha): string => c.id ?? normalizarNome(c.nome);

const referencia = (a: Candidato): ContatoDoEleito => ({ grupo: a.grupo, nome: a.contato.nome, ...(a.contato.id ? { id: a.contato.id } : {}) });

const ROTULO_CASA_GRUPO: Record<CasaLegislativa, string> = { senado: "senadores", camara: "deputados federais" };

function classificarUm(
  e: EleitoPlanilha,
  cands: readonly Candidato[],
  camaraNoContatos: boolean,
  atuais?: readonly DeputadoAtual[],
): EleitoClassificado {
  const base = { eleito: e, projecao: normalizarTexto(e.situacaoTse).startsWith("projecao") };
  const regra = regraDoStatus(e);
  if (regra.destino === "conferir") return { ...base, destino: "conferir", motivo: regra.motivo, contatos: [] };

  const achados = cands.filter((c) => casaPessoa(c.contato, e));
  if (new Set(achados.map((a) => chavePessoa(a.contato))).size > 1) {
    return { ...base, destino: "conferir", motivo: MOTIVO_AMBIGUO, contatos: achados.map(referencia) };
  }

  if (regra.destino === "novo") {
    const atual = achados.find((a) => !a.eleitos);
    if (atual) {
      return { ...base, destino: "conferir", motivo: `Planilha diz mandato novo, mas a pessoa já está em "${atual.grupo}"`, contatos: [referencia(atual)] };
    }
    const noGrupoNovo = achados.filter((a) => a.eleitos && a.casa === e.casa);
    return { ...base, destino: "novo", contatos: noGrupoNovo.map(referencia), ...(noGrupoNovo.length > 0 ? { jaCadastrado: true } : {}) };
  }

  if (regra.casaAtual === "camara" && atuais && !constaEntreAtuais(e, atuais)) {
    return { ...base, destino: "conferir", motivo: "Planilha diz deputado federal atual, mas a pessoa não está na lista de deputados em exercício", contatos: [] };
  }
  const noGrupo = achados.filter((a) => !a.eleitos && a.casa === regra.casaAtual);
  const confereContatos = regra.casaAtual === "senado" || camaraNoContatos;
  if (confereContatos && noGrupo.length === 0) {
    return {
      ...base,
      destino: "conferir",
      motivo: `Planilha diz ${regra.destino === "reeleito" ? "reeleito" : "parlamentar da outra Casa"}, mas a pessoa não está no grupo de ${ROTULO_CASA_GRUPO[regra.casaAtual]} do Contatos`,
      contatos: [],
    };
  }
  return { ...base, destino: regra.destino, contatos: noGrupo.map(referencia) };
}

export function classificarEleitos(
  eleitos: readonly EleitoPlanilha[],
  grupos: readonly ResultadoGrupo[],
  deputadosAtuais?: readonly DeputadoAtual[],
): EleitoClassificado[] {
  const cands = candidatos(grupos);
  const camaraNoContatos = cands.some((c) => c.casa === "camara" && !c.eleitos);
  return eleitos.map((e) => classificarUm(e, cands, camaraNoContatos, deputadosAtuais));
}

function paraContato(x: EleitoClassificado): EleicaoContato {
  const e = x.eleito;
  return {
    casa: e.casa, destino: x.destino, projecao: x.projecao, uf: e.uf, situacaoTse: e.situacaoTse,
    statusMandato: e.statusMandato, nomeUrna: e.nomeUrna,
    ...(e.partido ? { partido: e.partido } : {}),
    ...(e.baseStatus ? { baseStatus: e.baseStatus } : {}),
    ...(x.motivo ? { motivo: x.motivo } : {}),
  };
}

const chaveLinha = (grupo: string, c: { nome: string; id?: string }): string => `${grupo}|${c.id ?? normalizarNome(c.nome)}`;

/** Classifica e anexa a eleição às linhas do Contatos. Não muta a entrada; não mexe no resumo. */
export function aplicarEleicao(
  resultado: ResultadoAnalise,
  eleitos: readonly EleitoPlanilha[],
  arquivos: readonly string[],
  deputadosAtuais?: readonly DeputadoAtual[],
): ResultadoAnalise {
  const classificados = classificarEleitos(eleitos, resultado.grupos, deputadosAtuais);
  const porLinha = new Map<string, EleicaoContato>();
  for (const x of classificados) for (const c of x.contatos) porLinha.set(chaveLinha(c.grupo, c), paraContato(x));
  const camaraNoContatos = candidatos(resultado.grupos).some((c) => c.casa === "camara" && !c.eleitos);
  return {
    ...resultado,
    grupos: resultado.grupos.map((g) => ({
      ...g,
      contatos: g.contatos.map((c) => {
        const eleicao = porLinha.get(chaveLinha(g.grupo, c.contato));
        return eleicao ? { ...c, eleicao } : c;
      }),
    })),
    eleicao: {
      arquivos: [...arquivos],
      eleitos: classificados,
      ...(deputadosAtuais ? { deputadosAtuais: [...deputadosAtuais] } : {}),
      camaraNoContatos,
    },
  };
}
