import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { lerBaseEnderecos, lerPlanilhaEnderecos } from "@/lib/planilha-enderecos";
import { ColunaFaltanteError } from "@/lib/planilha";

function montarXlsx(linhas: Record<string, string>[]): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Folha1");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("lerPlanilhaEnderecos", () => {
  test("mapeia as colunas da exportação, com acento e caixa livres", () => {
    const buf = montarXlsx([
      {
        "Contato Id": "4711",
        "Endereço Id": "88",
        Nome: "Autoridade de Teste",
        Logradouro: "Setor de Autarquias Sul, Quadra 3",
        Numero: "S/N",
        Complemento: "Bloco A, sala 412",
        Bairro: "Asa Sul",
        Cidade: "Brasília",
        UF: "DF",
        "País": "Brasil",
        CEP: "70070-030",
        "Prioritário": "Sim",
      },
    ]);
    const linhas = lerPlanilhaEnderecos(buf);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      contatoId: "4711",
      enderecoId: "88",
      logradouro: "Setor de Autarquias Sul, Quadra 3",
      numero: "S/N",
      bairro: "Asa Sul",
      uf: "DF",
      cep: "70070-030",
      prioritario: true,
    });
  });

  test("Prioritário diferente de Sim é falso", () => {
    const buf = montarXlsx([{ "Contato Id": "1", "Prioritário": "Não" }]);
    expect(lerPlanilhaEnderecos(buf)[0].prioritario).toBe(false);
  });

  test("ignora a coluna de lixo da exportação e linhas sem Contato Id", () => {
    const buf = montarXlsx([
      { "&nbsp;": "x", "Contato Id": "1", Logradouro: "Rua A" },
      { "&nbsp;": "", "Contato Id": "", Logradouro: "" },
    ]);
    const linhas = lerPlanilhaEnderecos(buf);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].contatoId).toBe("1");
  });

  test("planilha sem Contato Id lança erro nomeando a coluna, em vez de junção vazia", () => {
    const buf = montarXlsx([{ Nome: "Autoridade de Teste", Logradouro: "Rua A", CEP: "70070-030" }]);
    expect(() => lerPlanilhaEnderecos(buf)).toThrow(ColunaFaltanteError);
    try {
      lerPlanilhaEnderecos(buf);
    } catch (err) {
      expect((err as ColunaFaltanteError).colunas).toEqual(["contato id"]);
    }
  });
});

describe("lerBaseEnderecos", () => {
  function montarAoa(linhas: unknown[][]): ArrayBuffer {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), "Folha1");
    return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  }

  test("guarda o cabeçalho em texto e as células como foram lidas (número continua número)", () => {
    const base = lerBaseEnderecos(montarAoa([
      ["&nbsp;", "Contato Id", "Numero"],
      [null, 4711, "LOTE 12"],
      [null, "A9", 15],
    ]));
    expect(base.cabecalho).toEqual(["&nbsp;", "Contato Id", "Numero"]);
    expect(base.linhas).toEqual([[null, 4711, "LOTE 12"], [null, "A9", 15]]);
  });

  test("descarta a linha sem valor da 2ª coluna em diante (null e texto vazio contam como vazio)", () => {
    const base = lerBaseEnderecos(montarAoa([
      ["x", "Contato Id", "Numero"],
      ["lixo", null, ""],
      [null, 1, "10"],
      [null, null, null],
    ]));
    expect(base.linhas).toEqual([[null, 1, "10"]]);
  });

  test("preenche com null a célula ausente no fim da linha", () => {
    const base = lerBaseEnderecos(montarAoa([["x", "Contato Id", "Numero"], [null, 2]]));
    expect(base.linhas).toEqual([[null, 2, null]]);
  });

  test("planilha sem linhas devolve cabeçalho vazio e nenhuma linha", () => {
    expect(lerBaseEnderecos(montarAoa([]))).toEqual({ cabecalho: [], linhas: [] });
  });
});
