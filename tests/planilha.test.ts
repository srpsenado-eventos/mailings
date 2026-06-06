import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { lerPlanilha, agruparPorGrupo, ColunaFaltanteError } from "@/lib/planilha";

function montarXlsx(linhas: Record<string, string>[]): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Contatos");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("lerPlanilha", () => {
  test("mapeia colunas esperadas (case-insensitive, com acento)", () => {
    const buf = montarXlsx([
      {
        Nome: "José Antônio", Grupo: "STF", "Órgão": "Supremo",
        Cargo: "Ministro", "E-mail": "jose@stf.br", Telefone: "61 0000",
        Endereço: "Praça dos Três Poderes", Tratamento: "Exmo.",
      },
    ]);
    const contatos = lerPlanilha(buf);
    expect(contatos).toHaveLength(1);
    expect(contatos[0]).toMatchObject({
      nome: "José Antônio", grupo: "STF", orgao: "Supremo",
      cargo: "Ministro", email: "jose@stf.br", endereco: "Praça dos Três Poderes",
    });
  });

  test("aceita cabeçalho em qualquer caixa/variação de acento", () => {
    const buf = montarXlsx([{ nome: "Maria", grupo: "TCU" }]);
    const contatos = lerPlanilha(buf);
    expect(contatos[0].nome).toBe("Maria");
    expect(contatos[0].grupo).toBe("TCU");
  });

  test("lança ColunaFaltanteError quando falta coluna obrigatória", () => {
    const buf = montarXlsx([{ Nome: "Sem grupo" }]);
    expect(() => lerPlanilha(buf)).toThrow(ColunaFaltanteError);
    expect(() => lerPlanilha(buf)).toThrow(/grupo/i);
  });

  test("ignora linhas totalmente vazias", () => {
    const buf = montarXlsx([
      { Nome: "Ana", Grupo: "TSE" },
      { Nome: "", Grupo: "" },
    ]);
    expect(lerPlanilha(buf)).toHaveLength(1);
  });

  test("planilha pesada de um único grupo com muitas linhas é lida só como texto", () => {
    // Simula o caso CNJ: 1 grupo, muitas linhas, coluna Foto preenchida (no real seriam imagens
    // embutidas, que o sheet_to_json ignora; aqui garantimos que texto na coluna Foto não derruba).
    const linhas = Array.from({ length: 500 }, (_, i) => ({
      Nome: `Conselheiro ${i}`,
      Grupo: "CNJ",
      Foto: "https://cnj.jus.br/fotos/foto-longa-placeholder.jpg",
      Cargo: "Conselheiro do CNJ",
    }));
    const buf = montarXlsx(linhas);

    const contatos = lerPlanilha(buf);

    expect(contatos).toHaveLength(500);
    const mapa = agruparPorGrupo(contatos);
    expect(mapa.size).toBe(1);
    expect(mapa.get("CNJ")).toHaveLength(500);
  });

  test("lê CSV com as mesmas colunas igual ao .xlsx", () => {
    const csv = "Nome,Grupo,Cargo,E-mail\nAna Lima,CNJ,Conselheira,ana@cnj.br\nBruno Sá,CNJ,Conselheiro,bruno@cnj.br\n";
    const buf = new TextEncoder().encode(csv).buffer;

    const contatos = lerPlanilha(buf);

    expect(contatos).toHaveLength(2);
    expect(contatos[0]).toMatchObject({ nome: "Ana Lima", grupo: "CNJ", cargo: "Conselheira", email: "ana@cnj.br" });
    expect(agruparPorGrupo(contatos).get("CNJ")).toHaveLength(2);
  });

  test("lê CSV com separador ponto-e-vírgula (Excel pt-BR)", () => {
    const csv = "Nome;Grupo;Cargo\nAna Lima;CNJ;Conselheira\n";
    const buf = new TextEncoder().encode(csv).buffer;

    const contatos = lerPlanilha(buf);

    expect(contatos).toHaveLength(1);
    expect(contatos[0]).toMatchObject({ nome: "Ana Lima", grupo: "CNJ", cargo: "Conselheira" });
  });
});

describe("agruparPorGrupo", () => {
  test("agrupa contatos pela coluna grupo", () => {
    const mapa = agruparPorGrupo([
      { nome: "A", grupo: "STF" },
      { nome: "B", grupo: "STF" },
      { nome: "C", grupo: "TCU" },
    ]);
    expect(mapa.get("STF")).toHaveLength(2);
    expect(mapa.get("TCU")).toHaveLength(1);
  });
});
