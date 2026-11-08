import { REGRAS_TRATAMENTO } from "@/data/tratamentos";
import { normalizarTexto } from "@/lib/normalize";
import {
  alternativasDaLinha,
  comparacoesCoerencia,
  contatoEhFeminino,
  expandirFormas,
  formaNominal,
  linhaDeEnderecamento,
  resolverRegra,
  rotuloAchado,
} from "@/lib/tratamento";
import type { AchadoCoerencia, ContatoPlanilha } from "@/lib/types";
import type { Achado, CampoModelo } from "./tipos";

/** Cargo que a lista de convidados traz sem o órgão e que a tabela trata como "(sem cargo)". */
export const EXCECOES_CONVIDADOS: Readonly<Record<string, string>> = {
  "deputado federal": "Senador / Deputado Federal (sem cargo)",
};

const ACHADOS_DE_COERENCIA: readonly AchadoCoerencia[] = [
  "genero_tratamento_enderecamento",
  "genero_cargo_tratamento",
  "forma_generica",
];

/** Resolve só os marcadores de gênero ("X (Y)" no fim da linha e "palavra(a)"), mantendo "ou" e " / ". */
function resolverGenero(padrao: string, feminino: boolean): string {
  const [masculina, feminina] = alternativasDaLinha(padrao);
  const linha = feminino && feminina !== undefined ? feminina : masculina;
  return linha.replace(/(\S+?)\(a\)/g, (_, palavra: string) => {
    if (!feminino) return palavra;
    return palavra.endsWith("o") ? `${palavra.slice(0, -1)}a` : `${palavra}a`;
  });
}

/** Forma de exibição de um padrão da tabela no gênero da pessoa; " / " fica na primeira alternativa. */
export function formaNoGenero(padrao: string, feminino: boolean): string {
  return resolverGenero(padrao, feminino).split(" / ")[0].trim();
}

export interface EntradaProtocolo {
  linha: number;
  nome: string;
  cargo: string;
  tratamento: string;
  enderecamento: string;
}

/** Confere Tratamento e Endereçamento pela tabela v02 e pela coerência interna; no máximo um achado por campo. */
export function conferirProtocolo(entrada: EntradaProtocolo): Achado[] {
  const { linha, nome, cargo, tratamento, enderecamento } = entrada;
  const contato: ContatoPlanilha = { nome, grupo: "", cargo: cargo || undefined, tratamento, enderecamento };
  const feminino = contatoEhFeminino(contato);
  const achados: Achado[] = [];
  const campos = new Set<CampoModelo>();

  const acrescentar = (campo: CampoModelo, valorRecebido: string, sugestao: string, motivo: string): void => {
    if (campos.has(campo)) return;
    campos.add(campo);
    achados.push({ linha, nome, tipo: "revisar", campo, valorRecebido, sugestao, motivo });
  };

  const regra = resolverRegra(cargo, REGRAS_TRATAMENTO, EXCECOES_CONVIDADOS);
  const primeiraLinha = regra ? linhaDeEnderecamento(regra.enderecamento) : undefined;
  if (primeiraLinha) {
    const motivo = `Tabela de tratamentos v02 para '${cargo}'. Valor recebido mantido no arquivo.`;
    // A tabela aceita os dois gêneros, mas o convite sai no da pessoa: o outro gênero diverge.
    const diverge = (padrao: string, valor: string): boolean => {
      const aceitas = expandirFormas(resolverGenero(padrao, feminino), contato);
      return aceitas.length > 0 && !aceitas.includes(normalizarTexto(valor));
    };
    const nominal = formaNominal(primeiraLinha);
    if (nominal !== undefined && diverge(nominal, tratamento)) {
      acrescentar("TRATAMENTO", tratamento, formaNoGenero(nominal, feminino), motivo);
    }
    if (diverge(primeiraLinha, enderecamento)) {
      acrescentar("ENDERECAMENTO", enderecamento, formaNoGenero(primeiraLinha, feminino), motivo);
    }
  }

  for (const c of comparacoesCoerencia(contato)) {
    if (!c.achado || !ACHADOS_DE_COERENCIA.includes(c.achado)) continue;
    const campo: CampoModelo = c.campo === "tratamento" ? "TRATAMENTO" : "ENDERECAMENTO";
    acrescentar(campo, c.valorPlanilha, "", rotuloAchado(c.achado));
  }
  return achados;
}
