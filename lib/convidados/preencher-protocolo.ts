import { REGRAS_TRATAMENTO } from "@/data/tratamentos";
import { generoDoCargo, type Genero } from "@/lib/cargos";
import { GRUPOS_DE_ELEITOS } from "@/lib/protocolo-fixo";
import { formaNominal, generoDaForma, linhaDeEnderecamento, resolverRegra } from "@/lib/tratamento";
import { mesmoGrupo } from "./grupo";
import { EXCECOES, formaNoGenero } from "./protocolo";

/**
 * Preenchimento de Tratamento e Endereçamento vazios pela regra (spec 2026-11-08 §16.3).
 * Só roda com a opção `--preencher-protocolo`, depois do aval do GT; campo preenchido nunca muda.
 */
export interface EntradaPreenchimento {
  cargo: string;
  grupo: string;
  tratamento: string;
  enderecamento: string;
}

export interface Preenchimento {
  tratamento: string;
  enderecamento: string;
  regras: string[];
  /** Por que os campos vazios ficaram vazios; `undefined` quando nada faltou ou tudo foi preenchido. */
  motivoSemPreenchimento?: string;
}

export const MOTIVO_SEM_GENERO = "Cargo não decide o gênero";
export const MOTIVO_SEM_REGRA = "Cargo sem regra na tabela de tratamentos";
const REGRA_ELEITOS = "eleitos (19/11)";

interface FormasDeProtocolo {
  tratamento: string;
  enderecamento: string;
  regra: string;
}

/** As formas no gênero da pessoa, decidido depois de achar a regra. */
type FormasPorGenero = (feminino: boolean) => FormasDeProtocolo;

/** Protocolo fixo dos eleitos (spec 2026-11-19 §2.1): "Senhor(a)" e "Ao Senhor" / "À Senhora". */
const formasDosEleitos: FormasPorGenero = (feminino) =>
  feminino
    ? { tratamento: "Senhora", enderecamento: "À Senhora", regra: REGRA_ELEITOS }
    : { tratamento: "Senhor", enderecamento: "Ao Senhor", regra: REGRA_ELEITOS };

/** Tabela v02 para o cargo: tratamento pela forma nominal da primeira linha, endereçamento pela primeira linha. */
function formasDaTabela(cargo: string): FormasPorGenero | undefined {
  const regra = resolverRegra(cargo, REGRAS_TRATAMENTO, EXCECOES);
  const primeiraLinha = regra ? linhaDeEnderecamento(regra.enderecamento) : undefined;
  const nominal = primeiraLinha ? formaNominal(primeiraLinha) : undefined;
  if (primeiraLinha === undefined || nominal === undefined) return undefined;
  return (feminino) => ({
    tratamento: formaNoGenero(nominal, feminino),
    enderecamento: formaNoGenero(primeiraLinha, feminino),
    regra: `tabela v02 para '${cargo}'`,
  });
}

function ehGrupoDeEleitos(grupo: string): boolean {
  return GRUPOS_DE_ELEITOS.some((g) => mesmoGrupo(g, grupo));
}

/**
 * Gênero pelo cargo ("Deputada Federal", "Deputado Federal eleito") e, quando o cargo não decide
 * ("Presidente do Tribunal", "Membro"), pelo campo de protocolo que já veio preenchido. Sem marca
 * em nenhum dos três, `indeterminado`: nunca "Senhor" por padrão (spec §16.3).
 */
function generoDaPessoa(cargo: string, tratamento: string, enderecamento: string): Genero {
  const doCargo = generoDoCargo(cargo);
  if (doCargo !== "indeterminado") return doCargo;
  const doTratamento = generoDaForma(tratamento);
  if (doTratamento !== "indeterminado") return doTratamento;
  return generoDaForma(enderecamento);
}

function semPreenchimento(tratamento: string, enderecamento: string, motivo: string): Preenchimento {
  return { tratamento, enderecamento, regras: [], motivoSemPreenchimento: motivo };
}

/**
 * Preenche só os campos vazios; devolve os valores (os preenchidos inalterados, aparados), as regras
 * aplicadas e, quando algum vazio não pôde ser preenchido, o motivo: cargo sem regra na tabela (fora
 * dos eleitos) ou gênero que nem o cargo nem o campo preenchido decidem.
 */
export function preencherProtocolo(entrada: EntradaPreenchimento): Preenchimento {
  const tratamento = entrada.tratamento.trim();
  const enderecamento = entrada.enderecamento.trim();
  const cargo = entrada.cargo.trim();
  const faltaTratamento = tratamento === "";
  const faltaEnderecamento = enderecamento === "";
  if (!faltaTratamento && !faltaEnderecamento) return { tratamento, enderecamento, regras: [] };
  if (cargo === "") return semPreenchimento(tratamento, enderecamento, MOTIVO_SEM_GENERO);

  const formas = ehGrupoDeEleitos(entrada.grupo) ? formasDosEleitos : formasDaTabela(cargo);
  if (formas === undefined) return semPreenchimento(tratamento, enderecamento, MOTIVO_SEM_REGRA);
  const genero = generoDaPessoa(cargo, tratamento, enderecamento);
  if (genero === "indeterminado") return semPreenchimento(tratamento, enderecamento, MOTIVO_SEM_GENERO);

  const escolhidas = formas(genero === "feminino");
  const regras = [
    ...(faltaTratamento ? [`Tratamento preenchido pela regra: ${escolhidas.regra}`] : []),
    ...(faltaEnderecamento ? [`Endereçamento preenchido pela regra: ${escolhidas.regra}`] : []),
  ];
  return {
    tratamento: faltaTratamento ? escolhidas.tratamento : tratamento,
    enderecamento: faltaEnderecamento ? escolhidas.enderecamento : enderecamento,
    regras,
  };
}
