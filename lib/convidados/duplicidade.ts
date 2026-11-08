import { grupoEquivalente } from "@/lib/decisoes";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import type { ContatoPlanilha, DeputadoAtual, EleitoPlanilha, EnderecoEstruturado, GovernadorPlanilha } from "@/lib/types";
import { CONECTIVOS } from "./nome";
import type { Achado, Ocorrencia, Valores } from "./tipos";

export interface IndiceBase {
  porNome: ReadonlyMap<string, Ocorrencia[]>;
}

export type SituacaoNaBase = "novo" | "ja_grupo_escolhido" | "ja_outro_grupo";

export interface ResultadoNaBase {
  situacao: SituacaoNaBase;
  ocorrencias: Ocorrencia[];
  conferir: Ocorrencia[];
}

export interface ReferenciasEleicao {
  deputados: readonly DeputadoAtual[];
  eleitos: readonly EleitoPlanilha[];
  governadores: readonly GovernadorPlanilha[];
}

type CamposEndereco = "logradouro" | "numero" | "complemento" | "bairro" | "cidade" | "uf" | "cep";
type EnderecoDaLinha = Pick<EnderecoEstruturado, CamposEndereco>;

interface FormasDoCargo {
  masculino: string;
  feminino: string;
  indefinido: string;
}

const ORDEM_ENDERECO: readonly CamposEndereco[] = ["logradouro", "numero", "complemento", "bairro", "cidade", "uf", "cep"];
const SEPARADOR_GRUPOS = ";";
const SEPARADOR_REFERENCIAS = " · ";
const SENADOR: FormasDoCargo = { masculino: "Senador", feminino: "Senadora", indefinido: "Senador(a)" };
const DEPUTADO: FormasDoCargo = { masculino: "Deputado Federal", feminino: "Deputada Federal", indefinido: "Deputado(a) Federal" };
const GOVERNADOR: FormasDoCargo = { masculino: "Governador", feminino: "Governadora", indefinido: "Governador(a)" };

export function indexarBase(contatos: readonly ContatoPlanilha[]): IndiceBase {
  const porNome = new Map<string, Ocorrencia[]>();
  for (const contato of contatos) {
    const chave = normalizarNome(contato.nome);
    if (chave === "") continue;
    const grupos = contato.grupo.split(SEPARADOR_GRUPOS).map((g) => g.trim()).filter(Boolean);
    const novas = grupos.map((grupo) => ({ id: contato.id ?? "", grupo }));
    porNome.set(chave, [...(porNome.get(chave) ?? []), ...novas]);
  }
  return { porNome };
}

export function mesmoGrupo(a: string, b: string): boolean {
  return normalizarTexto(grupoEquivalente(a, "contatos")) === normalizarTexto(grupoEquivalente(b, "contatos"));
}

export function tokensSignificativos(nomeNormalizado: string): string[] {
  return nomeNormalizado
    .split(/\s+/)
    .filter((token) => !CONECTIVOS.has(token) && /\p{L}{2}/u.test(token));
}

function ehSubsequencia(menor: readonly string[], maior: readonly string[]): boolean {
  let posicao = 0;
  for (const token of maior) {
    if (token === menor[posicao]) posicao += 1;
    if (posicao === menor.length) return true;
  }
  return false;
}

function ehParcial(chaveBase: string, chaveNome: string): boolean {
  const base = tokensSignificativos(chaveBase);
  const nome = tokensSignificativos(chaveNome);
  if (base.length < 2 || nome.length < 2) return false;
  return ehSubsequencia(base, nome) || ehSubsequencia(nome, base);
}

export function situacaoNaBase(nome: string, grupoEscolhido: string, indice: IndiceBase): ResultadoNaBase {
  const chave = normalizarNome(nome);
  const iguais = indice.porNome.get(chave);
  if (iguais !== undefined && iguais.length > 0) {
    const noGrupo = iguais.some((o) => mesmoGrupo(o.grupo, grupoEscolhido));
    return { situacao: noGrupo ? "ja_grupo_escolhido" : "ja_outro_grupo", ocorrencias: [...iguais], conferir: [] };
  }
  const conferir: Ocorrencia[] = [];
  for (const [chaveBase, ocorrencias] of indice.porNome) {
    if (ehParcial(chaveBase, chave)) conferir.push(...ocorrencias);
  }
  return { situacao: "novo", ocorrencias: [], conferir };
}

function pessoaConsta(chave: string, ...candidatos: readonly (string | undefined)[]): boolean {
  return candidatos.some((c) => c !== undefined && normalizarNome(c) === chave);
}

function textoEleito(cargo: FormasDoCargo, genero: string | undefined, uf: string): string {
  const g = (genero ?? "").trim().toLocaleLowerCase("pt-BR");
  if (g === "") return `Eleito(a) em 2026: ${cargo.indefinido} por ${uf} (TSE)`;
  if (g.startsWith("f")) return `Eleita em 2026: ${cargo.feminino} por ${uf} (TSE)`;
  return `Eleito em 2026: ${cargo.masculino} por ${uf} (TSE)`;
}

export function referenciaCamaraTse(nome: string, ref: ReferenciasEleicao): string {
  const chave = normalizarNome(nome);
  if (chave === "") return "";
  const textos: string[] = [];
  if (ref.deputados.some((d) => pessoaConsta(chave, d.nomeParlamentar, d.nomeCivil))) {
    textos.push("Consta na lista da Câmara (deputado em exercício)");
  }
  const eleito = ref.eleitos.find((e) => pessoaConsta(chave, e.nomeUrna, e.nomeCompleto));
  if (eleito !== undefined) {
    textos.push(textoEleito(eleito.casa === "senado" ? SENADOR : DEPUTADO, eleito.genero, eleito.uf));
  }
  const governador = ref.governadores.find((g) => pessoaConsta(chave, g.nomeUrna, g.nomeCompleto));
  if (governador !== undefined) textos.push(textoEleito(GOVERNADOR, governador.genero, governador.uf));
  return textos.join(SEPARADOR_REFERENCIAS);
}

export function enderecoDaLinha(v: Valores): EnderecoDaLinha {
  return { logradouro: v.LOGRADOURO, numero: v.NUMERO, complemento: v.COMPLEMENTO, bairro: v.BAIRRO, cidade: v.CIDADE, uf: v.UF, cep: v.CEP };
}

function emUmaLinha(e: Partial<EnderecoDaLinha>): string {
  return ORDEM_ENDERECO.map((campo) => (e[campo] ?? "").trim()).filter((valor) => valor !== "").join(", ");
}

function mesmoCampo(campo: CamposEndereco, a: string | undefined, b: string | undefined): boolean {
  if (campo === "cep") return (a ?? "").replace(/\D/g, "") === (b ?? "").replace(/\D/g, "");
  return normalizarTexto(a ?? "") === normalizarTexto(b ?? "");
}

function mesmoEndereco(a: Partial<EnderecoDaLinha>, b: Partial<EnderecoDaLinha>): boolean {
  return ORDEM_ENDERECO.every((campo) => mesmoCampo(campo, a[campo], b[campo]));
}

export function compararEnderecoCadastrado(
  linha: number,
  nome: string,
  gravado: Valores,
  ocorrencias: readonly Ocorrencia[],
  enderecos: readonly EnderecoEstruturado[],
): Achado | undefined {
  const ids = new Set(ocorrencias.map((o) => o.id));
  const doContato = enderecos.filter((e) => ids.has(e.contatoId));
  const cadastrados = [...doContato.filter((e) => e.prioritario), ...doContato.filter((e) => !e.prioritario)]
    .filter((e) => emUmaLinha(e) !== "");
  const recebido = enderecoDaLinha(gravado);
  const valorRecebido = emUmaLinha(recebido);
  if (cadastrados.length === 0) {
    return {
      linha, nome, tipo: "endereco_novo", campo: "—", valorRecebido,
      sugestao: `Aproveitar o endereço recebido no cadastro existente (Id ${[...ids].join(", ")})`,
      motivo: "Contato já cadastrado sem endereço no Contatos.",
    };
  }
  if (cadastrados.some((c) => mesmoEndereco(recebido, c))) return undefined;
  return {
    linha, nome, tipo: "endereco_diferente", campo: "—", valorRecebido,
    sugestao: cadastrados.map(emUmaLinha).join(SEPARADOR_REFERENCIAS),
    motivo: "Endereço recebido difere do cadastrado no Contatos.",
  };
}

export function repetidasNaLista(nomes: readonly string[]): (number | undefined)[] {
  const primeira = new Map<string, number>();
  return nomes.map((nome, indice) => {
    const chave = normalizarNome(nome);
    if (chave === "") return undefined;
    const anterior = primeira.get(chave);
    if (anterior !== undefined) return anterior;
    primeira.set(chave, indice);
    return undefined;
  });
}
