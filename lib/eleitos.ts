import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import { casaDoGrupo, casaPessoa, chavePessoa, deputadosEmExercicio, MOTIVO_AMBIGUO, MOTIVO_HOMONIMO_EM_EXERCICIO, referencia } from "@/lib/eleitos-casamento";
import { agruparSegundoTurno, classificarGovernadores, paraContatoGoverno } from "@/lib/eleitos-governo";
import type {
  CasaLegislativa,
  ContatoPlanilha,
  DeputadoAtual,
  EleicaoContato,
  EleicaoGovernoContato,
  EleitoClassificado,
  EleitoPlanilha,
  PlanilhaGovernadores,
  ResultadoAnalise,
  ResultadoGrupo,
} from "@/lib/types";

/**
 * Classificação dos eleitos de 04/10/2026 contra o Contatos. Spec 2026-10-05 §4.
 * O `Status do mandato` (TSE cruzado por CPF) decide o destino; o Contatos acha a linha
 * da pessoa e pega contradições, que nunca viram decisão automática: vão para `conferir`.
 * Eixo próprio: não toca semáforo, comparações nem possível saída.
 */

export { MOTIVO_AMBIGUO };
export const OBSERVACAO_NOME_URNA = "Nome de urna (TSE): aguarda aprovação do nome político";
export const ORIENTACAO_OUTRA_CASA = "Convidado pelo cargo atual (Ata 14 do GT Cerimonial, 09/06/2026)";

const MOTIVO_NOVO_EM_EXERCICIO = "Planilha diz mandato novo, mas a pessoa está na lista de deputados em exercício";
const MOTIVO_VERIFICAR = "Planilha pede verificação: provável deputado estadual ou distrital";

type Regra =
  | { destino: "reeleito" | "outra_casa"; casaAtual: CasaLegislativa }
  | { destino: "novo" }
  | { destino: "conferir"; motivo: string };

const naoPrevisto = (e: EleitoPlanilha): Regra => ({
  destino: "conferir",
  motivo: `Status do mandato não previsto: "${e.statusMandato.trim()}"`,
});

function regraDoStatus(e: EleitoPlanilha): Regra {
  const s = normalizarTexto(e.statusMandato);
  switch (s) {
    case "reeleicao":
    case "atual deputado (suplente em exercicio)":
    case "mandato novo (em exercicio como 1º suplente)":
      return { destino: "reeleito", casaAtual: e.casa };
    case "mandato novo (atual deputado federal)":
      if (e.casa === "senado") return { destino: "outra_casa", casaAtual: "camara" };
      return naoPrevisto(e);
    case "mandato novo (atual senador)":
      if (e.casa === "camara") return { destino: "outra_casa", casaAtual: "senado" };
      return naoPrevisto(e);
    case "mandato novo":
      return { destino: "novo" };
    case "mandato novo (verificar)":
      return { destino: "conferir", motivo: MOTIVO_VERIFICAR };
    default:
      return naoPrevisto(e);
  }
}

interface Candidato {
  contato: ContatoPlanilha;
  grupo: string;
  casa: CasaLegislativa;
  /** Grupo novo ("Senadores Eleitos", "Deputados Federais Eleitos"). */
  eleitos: boolean;
}

function candidatos(grupos: readonly ResultadoGrupo[]): Candidato[] {
  return grupos.flatMap((g) => {
    const casa = casaDoGrupo(g.grupo);
    return casa ? g.contatos.map((c) => ({ contato: c.contato, grupo: g.grupo, ...casa })) : [];
  });
}

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
    const emExercicio = atuais ? deputadosEmExercicio(e, atuais).length : 0;
    if (emExercicio > 0) {
      const motivo = emExercicio > 1 ? MOTIVO_HOMONIMO_EM_EXERCICIO : MOTIVO_NOVO_EM_EXERCICIO;
      return { ...base, destino: "conferir", motivo, contatos: [] };
    }
    const atual = achados.find((a) => !a.eleitos);
    if (atual) {
      return { ...base, destino: "conferir", motivo: `Planilha diz mandato novo, mas a pessoa já está em "${atual.grupo}"`, contatos: [referencia(atual)] };
    }
    const noGrupoNovo = achados.filter((a) => a.eleitos && a.casa === e.casa);
    return { ...base, destino: "novo", contatos: noGrupoNovo.map(referencia), ...(noGrupoNovo.length > 0 ? { jaCadastrado: true } : {}) };
  }

  const naLista = regra.casaAtual === "camara" && atuais ? deputadosEmExercicio(e, atuais).length : undefined;
  if (naLista !== undefined && naLista !== 1) {
    const motivo = naLista > 1
      ? MOTIVO_HOMONIMO_EM_EXERCICIO
      : "Planilha diz deputado federal atual, mas a pessoa não está na lista de deputados em exercício";
    return { ...base, destino: "conferir", motivo, contatos: [] };
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
  governadores?: PlanilhaGovernadores,
): ResultadoAnalise {
  const classificados = classificarEleitos(eleitos, resultado.grupos, deputadosAtuais);
  const porLinha = new Map<string, EleicaoContato>();
  for (const x of classificados) for (const c of x.contatos) porLinha.set(chaveLinha(c.grupo, c), paraContato(x));
  const camaraNoContatos = candidatos(resultado.grupos).some((c) => c.casa === "camara" && !c.eleitos);
  const gov = governadores ? classificarGovernadores(governadores.eleitos, resultado.grupos, deputadosAtuais) : undefined;
  const govPorLinha = new Map<string, EleicaoGovernoContato>();
  for (const x of gov ?? []) for (const c of x.contatos) govPorLinha.set(chaveLinha(c.grupo, c), paraContatoGoverno(x));
  return {
    ...resultado,
    grupos: resultado.grupos.map((g) => ({
      ...g,
      contatos: g.contatos.map((c) => {
        const chave = chaveLinha(g.grupo, c.contato);
        const eleicao = porLinha.get(chave);
        const eleicaoGoverno = govPorLinha.get(chave);
        return eleicao || eleicaoGoverno
          ? { ...c, ...(eleicao ? { eleicao } : {}), ...(eleicaoGoverno ? { eleicaoGoverno } : {}) }
          : c;
      }),
    })),
    eleicao: {
      arquivos: [...arquivos],
      eleitos: classificados,
      ...(deputadosAtuais ? { deputadosAtuais: [...deputadosAtuais] } : {}),
      camaraNoContatos,
      ...(gov && governadores ? { governadores: { eleitos: gov, segundoTurno: agruparSegundoTurno(governadores.segundoTurno) } } : {}),
    },
  };
}
