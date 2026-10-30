import { GRUPO_DEPUTADOS_FEDERAIS, GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS, GRUPO_SENADORES } from "@/data/grupos-posse";
import { grupoDoAgrupador } from "@/lib/agrupador";
import type { HistoricoDecisoes } from "@/lib/decisoes";
import {
  decisaoDoEleito, ehOutraPessoa, GRUPOS_DA_ELEICAO_DO_GOVERNO, MOTIVO_DUAS_DECISOES, motivoDaDecisaoDoEleito, motivoForaDoEixo, type DecisaoDoEleito,
} from "@/lib/eleitos-decisoes";
import { normalizarTexto } from "@/lib/normalize";
import { siglaDaUf, ufNoTexto } from "@/lib/uf";
import { casaDoGrupo, casaPessoa, chavePessoa, deputadosEmExercicio, MOTIVO_AMBIGUO, MOTIVO_HOMONIMO_EM_EXERCICIO, referencia } from "@/lib/eleitos-casamento";
import type {
  ContatoPlanilha,
  DeputadoAtual,
  DestinoGoverno,
  EleicaoGovernoContato,
  GovernadorClassificado,
  GovernadorPlanilha,
  ResultadoGrupo,
  UfSegundoTurno,
} from "@/lib/types";

/**
 * Governadores eleitos de 2026 contra o Contatos (spec 2026-10-12 §4.2). Eixo próprio. A regra não
 * mudou em 2026-10-30; só o grupo do Contatos que convida passa a vir em `grupoDestino` (§4.3.1).
 */

type Papel = "governo" | "governo_eleitos" | "senado" | "camara";
interface Candidato { contato: ContatoPlanilha; grupo: string; papel: Papel }

function papelDoGrupo(grupo: string): Papel | undefined {
  const g = normalizarTexto(grupo);
  if (g.startsWith("ex-") || g.startsWith("ex ")) return undefined;
  if (g.startsWith("governador")) return g.includes("eleit") ? "governo_eleitos" : "governo";
  const casa = casaDoGrupo(grupo);
  if (!casa || casa.eleitos) return undefined;
  return casa.casa;
}

function candidatos(grupos: readonly ResultadoGrupo[]): Candidato[] {
  return grupos.flatMap((g) => {
    const papel = papelDoGrupo(g.grupo);
    return papel ? g.contatos.map((c) => ({ contato: c.contato, grupo: g.grupo, papel })) : [];
  });
}

/** Departamento vem vazio nos governadores: a UF está no Cargo e no Órgão. Sem UF, não há guarda. */
export const ufDoContatoGoverno = (c: ContatoPlanilha): string | undefined =>
  siglaDaUf(c.departamento) ?? ufNoTexto(c.cargo) ?? ufNoTexto(c.orgao);

const MOTIVO_SEM_LISTA_DEPUTADOS = "Planilha de deputados atuais não enviada: conferir se é deputado federal em exercício";

const naoPrevisto = (e: GovernadorPlanilha) => `Status do mandato não previsto: "${e.statusMandato.trim()}"`;

const conferir = (e: GovernadorPlanilha, motivo: string, achados: readonly Candidato[] = []): GovernadorClassificado =>
  ({ eleito: e, destino: "conferir", motivo, contatos: achados.map(referencia) });

/**
 * Classificado com destino; `jaCadastrado` quando alguma linha casada está no grupo cujo rótulo do
 * agrupador é o grupo de destino, como senadores e deputados (ajuste de 30/10/2026: o rótulo antigo
 * "Governadores Eleitos" deixou de contar).
 */
function destinado(
  e: GovernadorPlanilha,
  destino: Exclude<DestinoGoverno, "conferir">,
  grupoDestino: string,
  contatos: readonly Candidato[],
): GovernadorClassificado {
  // "Senadores" vale para qualquer grupo de senador atual, como em `lib/eleitos.ts`.
  const ja = contatos.some((c) => (grupoDestino === GRUPO_SENADORES ? c.papel === "senado" : grupoDoAgrupador(c.grupo)?.rotulo === grupoDestino));
  return { eleito: e, destino, grupoDestino, contatos: contatos.map(referencia), ...(ja ? { jaCadastrado: true } : {}) };
}

/** Pela decisão do GT (no eixo): Governadores é reeleito; o grupo dos eleitos, mandato novo; Senadores ou Deputados Federais, o cargo atual (Ata 14). */
function destinoPelaDecisao(convite: string): Exclude<DestinoGoverno, "conferir"> {
  if (convite === GRUPO_GOVERNADORES) return "reeleito";
  return convite === GRUPO_GOVERNADORES_ELEITOS ? "novo" : "outro_cargo";
}

function comDecisao(e: GovernadorPlanilha, pelaRegra: GovernadorClassificado, d: DecisaoDoEleito, achados: readonly Candidato[]): GovernadorClassificado {
  if (d.conflito) return { ...conferir(e, MOTIVO_DUAS_DECISOES, achados), decisao: d.registro };
  if (d.foraDoEixo) return { ...conferir(e, motivoForaDoEixo(d.registro, d.foraDoEixo), achados), decisao: d.registro };
  if (!d.convidaPor) return { ...pelaRegra, decisao: d.registro };
  return { ...destinado(e, destinoPelaDecisao(d.convidaPor), d.convidaPor, achados), motivo: motivoDaDecisaoDoEleito(d.registro), decisao: d.registro };
}

function classificarUm(
  e: GovernadorPlanilha,
  cands: readonly Candidato[],
  camaraNoContatos: boolean,
  atuais?: readonly DeputadoAtual[],
  decisoes?: HistoricoDecisoes,
): GovernadorClassificado {
  const d = decisaoDoEleito(e, decisoes, GRUPOS_DA_ELEICAO_DO_GOVERNO);
  // Ligação por nome que o GT marcou como outra pessoa sai antes da regra (Contatos e lista da Câmara).
  const achados = cands.filter((c) => casaPessoa(c.contato, e, ufDoContatoGoverno(c.contato)) && !ehOutraPessoa(d, c.grupo));
  const listaDaCamara = atuais && ehOutraPessoa(d, GRUPO_DEPUTADOS_FEDERAIS)
    ? atuais.filter((a) => deputadosEmExercicio(e, [a]).length === 0)
    : atuais;
  const pelaRegra = classificarPelaRegra(e, achados, camaraNoContatos, listaDaCamara);
  return d ? comDecisao(e, pelaRegra, d, achados) : pelaRegra;
}

function classificarPelaRegra(
  e: GovernadorPlanilha,
  achados: readonly Candidato[],
  camaraNoContatos: boolean,
  atuais?: readonly DeputadoAtual[],
): GovernadorClassificado {
  if (new Set(achados.map((a) => chavePessoa(a.contato))).size > 1) return conferir(e, MOTIVO_AMBIGUO, achados);
  const em = (p: Papel) => achados.filter((a) => a.papel === p);

  switch (normalizarTexto(e.statusMandato)) {
    case "reeleicao": {
      const gov = em("governo");
      return gov.length > 0
        ? destinado(e, "reeleito", GRUPO_GOVERNADORES, gov)
        : conferir(e, "Planilha diz reeleição, mas a pessoa não está no grupo Governadores do Contatos");
    }
    case "mandato novo": {
      const atual = em("governo")[0];
      if (atual) return conferir(e, `Planilha diz mandato novo, mas a pessoa já está em "${atual.grupo}"`, [atual]);
      return destinado(e, "novo", GRUPO_GOVERNADORES_ELEITOS, em("governo_eleitos"));
    }
    case "mandato novo (atual senador)": {
      const sen = em("senado");
      return sen.length > 0
        ? destinado(e, "outro_cargo", GRUPO_SENADORES, sen)
        : conferir(e, "Planilha diz senador atual, mas a pessoa não está no grupo de senadores do Contatos");
    }
    case "mandato novo (atual deputado federal)": {
      if (camaraNoContatos) {
        const dep = em("camara");
        return dep.length > 0
          ? destinado(e, "outro_cargo", GRUPO_DEPUTADOS_FEDERAIS, dep)
          : conferir(e, "Planilha diz deputado federal atual, mas a pessoa não está no grupo de deputados federais do Contatos");
      }
      if (!atuais) return conferir(e, MOTIVO_SEM_LISTA_DEPUTADOS);
      const achados = deputadosEmExercicio(e, atuais);
      if (achados.length > 1) return conferir(e, MOTIVO_HOMONIMO_EM_EXERCICIO);
      const [d] = achados;
      return d
        ? { eleito: e, destino: "outro_cargo", grupoDestino: GRUPO_DEPUTADOS_FEDERAIS, contatos: [], deputadoAtual: { uf: d.uf, nomeParlamentar: d.nomeParlamentar } }
        : conferir(e, "Planilha diz deputado federal atual, mas a pessoa não está na lista de deputados em exercício");
    }
    case "mandato novo (vice-governador atual)":
      return conferir(e, e.baseStatus ?? "Vice-governador atual: conferir se está no exercício do governo", em("governo"));
    default:
      return conferir(e, naoPrevisto(e));
  }
}

/** Com `decisoes`, a decisão do GT sobre a pessoa vence a regra (`lib/eleitos-decisoes.ts`). */
export function classificarGovernadores(
  eleitos: readonly GovernadorPlanilha[],
  grupos: readonly ResultadoGrupo[],
  deputadosAtuais?: readonly DeputadoAtual[],
  decisoes?: HistoricoDecisoes,
): GovernadorClassificado[] {
  const cands = candidatos(grupos);
  const camaraNoContatos = cands.some((c) => c.papel === "camara");
  return eleitos.map((e) => classificarUm(e, cands, camaraNoContatos, deputadosAtuais, decisoes));
}

export function agruparSegundoTurno(linhas: readonly GovernadorPlanilha[]): UfSegundoTurno[] {
  const porUf = new Map<string, UfSegundoTurno["candidatos"]>();
  for (const l of linhas) {
    const lista = porUf.get(l.uf) ?? [];
    porUf.set(l.uf, [...lista, { nomeUrna: l.nomeUrna, statusMandato: l.statusMandato, ...(l.partido ? { partido: l.partido } : {}) }]);
  }
  return [...porUf.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([uf, cs]) => ({ uf, candidatos: cs }));
}

export function paraContatoGoverno(x: GovernadorClassificado): EleicaoGovernoContato {
  const e = x.eleito;
  return {
    destino: x.destino, uf: e.uf, situacaoTse: e.situacaoTse, statusMandato: e.statusMandato, nomeUrna: e.nomeUrna,
    ...(e.partido ? { partido: e.partido } : {}),
    ...(e.baseStatus ? { baseStatus: e.baseStatus } : {}),
    ...(x.motivo ? { motivo: x.motivo } : {}),
  };
}
