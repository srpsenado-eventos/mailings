import { GRUPO_DEPUTADOS_FEDERAIS, GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS, GRUPO_SENADORES } from "@/data/grupos-posse";
import { normalizarTexto } from "@/lib/normalize";
import { siglaDaUf, ufNoTexto } from "@/lib/uf";
import { casaDoGrupo, casaPessoa, chavePessoa, deputadosEmExercicio, MOTIVO_AMBIGUO, MOTIVO_HOMONIMO_EM_EXERCICIO, referencia } from "@/lib/eleitos-casamento";
import type {
  ContatoPlanilha,
  DeputadoAtual,
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

function classificarUm(
  e: GovernadorPlanilha,
  cands: readonly Candidato[],
  camaraNoContatos: boolean,
  atuais?: readonly DeputadoAtual[],
): GovernadorClassificado {
  const achados = cands.filter((c) => casaPessoa(c.contato, e, ufDoContatoGoverno(c.contato)));
  if (new Set(achados.map((a) => chavePessoa(a.contato))).size > 1) return conferir(e, MOTIVO_AMBIGUO, achados);
  const em = (p: Papel) => achados.filter((a) => a.papel === p);

  switch (normalizarTexto(e.statusMandato)) {
    case "reeleicao": {
      const gov = em("governo");
      return gov.length > 0
        ? { eleito: e, destino: "reeleito", grupoDestino: GRUPO_GOVERNADORES, contatos: gov.map(referencia) }
        : conferir(e, "Planilha diz reeleição, mas a pessoa não está no grupo Governadores do Contatos");
    }
    case "mandato novo": {
      const atual = em("governo")[0];
      if (atual) return conferir(e, `Planilha diz mandato novo, mas a pessoa já está em "${atual.grupo}"`, [atual]);
      const novos = em("governo_eleitos");
      return {
        eleito: e, destino: "novo", grupoDestino: GRUPO_GOVERNADORES_ELEITOS, contatos: novos.map(referencia),
        ...(novos.length > 0 ? { jaCadastrado: true } : {}),
      };
    }
    case "mandato novo (atual senador)": {
      const sen = em("senado");
      return sen.length > 0
        ? { eleito: e, destino: "outro_cargo", grupoDestino: GRUPO_SENADORES, contatos: sen.map(referencia) }
        : conferir(e, "Planilha diz senador atual, mas a pessoa não está no grupo de senadores do Contatos");
    }
    case "mandato novo (atual deputado federal)": {
      if (camaraNoContatos) {
        const dep = em("camara");
        return dep.length > 0
          ? { eleito: e, destino: "outro_cargo", grupoDestino: GRUPO_DEPUTADOS_FEDERAIS, contatos: dep.map(referencia) }
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

export function classificarGovernadores(
  eleitos: readonly GovernadorPlanilha[],
  grupos: readonly ResultadoGrupo[],
  deputadosAtuais?: readonly DeputadoAtual[],
): GovernadorClassificado[] {
  const cands = candidatos(grupos);
  const camaraNoContatos = cands.some((c) => c.papel === "camara");
  return eleitos.map((e) => classificarUm(e, cands, camaraNoContatos, deputadosAtuais));
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
