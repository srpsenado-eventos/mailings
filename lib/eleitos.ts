import { GRUPO_DEPUTADOS_ELEITOS, GRUPO_DEPUTADOS_FEDERAIS, GRUPO_SENADORES, GRUPO_SENADORES_ELEITOS } from "@/data/grupos-posse";
import { grupoDoAgrupador } from "@/lib/agrupador";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import { casaDoGrupo, casaPessoa, chavePessoa, deputadosEmExercicio, MOTIVO_AMBIGUO, MOTIVO_HOMONIMO_EM_EXERCICIO, referencia } from "@/lib/eleitos-casamento";
import { agruparSegundoTurno, classificarGovernadores, paraContatoGoverno } from "@/lib/eleitos-governo";
import type {
  CasaLegislativa,
  ContatoPlanilha,
  DestinoEleito,
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
 * Classificação dos eleitos de 04/10/2026 contra o Contatos. Spec 2026-10-05 §4, revista pela spec
 * 2026-10-30 §4.3.1: com a lista de exercício da Câmara, é ela que separa deputado atual de primeiro
 * mandato, e o `Status do mandato` só decide os casos da tabela (senador atual eleito deputado,
 * senador reeleito). Sem a lista, vale o status, como antes. Cada classificado leva o grupo do
 * Contatos que convida a pessoa (`grupoDestino`, Ata 14).
 * Eixo próprio: não toca semáforo, comparações nem possível saída.
 */

export { MOTIVO_AMBIGUO };
export const OBSERVACAO_NOME_URNA = "Nome de urna (TSE): aguarda aprovação do nome político";
export const ORIENTACAO_OUTRA_CASA = "Convidado pelo cargo atual (Ata 14 do GT Cerimonial, 09/06/2026)";
/** Resumo da Eleição 2026 do deputado em exercício que não está em nenhuma planilha de eleitos (spec 2026-10-30 §4.2). */
export const RESUMO_NAO_ELEITO = "Não eleito em 2026";

const MOTIVO_VERIFICAR = "Planilha pede verificação: provável deputado estadual ou distrital";

/** Grupo do Contatos de quem continua no cargo atual, por Casa. */
const GRUPO_DA_CASA: Record<CasaLegislativa, string> = { senado: GRUPO_SENADORES, camara: GRUPO_DEPUTADOS_FEDERAIS };
/** Grupo do Contatos do mandato novo, por Casa. */
const GRUPO_ELEITOS_DA_CASA: Record<CasaLegislativa, string> = { senado: GRUPO_SENADORES_ELEITOS, camara: GRUPO_DEPUTADOS_ELEITOS };

type Regra =
  | { destino: "reeleito" | "outra_casa"; casaAtual: CasaLegislativa }
  | { destino: "novo" }
  | { destino: "conferir"; motivo: string };

const naoPrevisto = (e: EleitoPlanilha): Regra => ({
  destino: "conferir",
  motivo: `Status do mandato não previsto: "${e.statusMandato.trim()}"`,
});

/**
 * Destino pelo `Status do mandato`. Sem a lista de exercício da Câmara, decide tudo; com ela, só
 * o "reeleito" do Senado é lido daqui.
 */
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
  /** Grupo de eleitos ("Senadores eleitos - Posse Presidencial 2027" etc.). */
  eleitos: boolean;
}

function candidatos(grupos: readonly ResultadoGrupo[]): Candidato[] {
  return grupos.flatMap((g) => {
    const casa = casaDoGrupo(g.grupo);
    return casa ? g.contatos.map((c) => ({ contato: c.contato, grupo: g.grupo, ...casa })) : [];
  });
}

const ROTULO_CASA_GRUPO: Record<CasaLegislativa, string> = { senado: "senadores", camara: "deputados federais" };

type Base = Pick<EleitoClassificado, "eleito" | "projecao">;

const conferir = (base: Base, motivo: string, achados: readonly Candidato[] = []): EleitoClassificado =>
  ({ ...base, destino: "conferir", grupoDestino: "", motivo, contatos: achados.map(referencia) });

/** Classificado com destino; `jaCadastrado` quando alguma linha casada está no grupo do Contatos de rótulo `grupoDestino`. */
function destinado(
  base: Base,
  destino: Exclude<DestinoEleito, "conferir">,
  grupoDestino: string,
  contatos: readonly Candidato[],
): EleitoClassificado {
  const ja = contatos.some((c) => grupoDoAgrupador(c.grupo)?.rotulo === grupoDestino);
  return { ...base, destino, grupoDestino, contatos: contatos.map(referencia), ...(ja ? { jaCadastrado: true } : {}) };
}

const daCasa = (achados: readonly Candidato[], casa: CasaLegislativa, eleitos: boolean): Candidato[] =>
  achados.filter((a) => a.casa === casa && a.eleitos === eleitos);

/** Primeiro mandato: grupo de eleitos da Casa, salvo se a pessoa já está num grupo de parlamentar atual. */
function primeiroMandato(base: Base, achados: readonly Candidato[]): EleitoClassificado {
  const atual = achados.find((a) => !a.eleitos);
  if (atual) return conferir(base, `Planilha diz mandato novo, mas a pessoa já está em "${atual.grupo}"`, [atual]);
  const casa = base.eleito.casa;
  return destinado(base, "novo", GRUPO_ELEITOS_DA_CASA[casa], daCasa(achados, casa, true));
}

/** Sem a lista de exercício da Câmara: o status decide e o Contatos pega contradições (comportamento anterior). */
function classificarPeloStatus(base: Base, achados: readonly Candidato[], camaraNoContatos: boolean): EleitoClassificado {
  const regra = regraDoStatus(base.eleito);
  if (regra.destino === "conferir") return conferir(base, regra.motivo);
  if (regra.destino === "novo") return primeiroMandato(base, achados);
  const noGrupo = daCasa(achados, regra.casaAtual, false);
  const confereContatos = regra.casaAtual === "senado" || camaraNoContatos;
  if (confereContatos && noGrupo.length === 0) {
    const diz = regra.destino === "reeleito" ? "reeleito" : "parlamentar da outra Casa";
    return conferir(base, `Planilha diz ${diz}, mas a pessoa não está no grupo de ${ROTULO_CASA_GRUPO[regra.casaAtual]} do Contatos`);
  }
  return destinado(base, regra.destino, GRUPO_DA_CASA[regra.casaAtual], noGrupo);
}

/**
 * Deputado eleito com a lista de exercício da Câmara (spec 2026-10-30 §4.3.1). O senador atual vem
 * antes da lista: o status "atual senador" fica em Senadores; o nome que casa contato do Senado com
 * outro status é homônimo a conferir (Jader Filho × Jader Barbalho).
 */
function classificarDeputado(base: Base, achados: readonly Candidato[], atuais: readonly DeputadoAtual[]): EleitoClassificado {
  const doSenado = daCasa(achados, "senado", false);
  if (normalizarTexto(base.eleito.statusMandato) === "mandato novo (atual senador)") {
    return destinado(base, "outra_casa", GRUPO_SENADORES, doSenado);
  }
  if (doSenado.length > 0) {
    return conferir(base, `Nome casa contato de "${doSenado[0].grupo}", mas a planilha não diz senador atual: conferir se é a mesma pessoa`, doSenado);
  }
  const naLista = deputadosEmExercicio(base.eleito, atuais).length;
  if (naLista > 1) return conferir(base, MOTIVO_HOMONIMO_EM_EXERCICIO);
  if (naLista === 1) return destinado(base, "reeleito", GRUPO_DEPUTADOS_FEDERAIS, daCasa(achados, "camara", false));
  return primeiroMandato(base, achados);
}

/** Senador eleito com a lista de exercício da Câmara (spec 2026-10-30 §4.3.1). */
function classificarSenador(base: Base, achados: readonly Candidato[], atuais: readonly DeputadoAtual[]): EleitoClassificado {
  const naLista = deputadosEmExercicio(base.eleito, atuais).length;
  if (naLista > 1) return conferir(base, MOTIVO_HOMONIMO_EM_EXERCICIO);
  if (naLista === 1) return destinado(base, "outra_casa", GRUPO_DEPUTADOS_FEDERAIS, daCasa(achados, "camara", false));
  if (regraDoStatus(base.eleito).destino === "reeleito") {
    const noSenado = daCasa(achados, "senado", false);
    return noSenado.length > 0
      ? destinado(base, "reeleito", GRUPO_SENADORES, noSenado)
      : conferir(base, "Planilha diz reeleito, mas a pessoa não está no grupo de senadores do Contatos");
  }
  return primeiroMandato(base, achados);
}

function classificarUm(
  e: EleitoPlanilha,
  cands: readonly Candidato[],
  camaraNoContatos: boolean,
  atuais?: readonly DeputadoAtual[],
): EleitoClassificado {
  const base: Base = { eleito: e, projecao: normalizarTexto(e.situacaoTse).startsWith("projecao") };
  const achados = cands.filter((c) => casaPessoa(c.contato, e));
  if (new Set(achados.map((a) => chavePessoa(a.contato))).size > 1) return conferir(base, MOTIVO_AMBIGUO, achados);
  if (!atuais) return classificarPeloStatus(base, achados, camaraNoContatos);
  return e.casa === "camara" ? classificarDeputado(base, achados, atuais) : classificarSenador(base, achados, atuais);
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

/**
 * Resumo da Eleição 2026 do deputado em exercício, para o `deputado.xls` da Câmara, que não traz a
 * coluna (spec 2026-10-30 §4.2). Regra de pessoa do §4.3.2; a Câmara vence o Senado, que vence o governo.
 */
export function resumoEleicaoDoDeputado(
  d: DeputadoAtual,
  eleitos: readonly EleitoPlanilha[],
  governadores?: PlanilhaGovernadores,
): string {
  const ehEle = (e: { uf: string; nomeUrna: string; nomeCompleto: string }) => deputadosEmExercicio(e, [d]).length > 0;
  if (eleitos.some((x) => x.casa === "camara" && ehEle(x))) return "Reeleito deputado federal";
  if (eleitos.some((x) => x.casa === "senado" && ehEle(x))) return "Eleito senador";
  if ((governadores?.eleitos ?? []).some(ehEle)) return "Eleito governador";
  return RESUMO_NAO_ELEITO;
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
      ...(deputadosAtuais
        ? { deputadosAtuais: deputadosAtuais.map((d) => (d.eleicao2026 ? d : { ...d, eleicao2026: resumoEleicaoDoDeputado(d, eleitos, governadores) })) }
        : {}),
      camaraNoContatos,
      ...(gov && governadores ? { governadores: { eleitos: gov, segundoTurno: agruparSegundoTurno(governadores.segundoTurno) } } : {}),
    },
  };
}
