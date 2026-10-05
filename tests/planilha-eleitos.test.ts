import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { ColunaFaltanteError } from "@/lib/planilha";
import {
  juntarArquivosEleicao,
  lerPlanilhaEleicao,
  PlanilhaEleicaoDesconhecidaError,
  resumoArquivoEleicao,
  type ArquivoEleicaoLido,
} from "@/lib/planilha-eleitos";

function montar(abas: Record<string, Record<string, string | number>[]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [nome, linhas] of Object.entries(abas)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), nome);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const eleitoBase = {
  UF: "AC", "Nome de urna": "Fulana Teste", "Nome completo": "Fulana de Tal Teste", "Nome social": "",
  Partido: "PXX", "Situação (TSE)": "Eleito", "Status do mandato": "Reeleição",
  "Base do status": "Eleita em 2018", "Gênero (TSE)": "Feminino", Nascimento: "01/01/1970",
};

describe("lerPlanilhaEleicao", () => {
  test("planilha de senadores eleitos é reconhecida pela coluna '1º suplente'", () => {
    const buf = montar({ Eleitos: [{ ...eleitoBase, "1º suplente": "Suplente Um" }], "Leia-me": [{ a: "x" }] });
    const r = lerPlanilhaEleicao(buf);
    expect(r.tipo).toBe("senado");
    if (r.tipo !== "senado") throw new Error("tipo");
    expect(r.eleitos[0]).toEqual({
      casa: "senado", uf: "AC", nomeUrna: "Fulana Teste", nomeCompleto: "Fulana de Tal Teste", partido: "PXX",
      situacaoTse: "Eleito", statusMandato: "Reeleição", baseStatus: "Eleita em 2018", genero: "Feminino", nascimento: "01/01/1970",
    });
  });

  test("planilha de deputados eleitos não tem '1º suplente'", () => {
    const r = lerPlanilhaEleicao(montar({ Eleitos: [eleitoBase] }));
    expect(r.tipo).toBe("camara");
    if (r.tipo !== "camara") throw new Error("tipo");
    expect(r.eleitos[0].casa).toBe("camara");
  });

  test("planilha de deputados atuais é reconhecida pela aba 'Em exercício'; número vira texto", () => {
    const r = lerPlanilhaEleicao(montar({
      "Em exercício": [{
        UF: "AC", "Nome parlamentar": "Dep Teste", "Nome civil": "Deputado de Teste", Partido: "PXX", Sexo: "Masculino",
        "Condição eleitoral": "Titular", "Eleição 2026 (resumo)": "Eleito senador", "E-mail": "dep.teste@camara.leg.br",
        "Prédio": "4", Sala: "544", Telefone: "3215-5544", "ID Câmara": 123,
      }],
    }));
    expect(r.tipo).toBe("atuais");
    if (r.tipo !== "atuais") throw new Error("tipo");
    expect(r.deputados[0]).toMatchObject({ nomeParlamentar: "Dep Teste", nomeCivil: "Deputado de Teste", predio: "4", sala: "544", idCamara: "123", eleicao2026: "Eleito senador" });
  });

  test("linha sem nome nenhum é ignorada", () => {
    const r = lerPlanilhaEleicao(montar({ Eleitos: [eleitoBase, { ...eleitoBase, "Nome de urna": "", "Nome completo": "" }] }));
    if (r.tipo === "atuais") throw new Error("tipo");
    expect(r.eleitos).toHaveLength(1);
  });

  test("coluna obrigatória ausente é erro claro", () => {
    const { ["Status do mandato"]: _fora, ...semStatus } = eleitoBase;
    expect(() => lerPlanilhaEleicao(montar({ Eleitos: [semStatus] }))).toThrow(ColunaFaltanteError);
  });

  test("planilha sem as abas esperadas é recusada", () => {
    expect(() => lerPlanilhaEleicao(montar({ Folha1: [{ a: "1" }] }))).toThrow(PlanilhaEleicaoDesconhecidaError);
  });
});

describe("juntarArquivosEleicao", () => {
  const senado = (n: number): ArquivoEleicaoLido => ({
    nome: `senado-${n}.xlsx`,
    arquivo: { tipo: "senado", eleitos: Array.from({ length: n }, () => ({ casa: "senado" as const, uf: "AC", nomeUrna: "A", nomeCompleto: "A B", situacaoTse: "Eleito", statusMandato: "Reeleição" })) },
  });

  test("vale o último arquivo de cada tipo, sem somar em dobro", () => {
    const r = juntarArquivosEleicao([senado(2), senado(3)]);
    expect(r.eleitos).toHaveLength(3);
    expect(r.arquivosEleicao).toEqual(["senado-3.xlsx"]);
    expect(r.deputadosAtuais).toBeUndefined();
  });

  test("junta senado, câmara e atuais", () => {
    const r = juntarArquivosEleicao([
      senado(1),
      { nome: "camara.xlsx", arquivo: { tipo: "camara", eleitos: [] } },
      { nome: "atuais.xlsx", arquivo: { tipo: "atuais", deputados: [] } },
    ]);
    expect(r.arquivosEleicao).toEqual(["senado-1.xlsx", "camara.xlsx", "atuais.xlsx"]);
    expect(r.deputadosAtuais).toEqual([]);
  });
});

describe("resumoArquivoEleicao", () => {
  test("descreve cada tipo com a contagem", () => {
    expect(resumoArquivoEleicao({ tipo: "senado", eleitos: [] })).toBe("0 senadores eleitos");
    expect(resumoArquivoEleicao({ tipo: "camara", eleitos: [] })).toBe("0 deputados federais eleitos");
    expect(resumoArquivoEleicao({ tipo: "atuais", deputados: [] })).toBe("0 deputados federais em exercício");
  });
});
