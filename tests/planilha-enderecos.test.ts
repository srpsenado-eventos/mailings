import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { lerPlanilhaEnderecos } from "@/lib/planilha-enderecos";
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
