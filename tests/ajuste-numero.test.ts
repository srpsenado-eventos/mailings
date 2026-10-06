import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import {
  colunasDaBase,
  gerarXlsxAjustes,
  gerarXlsxCarga,
  gruposPorContatoDoRetrato,
  montarAjusteNumero,
  nomesArquivosProdasen,
  proporNumero,
  sufixoDaData,
  textoCelula,
} from "@/lib/ajuste-numero";
import { ColunaFaltanteError } from "@/lib/planilha";
import type { BaseEnderecos, CelulaBase, ResultadoGrupo } from "@/lib/types";

const CABECALHO = ["&nbsp;", "Contato Id", "Endereço Id", "Tratamento", "Nome", "Logradouro", "Numero", "Complemento", "Bairro", "Cidade", "UF", "País", "CEP", "Prioritário"];

const linha = (contato: number, endereco: number, nome: string, numero: CelulaBase, extra: Partial<Record<string, CelulaBase>> = {}): CelulaBase[] => [
  "<a>", contato, endereco, extra.tratamento ?? "Sr.", nome, extra.logradouro ?? "Rua Fictícia", numero,
  extra.complemento ?? null, extra.bairro ?? "Centro", extra.cidade ?? "Cidade X", extra.uf ?? "SP", "Brasil", extra.cep ?? 1234567, "Sim",
];

const base = (...linhas: CelulaBase[][]): BaseEnderecos => ({ cabecalho: CABECALHO, linhas });
const lerAba = (buf: ArrayBuffer, aba: string): unknown[][] => {
  const wb = XLSX.read(buf, { type: "array" });
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba], { header: 1, defval: null });
};

describe("proporNumero", () => {
  test.each([
    ["Lote 05/06", "LT 5/6"],
    ["Lotes 1, 2", "LT 1/2"],
    ["Lotes 1 / 2", "LT 1/2"],
    ["Casa 02", "CS 02"],
    ["Chácara 10", "CH 10"],
    ["Chacara 10", "CH 10"],
    ["CHÁCARA 10", "CH 10"],
    ["Lote 09/10", "LT9/10"],
    ["Bloco A", "BL A"],
    ["  Lote 05/06  ", "LT 5/6"],
  ])("%s vira %s", (entrada, esperado) => {
    expect(proporNumero(entrada)).toBe(esperado);
  });

  test("devolve undefined quando o valor não começa por palavra conhecida", () => {
    expect(proporNumero("Quadra 5 Conj 3")).toBeUndefined();
  });

  test("tira zeros à esquerda de cada parte, mantendo 0 sozinho", () => {
    expect(proporNumero("Lote 00/0100")).toBe("LT0/100");
  });
});

describe("textoCelula", () => {
  test("vazio para null e texto aparado para o resto", () => {
    expect(textoCelula(null)).toBe("");
    expect(textoCelula("  x ")).toBe("x");
    expect(textoCelula(12)).toBe("12");
  });
});

describe("colunasDaBase", () => {
  test("localiza as colunas pelo cabeçalho normalizado", () => {
    const c = colunasDaBase(CABECALHO);
    expect(c.contatoId).toBe(1);
    expect(c.enderecoId).toBe(2);
    expect(c.nome).toBe(4);
    expect(c.numero).toBe(6);
    expect(c.cep).toBe(12);
  });

  test("lança ColunaFaltanteError quando falta o Número", () => {
    expect(() => colunasDaBase(CABECALHO.filter((c) => c !== "Numero"))).toThrow(ColunaFaltanteError);
  });

  test("aceita cabeçalho com acento e caixa diferentes", () => {
    const c = colunasDaBase(["CONTATO ID", "endereço id", "Número"]);
    expect(c).toMatchObject({ contatoId: 0, enderecoId: 1, numero: 2 });
  });
});

describe("montarAjusteNumero", () => {
  test("só entra quem passa de 6 caracteres e tem proposta; o que cabe fica de fora", () => {
    const r = montarAjusteNumero(base(
      linha(1, 10, "Ana", "Lote 1"),
      linha(2, 20, "Bia", "Lote 05/06"),
      linha(3, 30, "Caio", "Quadra 5 Conj 3"),
    ), new Map());
    expect(r.enderecos).toBe(3);
    expect(r.casos.map((c) => c.numeroProposto)).toEqual(["LT 5/6"]);
    expect(r.semProposta).toEqual([{ contatoId: 3, enderecoId: 30, nome: "Caio", numeroAtual: "Quadra 5 Conj 3" }]);
  });

  test("Bloco leva a observação; os demais, vazio", () => {
    const r = montarAjusteNumero(base(linha(1, 10, "Ana", "Bloco A1234"), linha(2, 20, "Bia", "Casa 123456")), new Map());
    const porNome = Object.fromEntries(r.casos.map((c) => [c.nome, c.observacao]));
    expect(porNome.Ana).toBe("Valor novo desde 23/09: Bloco não é número; conferir se BL A é aceito ou se vira S/N");
    expect(porNome.Bia).toBe("");
  });

  test("ordena pelo nome em minúsculas, mantendo a ordem original nos empates", () => {
    const r = montarAjusteNumero(base(
      linha(1, 11, "zeca", "Lote 05/06"),
      linha(2, 12, "Ana", "Lote 05/06"),
      linha(3, 13, "ana", "Lote 07/08"),
      linha(4, 14, "Bia", "Lote 05/06"),
    ), new Map());
    expect(r.casos.map((c) => c.enderecoId)).toEqual([12, 13, 14, 11]);
  });

  test("conta contatos distintos e anexa os grupos pelo Contato Id como texto", () => {
    const r = montarAjusteNumero(base(
      linha(7, 10, "Ana", "Lote 05/06"),
      linha(7, 11, "Ana", "Lote 07/08"),
      linha(8, 12, "Bia", "Lote 05/06"),
    ), new Map([["7", ["Senadores", "Ministros"]]]));
    expect(r.contatos).toBe(2);
    expect(r.casos.filter((c) => c.contatoId === 7).every((c) => c.grupos.join("|") === "Senadores|Ministros")).toBe(true);
    expect(r.casos.find((c) => c.contatoId === 8)?.grupos).toEqual([]);
  });

  test("compara o Número como texto aparado, mesmo vindo numérico", () => {
    const r = montarAjusteNumero(base(linha(1, 10, "Ana", 1234567)), new Map());
    expect(r.casos).toHaveLength(0);
    expect(r.semProposta).toHaveLength(1);
  });
});

describe("sufixoDaData e nomes dos arquivos", () => {
  test("usa o dia de Brasília", () => {
    expect(sufixoDaData("2026-10-05T15:00:00.000Z")).toBe("05OUT2026");
  });

  test("na virada de dia UTC, vale o dia anterior em Brasília", () => {
    expect(sufixoDaData("2026-10-06T01:30:00.000Z")).toBe("05OUT2026");
    expect(sufixoDaData("2026-01-01T02:00:00.000Z")).toBe("31DEZ2025");
  });

  test("nomes dos dois arquivos levam o sufixo", () => {
    expect(nomesArquivosProdasen("2026-10-05T15:00:00.000Z")).toEqual({
      carga: "BASE DE ENDERECO - 05OUT2026 - carga PRODASEN.xlsx",
      ajustes: "Numero mais de 6 caracteres - ajustes 05OUT2026.xlsx",
    });
  });
});

describe("gerarXlsxCarga", () => {
  test("traz a base inteira na aba Folha1 com só o Número dos ajustados trocado", () => {
    const b = base(linha(1, 10, "Ana", "Lote 05/06"), linha(2, 20, "Bia", "Lote 1"), linha(3, 30, "Caio", "Quadra 5 Conj 3"));
    const copia = JSON.parse(JSON.stringify(b)) as BaseEnderecos;
    const aj = montarAjusteNumero(b, new Map());
    const lido = lerAba(gerarXlsxCarga(b, aj), "Folha1");
    expect(lido[0]).toEqual(CABECALHO);
    expect(lido[1]).toEqual(linha(1, 10, "Ana", "LT 5/6"));
    expect(lido[2]).toEqual(b.linhas[1]);
    expect(lido[3]).toEqual(b.linhas[2]);
    expect(lido).toHaveLength(4);
    expect(b).toEqual(copia);
  });
});

describe("gerarXlsxAjustes", () => {
  const b = base(
    linha(1, 10, "Ana", "Lote 05/06", { complemento: "Ap 1", cep: 1234567 }),
    linha(2, 20, "Bia", "Lote 05/06"),
    linha(3, 30, "Caio", "Bloco A1234"),
    linha(4, 40, "Davi", "Quadra 5 Conj 3"),
  );
  const aj = montarAjusteNumero(b, new Map([["1", ["Senadores", "Ministros"]]]));
  const buf = gerarXlsxAjustes(aj, { fonte: "BASE ENDERECO.xlsx", geradoEm: "2026-10-05T15:00:00.000Z" });

  test("tem as quatro abas, na ordem", () => {
    expect(XLSX.read(buf, { type: "array" }).SheetNames).toEqual(["Resumo", "Ajustes", "De-Para", "Sem proposta"]);
  });

  test("Ajustes: cabeçalho exato, valores e grupos", () => {
    const l = lerAba(buf, "Ajustes");
    expect(l[0]).toEqual(["Contato Id", "Endereço Id", "Tratamento", "Nome", "Logradouro", "Número ATUAL", "Caracteres (atual)", "Número PROPOSTO", "Caracteres (proposto)", "Observação", "Complemento", "Bairro", "Cidade", "UF", "CEP", "Grupo na Posse"]);
    expect(l[1]).toEqual([1, 10, "Sr.", "Ana", "Rua Fictícia", "Lote 05/06", 10, "LT 5/6", 6, null, "Ap 1", "Centro", "Cidade X", "SP", "1234567", "Senadores; Ministros"]);
    expect(l).toHaveLength(4);
  });

  test("De-Para: um par por valor atual, com a quantidade", () => {
    const l = lerAba(buf, "De-Para");
    expect(l[0]).toEqual(["Número ATUAL", "Número PROPOSTO", "Qtd de endereços"]);
    expect(l.slice(1)).toEqual([["Bloco A1234", "BLA1234", 1], ["Lote 05/06", "LT 5/6", 2]]);
  });

  test("Sem proposta: cabeçalho e os casos que a regra não resolve", () => {
    expect(lerAba(buf, "Sem proposta")).toEqual([
      ["Contato Id", "Endereço Id", "Nome", "Número ATUAL"],
      [4, 40, "Davi", "Quadra 5 Conj 3"],
    ]);
  });

  test("Sem proposta vazio traz só o cabeçalho", () => {
    const vazio = montarAjusteNumero(base(linha(1, 10, "Ana", "Lote 1")), new Map());
    const l = lerAba(gerarXlsxAjustes(vazio, { fonte: "x.xlsx", geradoEm: "2026-10-05T15:00:00.000Z" }), "Sem proposta");
    expect(l).toEqual([["Contato Id", "Endereço Id", "Nome", "Número ATUAL"]]);
  });

  test("Resumo: título com a data, fonte, contagens como valores e a regra", () => {
    const l = lerAba(buf, "Resumo");
    expect(l[0][0]).toBe("Número do endereço com mais de 6 caracteres: rodada de 05/10/2026");
    expect(l[2]).toEqual(["Fonte", "BASE ENDERECO.xlsx"]);
    expect(l[4]).toEqual(["Indicador", "Qtd"]);
    expect(l[5]).toEqual(["Endereços na base", 4]);
    expect(l[6]).toEqual(["Endereços com Número acima de 6 caracteres", 3]);
    expect(l[7]).toEqual(["Usuários (Contato Id distintos) afetados", 3]);
    expect(l[8]).toEqual(["Valores distintos a trocar (aba De-Para)", 2]);
    expect(l[9]).toEqual(["Propostos que ainda passam de 6", 1]);
    expect(l[10]).toEqual(["Casos sem proposta automática", 1]);
    expect(l[12][0]).toBe("Regra (a mesma validada em 23/09; o campo aceita letras e barra)");
    expect(l[13][0]).toBe("Lote → LT, Casa → CS, Chácara → CH, Bloco → BL.");
    expect(l[17][0]).toBe("O arquivo de carga traz a base inteira com só o campo Numero alterado nestes endereços.");
    expect(l.flat().some((v) => typeof v === "string" && v.startsWith("="))).toBe(false);
  });
});

describe("gruposPorContatoDoRetrato", () => {
  const grupo = (nome: string, ids: (string | undefined)[]): ResultadoGrupo =>
    ({ grupo: nome, contatos: ids.map((id) => ({ contato: { id } })) }) as unknown as ResultadoGrupo;

  test("mapeia o Contato Id para os grupos, sem repetir e ignorando contato sem Id", () => {
    const mapa = gruposPorContatoDoRetrato([
      grupo("Grupo A", ["1", "2", "1", undefined]),
      grupo("Grupo B", ["1"]),
    ]);

    expect(mapa.get("1")).toEqual(["Grupo A", "Grupo B"]);
    expect(mapa.get("2")).toEqual(["Grupo A"]);
    expect(mapa.size).toBe(2);
  });
});
