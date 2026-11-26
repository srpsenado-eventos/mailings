import { GRUPO_DEPUTADOS_FEDERAIS, GRUPOS_POSSE } from "@/data/grupos-posse";
import type { HistoricoDecisoes } from "@/lib/decisoes";
import type { ContatoPlanilha } from "@/lib/types";
import type { ContagensDivergencias } from "./divergencias";
import { mesmoGrupo } from "./grupo";
import type { ListaDeEntrada, OrigemLista } from "./lista";
import type { Rodada } from "./tipos";

/**
 * Helpers puros do comando `npm run convidados` (spec 2026-11-08 §16.3, §16.5 e §16.6): textos e
 * decisões que não dependem do sistema de arquivos. O I/O fica em `scripts/convidados.ts`.
 */

export const MOTIVO_GRUPO_NAO_E_DEPUTADOS = "grupo não é Deputados Federais";
export const MOTIVO_LISTA_E_DO_SITE = "a lista já é a planilha do site";
export const MOTIVO_SEM_PLANILHA_DA_CAMARA = "sem planilha da Câmara em --camara nem em --eleitos";
export const MOTIVO_MAIS_DE_UMA_PLANILHA_DA_CAMARA = "mais de uma planilha da Câmara em --eleitos; indique a do dia em --camara";

/**
 * `undefined` quando a planilha de divergências deve ser gerada; senão, o motivo de não gerar (§16.5).
 * `planilhasDaCamara` é quantas planilhas do site com deputados há (a de `--camara` conta uma; sem a
 * opção, as reconhecidas em `--eleitos`): precisa ser exatamente uma.
 */
export function motivoSemDivergencias(grupo: string, origem: OrigemLista, planilhasDaCamara: number): string | undefined {
  if (!mesmoGrupo(grupo, GRUPO_DEPUTADOS_FEDERAIS)) return MOTIVO_GRUPO_NAO_E_DEPUTADOS;
  if (origem === "camara") return MOTIVO_LISTA_E_DO_SITE;
  if (planilhasDaCamara === 0) return MOTIVO_SEM_PLANILHA_DA_CAMARA;
  if (planilhasDaCamara > 1) return MOTIVO_MAIS_DE_UMA_PLANILHA_DA_CAMARA;
  return undefined;
}

const doisDigitos = (n: number): string => String(n).padStart(2, "0");

/** "DD/MM/AAAA" (data de modificação do `deputado.xls`, por exemplo). */
export function formatarData(d: Date): string {
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** "DD/MM/AAAA HH:MM" do par "Gerado em" do Resumo. */
export function formatarDataHora(d: Date): string {
  return `${formatarData(d)} ${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

/** Só o que entra no texto do comando gravado no Resumo: a lista e o grupo, mais as opções que mudam o resultado. */
export interface OpcoesDoComando {
  lista: string;
  grupo: string;
  preencherProtocolo: boolean;
  camara?: string;
}

export function textoDoComando(o: OpcoesDoComando): string {
  const partes = [
    `comando: npm run convidados -- "${o.lista}" --grupo "${o.grupo}"`,
    o.preencherProtocolo ? "--preencher-protocolo" : "",
    o.camara === undefined ? "" : `--camara "${o.camara}"`,
  ];
  return partes.filter((p) => p !== "").join(" ");
}

export function textoDasContagensDeDivergencias(c: ContagensDivergencias): string {
  return `Permanece ${c.permanece} · Saiu ${c.saiu} · Entrou ${c.entrou} · Conferir ${c.conferir}`;
}

const ROTULOS_CONTAGEM: readonly (readonly [keyof Rodada["contagens"], string])[] = [
  ["linhas", "Linhas lidas"],
  ["novos", "Novo: importar"],
  ["novosAlterados", "Novo: com campo alterado"],
  ["novosValidar", "Novo: a validar"],
  ["novosRevisar", "Novo: a revisar"],
  ["jaGrupoEscolhido", "Já no Contatos: no grupo escolhido"],
  ["jaOutroGrupo", "Já no Contatos: em outro grupo"],
  ["repetidas", "Repetida na própria lista"],
  ["semProtocolo", "Sem tratamento ou endereçamento"],
  ["protocoloPreenchido", "Tratamento ou endereçamento preenchidos pela regra"],
  ["enderecoNovo", "Endereço novo para contato já cadastrado"],
];

/** Uma linha "Rótulo: N" por contagem da rodada, na ordem do Resumo. */
export function linhasDasContagens(contagens: Rodada["contagens"]): string[] {
  return ROTULOS_CONTAGEM.map(([campo, rotulo]) => `${rotulo}: ${contagens[campo]}`);
}

/** O grupo escolhido casa algum dos grupos da Posse (rótulo ou apelido) ou algum grupo da base. */
export function grupoConhecido(grupo: string, base: readonly ContatoPlanilha[]): boolean {
  const daPosse = GRUPOS_POSSE.flatMap((g) => [g.rotulo, ...(g.apelidos ?? [])]);
  const daBase = base.flatMap((c) => c.grupo.split(";").map((g) => g.trim()).filter(Boolean));
  return [...daPosse, ...daBase].some((rotulo) => mesmoGrupo(rotulo, grupo));
}

export function textoDaOrigem(lida: Pick<ListaDeEntrada, "origem" | "aba">): string {
  if (lida.origem === "camara") return "Origem: planilha do site da Câmara (deputados em exercício)";
  return `Origem: modelo Padrão (aba '${lida.aba}')`;
}

export function textoDoProtocolo(preencherProtocolo: boolean): string {
  return preencherProtocolo
    ? "Protocolo: Tratamento e Endereçamento vazios preenchidos pela regra"
    : "Protocolo: só conferido (sem --preencher-protocolo)";
}

/** `null` = o arquivo não pôde ser lido (o aviso com o motivo já saiu na leitura). */
export function textoDasDecisoes(decisoes: HistoricoDecisoes | null, nomeArquivo: string): string {
  if (decisoes === null) return "Decisões: não lidas";
  return `Decisões: ${nomeArquivo} (${decisoes.casos.length} casos)`;
}
