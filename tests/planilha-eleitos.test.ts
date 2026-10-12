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
    if (r.tipo === "atuais" || r.tipo === "governo") throw new Error("tipo");
    expect(r.eleitos).toHaveLength(1);
  });

  test("coluna obrigatória ausente é erro claro", () => {
    const { ["Status do mandato"]: _fora, ...semStatus } = eleitoBase;
    expect(() => lerPlanilhaEleicao(montar({ Eleitos: [semStatus] }))).toThrow(ColunaFaltanteError);
  });

  test("planilha sem as abas esperadas é recusada", () => {
    expect(() => lerPlanilhaEleicao(montar({ Folha1: [{ a: "1" }] }))).toThrow(PlanilhaEleicaoDesconhecidaError);
    expect(() => lerPlanilhaEleicao(montar({ Folha1: [{ a: "1" }] }))).toThrow('Planilha não reconhecida: esperada a aba "Eleitos" (senadores ou deputados eleitos), "Em exercício" (deputados atuais) ou "Eleitos 1º turno" (governadores).');
  });
});

const CABECALHO_GOVERNO = [
  "UF", "Nome de urna", "Nome completo", "Partido", "Coligação / Federação", "Votos", "% votos válidos",
  "Situação (TSE)", "Status do mandato", "Base do status", "Gênero (TSE)", "Nascimento", "Ocupação declarada", "Vice na chapa",
];
const linhaGoverno = (uf: string, urna: string, vice: string): string[] => [
  uf, urna, `${urna} Completo`, "PXX", "Fed", "1000", "55", "Eleito", "Mandato novo", "Primeiro turno", "Feminino", "01/01/1970", "Professora", vice,
];

function montarGoverno(abas: Record<string, string[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [nome, linhas] of Object.entries(abas)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nome);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("lerPlanilhaEleicao: governadores", () => {
  test("lê as abas '1º turno' e '2º turno', UF em maiúsculas e vice", () => {
    const r = lerPlanilhaEleicao(montarGoverno({
      "Eleitos 1º turno": [CABECALHO_GOVERNO.slice(), linhaGoverno("ac", "Gov Um", "Vice Um"), linhaGoverno("ba", "Gov Dois", "Vice Dois")],
      "2º turno": [CABECALHO_GOVERNO.slice(), linhaGoverno("sp", "Gov Tres", "Vice Tres"), linhaGoverno("sp", "Gov Quatro", "Vice Quatro")],
      "Leia-me": [["x"]],
    }));
    expect(r.tipo).toBe("governo");
    if (r.tipo !== "governo") throw new Error("tipo");
    expect(r.governadores.eleitos).toHaveLength(2);
    expect(r.governadores.segundoTurno).toHaveLength(2);
    expect(r.governadores.eleitos[0]).toEqual({
      uf: "AC", nomeUrna: "Gov Um", nomeCompleto: "Gov Um Completo", partido: "PXX", situacaoTse: "Eleito",
      statusMandato: "Mandato novo", baseStatus: "Primeiro turno", genero: "Feminino", vice: "Vice Um",
    });
  });

  test("sem a aba '2º turno', segundoTurno é vazio", () => {
    const r = lerPlanilhaEleicao(montarGoverno({ "Eleitos 1º turno": [CABECALHO_GOVERNO.slice(), linhaGoverno("AC", "Gov Um", "V")] }));
    if (r.tipo !== "governo") throw new Error("tipo");
    expect(r.governadores.segundoTurno).toEqual([]);
  });

  test("aba '2º turno' só com cabeçalho dá lista vazia", () => {
    const r = lerPlanilhaEleicao(montarGoverno({
      "Eleitos 1º turno": [CABECALHO_GOVERNO.slice(), linhaGoverno("AC", "Gov Um", "V")],
      "2º turno": [CABECALHO_GOVERNO.slice()],
    }));
    if (r.tipo !== "governo") throw new Error("tipo");
    expect(r.governadores.segundoTurno).toEqual([]);
  });

  test("'Eleitos 1º turno' sem 'Status do mandato' é erro claro", () => {
    const cab = CABECALHO_GOVERNO.slice().filter((c) => c !== "Status do mandato");
    expect(() => lerPlanilhaEleicao(montarGoverno({ "Eleitos 1º turno": [cab] }))).toThrow(ColunaFaltanteError);
  });

  test("o erro de planilha desconhecida cita 'Eleitos 1º turno'", () => {
    expect(() => lerPlanilhaEleicao(montar({ Folha1: [{ a: "1" }] }))).toThrow(/Eleitos 1º turno/);
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

  test("senado + governo: eleitos só do senado, governadores presentes", () => {
    const governadores = { eleitos: [], segundoTurno: [] };
    const r = juntarArquivosEleicao([senado(2), { nome: "gov.xlsx", arquivo: { tipo: "governo", governadores } }]);
    expect(r.eleitos).toHaveLength(2);
    expect(r.governadores).toBe(governadores);
    expect(r.arquivosEleicao).toEqual(["senado-2.xlsx", "gov.xlsx"]);
  });

  test("sem arquivo de governo, governadores fica ausente", () => {
    expect(juntarArquivosEleicao([senado(1)]).governadores).toBeUndefined();
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

  test("governo: conta eleitos e UFs distintas do 2º turno", () => {
    const g = (uf: string) => ({ uf, nomeUrna: "A", nomeCompleto: "A B", situacaoTse: "Eleito", statusMandato: "Mandato novo" });
    const eleitos = Array.from({ length: 20 }, () => g("AC"));
    const segundoTurno = [g("SP"), g("SP"), g("RJ")];
    expect(resumoArquivoEleicao({ tipo: "governo", governadores: { eleitos, segundoTurno } })).toBe("20 governadores eleitos · 2 UFs no 2º turno");
    expect(resumoArquivoEleicao({ tipo: "governo", governadores: { eleitos, segundoTurno: [] } })).toBe("20 governadores eleitos");
  });
});
