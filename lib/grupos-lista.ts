import {
  GRUPO_DEPUTADOS_ELEITOS,
  GRUPO_DEPUTADOS_FEDERAIS,
  GRUPO_GOVERNADORES_ELEITOS,
  GRUPO_SENADORES_ELEITOS,
} from "@/data/grupos-posse";
import { grupoDoAgrupador } from "@/lib/agrupador";
import { OBSERVACAO_NOME_URNA } from "@/lib/eleitos";
import { casaPessoa } from "@/lib/eleitos-casamento";
import { ufDoContatoGoverno } from "@/lib/eleitos-governo";
import {
  comparacoesSemSite,
  comparacoesTratamento,
  compararContatoSemFonteOficial,
  divergenciasDe,
  situacaoCampo,
} from "@/lib/match";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import { UF_POR_EXTENSO } from "@/lib/uf";
import type {
  CasaLegislativa,
  ComparacaoCampo,
  ContatoPlanilha,
  ResultadoAnalise,
  ResultadoContato,
  ResultadoEleicao,
  ResultadoGrupo,
  ResumoAnalise,
} from "@/lib/types";

/**
 * Comparação dos grupos de modo `lista` com as planilhas (spec 2026-10-30 §4.6): os três grupos de
 * eleitos com a planilha do TSE e "Deputados Federais" com a lista de exercício da Câmara. Nenhuma
 * página é lida, e a ausência na lista nunca é possível saída (regra de ouro): a lista é planilha
 * de trabalho, não composição oficial publicada. Ninguém da lista vira "novo"; quem falta no
 * Contatos é o "A cadastrar" do painel.
 */

export interface PessoaDaLista {
  /** Nome de urna (TSE) ou nome parlamentar (Câmara): o valor esperado do nome. */
  nome: string;
  /** Nome completo (TSE) ou nome civil (Câmara): também confere o nome. */
  nomeCompleto: string;
  uf: string;
  cargoEsperado: string;
}

const LIGACOES = new Set(["de", "da", "do", "das", "dos", "e"]);

/** "ESPÍRITO SANTO" → "Espírito Santo"; ligações em minúsculas ("Rio Grande do Norte"). */
function nomeProprio(maiusculas: string): string {
  return maiusculas
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((p) => (LIGACOES.has(p) ? p : p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1)))
    .join(" ");
}

/** Gênero do TSE ("Feminino") ou sexo da Câmara ("Feminino"/"F"); vazio não decide e fica o masculino. */
function ehFeminino(genero: string | undefined): boolean {
  return normalizarTexto(genero ?? "").startsWith("f");
}

/** Cargo esperado pelo papel, no gênero da pessoa: "Ministra" não confirma "Ministro" (lib/cargos.ts). */
function cargoParlamentar(casa: CasaLegislativa, feminino: boolean): string {
  if (casa === "senado") return feminino ? "Senadora" : "Senador";
  return feminino ? "Deputada Federal" : "Deputado Federal";
}

function cargoGovernador(uf: string, feminino: boolean): string {
  const papel = feminino ? "Governadora" : "Governador";
  const sigla = uf.toUpperCase();
  if (sigla === "DF") return `${papel} do Distrito Federal`;
  const extenso = UF_POR_EXTENSO[sigla];
  return extenso ? `${papel} do Estado de ${nomeProprio(extenso)}` : papel;
}

function eleitosDaCasa(rotulo: string, casa: CasaLegislativa, eleicao: ResultadoEleicao): PessoaDaLista[] | undefined {
  // Sem a planilha dessa Casa na varredura não há lista: o grupo fica com o motivo de sem a lista.
  if (!eleicao.eleitos.some((x) => x.eleito.casa === casa)) return undefined;
  return eleicao.eleitos
    .filter((x) => x.grupoDestino === rotulo)
    .map(({ eleito: e }) => ({
      nome: e.nomeUrna, nomeCompleto: e.nomeCompleto, uf: e.uf, cargoEsperado: cargoParlamentar(casa, ehFeminino(e.genero)),
    }));
}

/**
 * Composição do grupo de modo `lista` pela eleição desta varredura (spec §4.6). `undefined` é "sem
 * lista": grupo fora dos quatro, ou planilha do grupo ausente nesta varredura.
 */
export function composicaoDaLista(grupo: string, eleicao: ResultadoEleicao): PessoaDaLista[] | undefined {
  const rotulo = grupoDoAgrupador(grupo)?.rotulo;
  if (rotulo === GRUPO_SENADORES_ELEITOS) return eleitosDaCasa(rotulo, "senado", eleicao);
  if (rotulo === GRUPO_DEPUTADOS_ELEITOS) return eleitosDaCasa(rotulo, "camara", eleicao);
  if (rotulo === GRUPO_GOVERNADORES_ELEITOS) {
    return eleicao.governadores?.eleitos
      .filter((x) => x.grupoDestino === rotulo)
      .map(({ eleito: g }) => ({
        nome: g.nomeUrna, nomeCompleto: g.nomeCompleto, uf: g.uf, cargoEsperado: cargoGovernador(g.uf, ehFeminino(g.genero)),
      }));
  }
  if (rotulo === GRUPO_DEPUTADOS_FEDERAIS) {
    return eleicao.deputadosAtuais?.map((d) => ({
      nome: d.nomeParlamentar, nomeCompleto: d.nomeCivil, uf: d.uf, cargoEsperado: cargoParlamentar("camara", ehFeminino(d.sexo)),
    }));
  }
  return undefined;
}

/** Igualdade de `normalizarNome` com o nome de urna ou com o completo. */
function nomeConfere(contato: ContatoPlanilha, p: PessoaDaLista): boolean {
  const alvo = normalizarNome(contato.nome);
  return alvo === normalizarNome(p.nome) || alvo === normalizarNome(p.nomeCompleto);
}

/** A pessoa da lista que o contato é; entre várias que casam, a de nome igual vem antes. */
function pessoaDoContato(contato: ContatoPlanilha, lista: readonly PessoaDaLista[], rotulo: string): PessoaDaLista | undefined {
  // Governador: o Departamento vem vazio e a UF está no Cargo ou no Órgão. Nos outros grupos,
  // `undefined` faz `casaPessoa` usar a UF do Departamento.
  const uf = rotulo === GRUPO_GOVERNADORES_ELEITOS ? ufDoContatoGoverno(contato) : undefined;
  const casadas = lista.filter((p) => casaPessoa(contato, { uf: p.uf, nomeUrna: p.nome, nomeCompleto: p.nomeCompleto }, uf));
  return casadas.find((p) => nomeConfere(contato, p)) ?? casadas[0];
}

/** Os eixos já anexados ao contato (Camada D e eleição) não dependem da lista e seguem com ele. */
function eixosDoContato(c: ResultadoContato): Pick<ResultadoContato, "endereco" | "eleicao" | "eleicaoGoverno"> {
  return {
    ...(c.endereco ? { endereco: c.endereco } : {}),
    ...(c.eleicao ? { eleicao: c.eleicao } : {}),
    ...(c.eleicaoGoverno ? { eleicaoGoverno: c.eleicaoGoverno } : {}),
  };
}

function comparadoComPessoa(c: ResultadoContato, p: PessoaDaLista): ResultadoContato {
  const { contato } = c;
  const nomeOk = nomeConfere(contato, p);
  const comparacoes: ComparacaoCampo[] = [
    { campo: "nome", valorPlanilha: contato.nome, valorEsperado: p.nome, situacao: nomeOk ? "confere" : "divergente" },
    // Cargo vazio fica fora, como na comparação com a página: o painel já o acusa como "Cargo vazio".
    ...(contato.cargo
      ? [{ campo: "cargo" as const, valorPlanilha: contato.cargo, valorEsperado: p.cargoEsperado, situacao: situacaoCampo(contato.cargo, p.cargoEsperado) }]
      : []),
    ...comparacoesSemSite(contato),
    ...comparacoesTratamento(contato, undefined),
  ];
  const camposDivergentes = divergenciasDe(comparacoes);
  return {
    contato,
    semaforo: camposDivergentes.length > 0 ? "amarelo" : "verde",
    score: 1,
    comparacoes,
    camposDivergentes,
    origem: "oficial",
    ...(nomeOk ? {} : { observacao: OBSERVACAO_NOME_URNA }),
    ...eixosDoContato(c),
  };
}

function foraDaLista(c: ResultadoContato, rotulo: string, dataDaLista: string): ResultadoContato {
  const planilha = rotulo === GRUPO_DEPUTADOS_FEDERAIS ? "planilha da Câmara" : "planilha do TSE";
  return {
    ...compararContatoSemFonteOficial(c.contato, "lista"),
    observacao: `Não está na lista de ${rotulo} (${planilha} de ${dataDaLista})`,
    ...eixosDoContato(c),
  };
}

function compararGrupoComLista(g: ResultadoGrupo, eleicao: ResultadoEleicao, dataDaLista: string): ResultadoGrupo {
  const rotulo = grupoDoAgrupador(g.grupo)?.rotulo;
  const lista = composicaoDaLista(g.grupo, eleicao);
  if (!rotulo || !lista) return g;
  return {
    ...g,
    contatos: g.contatos.map((c) => {
      const p = pessoaDoContato(c.contato, lista, rotulo);
      return p ? comparadoComPessoa(c, p) : foraDaLista(c, rotulo, dataDaLista);
    }),
  };
}

/** O resumo troca só a contagem de semáforo dos contatos que mudaram; o resto é o mesmo de `resumir`. */
function resumoAjustado(resumo: ResumoAnalise, antes: readonly ResultadoGrupo[], depois: readonly ResultadoGrupo[]): ResumoAnalise {
  const ajustado = { ...resumo };
  antes.forEach((g, i) => {
    if (g === depois[i]) return;
    g.contatos.forEach((c, j) => {
      ajustado[c.semaforo] -= 1;
      ajustado[depois[i].contatos[j].semaforo] += 1;
    });
  });
  return ajustado;
}

/**
 * Substitui o veredito de cada contato dos grupos `fiscalizacao: "lista"` pela comparação com a
 * planilha do grupo (spec §4.6): casou alguém, verde ou amarelo por nome, cargo e tratamento; não
 * casou ninguém, indeterminado com "Não está na lista de <grupo> (planilha ... de <dataDaLista>)".
 * Sem eleição, ou sem a planilha do grupo, o grupo segue como a análise o deixou.
 */
export function aplicarListas(resultado: ResultadoAnalise, dataDaLista: string): ResultadoAnalise {
  const { eleicao } = resultado;
  if (!eleicao) return resultado;
  const grupos = resultado.grupos.map((g) => (g.fiscalizacao === "lista" ? compararGrupoComLista(g, eleicao, dataDaLista) : g));
  return { ...resultado, grupos, resumo: resumoAjustado(resultado.resumo, resultado.grupos, grupos) };
}
