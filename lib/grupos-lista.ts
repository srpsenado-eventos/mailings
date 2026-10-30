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
import { aplicarPares } from "@/lib/tratamento-pares";
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
  /** Nome de urna (TSE) ou nome parlamentar (Câmara): o único valor esperado do nome (regra do GT). */
  nome: string;
  /** Nome completo (TSE) ou nome civil (Câmara): só serve para achar a pessoa, nunca confere o nome. */
  nomeCompleto: string;
  uf: string;
  cargoEsperado: string;
  /** Sem gênero na lista, a forma feminina do cargo também confirma (`cargoEsperado` fica no masculino). */
  cargoFeminino?: string;
}

/** Observação do nome divergente em Deputados Federais: o esperado é o nome parlamentar da Câmara. */
export const OBSERVACAO_NOME_PARLAMENTAR = "Nome parlamentar (Câmara)";
/** Eleito cujo grupo do convite a classificação não decidiu: a lista não diz nada sobre ele. */
export const OBSERVACAO_ELEITO_A_CONFERIR = "Eleito a conferir: grupo do convite ainda não decidido";

export function observacaoNomeAmbiguo(rotulo: string): string {
  return `Nome casa mais de uma pessoa da lista de ${rotulo}: conferir`;
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

type Genero = "feminino" | "masculino" | undefined;

/** Gênero do TSE ("Feminino") ou sexo da Câmara ("Feminino"/"F"); vazio ou outro texto não decide. */
function generoDe(valor: string | undefined): Genero {
  const g = normalizarTexto(valor ?? "");
  if (g.startsWith("f")) return "feminino";
  if (g.startsWith("m")) return "masculino";
  return undefined;
}

/**
 * Cargo esperado no gênero da pessoa ("Ministra" não confirma "Ministro", lib/cargos.ts). Sem
 * gênero, o masculino é o esperado e o feminino também confirma.
 */
function cargos(genero: Genero, forma: (feminino: boolean) => string): Pick<PessoaDaLista, "cargoEsperado" | "cargoFeminino"> {
  if (genero === "feminino") return { cargoEsperado: forma(true) };
  if (genero === "masculino") return { cargoEsperado: forma(false) };
  return { cargoEsperado: forma(false), cargoFeminino: forma(true) };
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
      nome: e.nomeUrna, nomeCompleto: e.nomeCompleto, uf: e.uf, ...cargos(generoDe(e.genero), (f) => cargoParlamentar(casa, f)),
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
        nome: g.nomeUrna, nomeCompleto: g.nomeCompleto, uf: g.uf, ...cargos(generoDe(g.genero), (f) => cargoGovernador(g.uf, f)),
      }));
  }
  if (rotulo === GRUPO_DEPUTADOS_FEDERAIS) {
    return eleicao.deputadosAtuais?.map((d) => ({
      nome: d.nomeParlamentar, nomeCompleto: d.nomeCivil, uf: d.uf, ...cargos(generoDe(d.sexo), (f) => cargoParlamentar("camara", f)),
    }));
  }
  return undefined;
}

/** O nome confere só com o nome de urna ou o parlamentar (spec §4.6); o completo ou civil não confere. */
function nomeConfere(contato: ContatoPlanilha, p: PessoaDaLista): boolean {
  return normalizarNome(contato.nome) === normalizarNome(p.nome);
}

/** Nome igual a um dos dois nomes da pessoa: serve só para escolher entre várias pessoas que casam. */
function nomeIgual(contato: ContatoPlanilha, p: PessoaDaLista): boolean {
  const alvo = normalizarNome(contato.nome);
  return alvo === normalizarNome(p.nome) || alvo === normalizarNome(p.nomeCompleto);
}

type Achado = { pessoa: PessoaDaLista } | { ambiguo: true } | undefined;

/**
 * A pessoa da lista que o contato é. Uma só que casa: ela. Várias: a única de nome igual (urna ou
 * completo); sem uma única de nome igual, é ambíguo e nunca se propõe o nome de outra pessoa.
 */
function pessoaDoContato(contato: ContatoPlanilha, lista: readonly PessoaDaLista[], rotulo: string): Achado {
  // Governador: o Departamento vem vazio e a UF está no Cargo ou no Órgão. Nos outros grupos,
  // `undefined` faz `casaPessoa` usar a UF do Departamento.
  const uf = rotulo === GRUPO_GOVERNADORES_ELEITOS ? ufDoContatoGoverno(contato) : undefined;
  const casadas = lista.filter((p) => casaPessoa(contato, { uf: p.uf, nomeUrna: p.nome, nomeCompleto: p.nomeCompleto }, uf));
  if (casadas.length === 0) return undefined;
  if (casadas.length === 1) return { pessoa: casadas[0] };
  const iguais = casadas.filter((p) => nomeIgual(contato, p));
  return iguais.length === 1 ? { pessoa: iguais[0] } : { ambiguo: true };
}

/** Sem gênero na lista, o cargo feminino que confirma vira o esperado; senão vale o `cargoEsperado`. */
function cargoDaComparacao(cargo: string, p: PessoaDaLista): string {
  return p.cargoFeminino && situacaoCampo(cargo, p.cargoFeminino) === "confere" ? p.cargoFeminino : p.cargoEsperado;
}

/** Os eixos já anexados ao contato (Camada D e eleição) não dependem da lista e seguem com ele. */
function eixosDoContato(c: ResultadoContato): Pick<ResultadoContato, "endereco" | "eleicao" | "eleicaoGoverno"> {
  return {
    ...(c.endereco ? { endereco: c.endereco } : {}),
    ...(c.eleicao ? { eleicao: c.eleicao } : {}),
    ...(c.eleicaoGoverno ? { eleicaoGoverno: c.eleicaoGoverno } : {}),
  };
}

function comparadoComPessoa(c: ResultadoContato, p: PessoaDaLista, rotulo: string): ResultadoContato {
  const { contato } = c;
  const nomeOk = nomeConfere(contato, p);
  const cargo = contato.cargo ? cargoDaComparacao(contato.cargo, p) : "";
  const comparacoes: ComparacaoCampo[] = [
    { campo: "nome", valorPlanilha: contato.nome, valorEsperado: p.nome, situacao: nomeOk ? "confere" : "divergente" },
    // Cargo vazio fica fora, como na comparação com a página: o painel já o acusa como "Cargo vazio".
    ...(contato.cargo
      ? [{ campo: "cargo" as const, valorPlanilha: contato.cargo, valorEsperado: cargo, situacao: situacaoCampo(contato.cargo, cargo) }]
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
    ...(nomeOk ? {} : { observacao: rotulo === GRUPO_DEPUTADOS_FEDERAIS ? OBSERVACAO_NOME_PARLAMENTAR : OBSERVACAO_NOME_URNA }),
    ...eixosDoContato(c),
  };
}

/** Indeterminado com a auditoria de tratamento de sempre e o motivo dado; nunca saída. */
function semPessoa(c: ResultadoContato, observacao: string): ResultadoContato {
  return { ...compararContatoSemFonteOficial(c.contato, "lista"), observacao, ...eixosDoContato(c) };
}

function foraDaLista(c: ResultadoContato, rotulo: string, dataDaLista: string): ResultadoContato {
  const planilha = rotulo === GRUPO_DEPUTADOS_FEDERAIS ? "planilha da Câmara" : "planilha do TSE";
  return semPessoa(c, `Não está na lista de ${rotulo} (${planilha} de ${dataDaLista})`);
}

/** Grupos de eleitos: só neles o eleito em `conferir` fica fora da comparação com a lista. */
const GRUPOS_DE_ELEITOS: ReadonlySet<string> = new Set([GRUPO_SENADORES_ELEITOS, GRUPO_DEPUTADOS_ELEITOS, GRUPO_GOVERNADORES_ELEITOS]);

/**
 * Eleito a conferir num grupo de eleitos. Em Deputados Federais o deputado atual com a eleição em
 * `conferir` continua deputado em exercício e segue a comparação com a lista da Câmara.
 */
function eleitoAConferir(c: ResultadoContato, rotulo: string): boolean {
  if (!GRUPOS_DE_ELEITOS.has(rotulo)) return false;
  return c.eleicao?.destino === "conferir" || c.eleicaoGoverno?.destino === "conferir";
}

function compararContatoComLista(
  c: ResultadoContato,
  lista: readonly PessoaDaLista[],
  rotulo: string,
  dataDaLista: string,
): ResultadoContato {
  // O eleito em `conferir` não entra em lista nenhuma: dizer que "não está na lista" seria falso.
  if (eleitoAConferir(c, rotulo)) return semPessoa(c, OBSERVACAO_ELEITO_A_CONFERIR);
  const achado = pessoaDoContato(c.contato, lista, rotulo);
  if (!achado) return foraDaLista(c, rotulo, dataDaLista);
  if ("ambiguo" in achado) return semPessoa(c, observacaoNomeAmbiguo(rotulo));
  return comparadoComPessoa(c, achado.pessoa, rotulo);
}

function compararGrupoComLista(g: ResultadoGrupo, eleicao: ResultadoEleicao, dataDaLista: string): ResultadoGrupo {
  const rotulo = grupoDoAgrupador(g.grupo)?.rotulo;
  const lista = composicaoDaLista(g.grupo, eleicao);
  if (!rotulo || !lista) return g;
  // A comparação com a lista refaz as comparações do contato; os pares voltam a julgar o
  // tratamento e o endereçamento que a tabela deixa sem regra (spec 2026-10-30 §3.4).
  return aplicarPares({
    ...g,
    contatos: g.contatos.map((c) => compararContatoComLista(c, lista, rotulo, dataDaLista)),
  });
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
