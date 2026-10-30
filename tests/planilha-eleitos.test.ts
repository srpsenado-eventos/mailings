import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { ColunaFaltanteError } from "@/lib/planilha";
import {
  juntarArquivosEleicao,
  lerPlanilhaEleicao,
  PlanilhaEleicaoDesconhecidaError,
  resumoArquivoEleicao,
  separarColisoesDeTipo,
  substituirPorTipo,
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
    expect(() => lerPlanilhaEleicao(montar({ Folha1: [{ a: "1" }] }))).toThrow(/Planilha não reconhecida: esperada a aba "Eleitos"/);
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

  test("o erro de planilha desconhecida cita 'Eleitos 1º turno' e a coluna 'Turno'", () => {
    expect(() => lerPlanilhaEleicao(montar({ Folha1: [{ a: "1" }] }))).toThrow(/Eleitos 1º turno/);
    expect(() => lerPlanilhaEleicao(montar({ Folha1: [{ a: "1" }] }))).toThrow(/coluna "Turno"/);
  });
});

// Layout do gerador do GT a partir de 24/10/2026: aba "Eleitos" com a coluna "Turno" e aba "2º turno"
// com as colunas do 1º turno sufixadas e as do 2º turno no fim.
const CABECALHO_ELEITOS_NOVO = [
  "UF", "Nome de urna", "Nome completo", "Partido", "Coligação / Federação", "Votos", "% votos válidos",
  "Situação (TSE)", "Turno", "Status do mandato", "Base do status", "Gênero (TSE)", "Nascimento", "Ocupação declarada", "Vice na chapa",
];
const linhaEleitoNovo = (uf: string, urna: string, turno: string): string[] => [
  uf, urna, `${urna} Completo`, "PXX", "Fed", "1000", "55", "Eleito", turno, "Mandato novo", "Primeiro turno", "Feminino", "01/01/1970", "Professora", `Vice de ${urna}`,
];
const CABECALHO_SEGUNDO_TURNO_NOVO = [
  "UF", "Nome de urna", "Nome completo", "Partido", "Coligação / Federação", "Votos (1º turno)", "% votos válidos (1º turno)",
  "Situação (TSE) (1º turno)", "Status do mandato", "Base do status", "Gênero (TSE)", "Nascimento", "Ocupação declarada", "Vice na chapa",
  "Votos (2º turno)", "% votos válidos (2º turno)", "Situação (TSE) 2º turno",
];
const linhaSegundoTurnoNovo = (uf: string, urna: string, situacao1: string, situacao2: string): string[] => [
  uf, urna, `${urna} Completo`, "PXX", "Fed", "900", "45", situacao1, "Mandato novo", "Segundo turno", "Masculino", "01/01/1970", "Advogado", `Vice de ${urna}`,
  "", "", situacao2,
];

describe("lerPlanilhaEleicao: governadores no layout novo (aba 'Eleitos' com 'Turno')", () => {
  test("aba 'Eleitos' com a coluna 'Turno' é governadores, não Câmara", () => {
    const r = lerPlanilhaEleicao(montarGoverno({
      Eleitos: [CABECALHO_ELEITOS_NOVO.slice(), linhaEleitoNovo("ac", "Gov Um", "1º turno")],
      "Leia-me": [["x"]],
    }));
    expect(r.tipo).toBe("governo");
    if (r.tipo !== "governo") throw new Error("tipo");
    expect(r.governadores.eleitos).toEqual([{
      uf: "AC", nomeUrna: "Gov Um", nomeCompleto: "Gov Um Completo", partido: "PXX", situacaoTse: "Eleito",
      statusMandato: "Mandato novo", baseStatus: "Primeiro turno", genero: "Feminino", vice: "Vice de Gov Um",
    }]);
    expect(r.governadores.segundoTurno).toEqual([]);
  });

  test("UF que já tem eleito na aba 'Eleitos' sai do 2º turno; a situação vem de 'Situação (TSE) 2º turno'", () => {
    const r = lerPlanilhaEleicao(montarGoverno({
      Eleitos: [CABECALHO_ELEITOS_NOVO.slice(), linhaEleitoNovo("AC", "Gov Um", "1º turno"), linhaEleitoNovo("SP", "Gov Tres", "2º turno")],
      "2º turno": [
        CABECALHO_SEGUNDO_TURNO_NOVO.slice(),
        linhaSegundoTurnoNovo("SP", "Gov Tres", "2º turno", "Eleito"),
        linhaSegundoTurnoNovo("SP", "Gov Quatro", "2º turno", "Não eleito"),
        linhaSegundoTurnoNovo("rj", "Gov Cinco", "2º turno", "Aguarda apuração"),
        linhaSegundoTurnoNovo("RJ", "Gov Seis", "2º turno", "Aguarda apuração"),
      ],
    }));
    if (r.tipo !== "governo") throw new Error("tipo");
    expect(r.governadores.eleitos.map((g) => g.uf)).toEqual(["AC", "SP"]);
    expect(r.governadores.segundoTurno.map((g) => [g.uf, g.nomeUrna, g.situacaoTse])).toEqual([
      ["RJ", "Gov Cinco", "Aguarda apuração"],
      ["RJ", "Gov Seis", "Aguarda apuração"],
    ]);
    expect(r.governadores.segundoTurno[0]).toMatchObject({ statusMandato: "Mandato novo", baseStatus: "Segundo turno", vice: "Vice de Gov Cinco" });
  });

  test("sem 'Situação (TSE) 2º turno', a situação do 2º turno vem de 'Situação (TSE) (1º turno)'", () => {
    const cab = CABECALHO_SEGUNDO_TURNO_NOVO.slice(0, 14);
    const r = lerPlanilhaEleicao(montarGoverno({
      Eleitos: [CABECALHO_ELEITOS_NOVO.slice(), linhaEleitoNovo("AC", "Gov Um", "1º turno")],
      "2º turno": [cab, linhaSegundoTurnoNovo("RJ", "Gov Cinco", "2º turno", "ignorada").slice(0, 14)],
    }));
    if (r.tipo !== "governo") throw new Error("tipo");
    expect(r.governadores.segundoTurno).toHaveLength(1);
    expect(r.governadores.segundoTurno[0].situacaoTse).toBe("2º turno");
  });

  test("'Situação (TSE) (2º turno)', com parênteses, também vale como situação do 2º turno", () => {
    const cab = CABECALHO_SEGUNDO_TURNO_NOVO.map((c) => (c === "Situação (TSE) 2º turno" ? "Situação (TSE) (2º turno)" : c));
    const r = lerPlanilhaEleicao(montarGoverno({
      Eleitos: [CABECALHO_ELEITOS_NOVO.slice(), linhaEleitoNovo("AC", "Gov Um", "1º turno")],
      "2º turno": [cab, linhaSegundoTurnoNovo("RJ", "Gov Cinco", "2º turno", "Aguarda apuração")],
    }));
    if (r.tipo !== "governo") throw new Error("tipo");
    expect(r.governadores.segundoTurno[0].situacaoTse).toBe("Aguarda apuração");
  });

  test("aba '2º turno' sem nenhuma coluna de situação não derruba o arquivo: situação fica vazia", () => {
    const cab = CABECALHO_SEGUNDO_TURNO_NOVO.filter((c) => !c.startsWith("Situação"));
    const r = lerPlanilhaEleicao(montarGoverno({
      Eleitos: [CABECALHO_ELEITOS_NOVO.slice(), linhaEleitoNovo("AC", "Gov Um", "1º turno")],
      "2º turno": [cab, linhaSegundoTurnoNovo("RJ", "Gov Cinco", "x", "y").filter((_, i) => i !== 7 && i !== 16)],
    }));
    if (r.tipo !== "governo") throw new Error("tipo");
    expect(r.governadores.eleitos).toHaveLength(1);
    expect(r.governadores.segundoTurno).toEqual([expect.objectContaining({ uf: "RJ", nomeUrna: "Gov Cinco", situacaoTse: "" })]);
  });

  test("aba '2º turno' sem 'Status do mandato' continua sendo erro claro", () => {
    const cab = CABECALHO_SEGUNDO_TURNO_NOVO.filter((c) => c !== "Status do mandato");
    expect(() => lerPlanilhaEleicao(montarGoverno({
      Eleitos: [CABECALHO_ELEITOS_NOVO.slice(), linhaEleitoNovo("AC", "Gov Um", "1º turno")],
      "2º turno": [cab, linhaSegundoTurnoNovo("RJ", "Gov Cinco", "x", "y").filter((_, i) => i !== 8)],
    }))).toThrow(ColunaFaltanteError);
  });

  test("aba '2º turno' vazia no layout novo dá lista vazia", () => {
    const r = lerPlanilhaEleicao(montarGoverno({
      Eleitos: [CABECALHO_ELEITOS_NOVO.slice(), linhaEleitoNovo("AC", "Gov Um", "1º turno")],
      "2º turno": [CABECALHO_SEGUNDO_TURNO_NOVO.slice()],
    }));
    if (r.tipo !== "governo") throw new Error("tipo");
    expect(r.governadores.segundoTurno).toEqual([]);
  });

  test("aba 'Eleitos' sem a coluna 'Turno' continua sendo deputados federais eleitos", () => {
    const cab = CABECALHO_ELEITOS_NOVO.filter((c) => c !== "Turno");
    const r = lerPlanilhaEleicao(montarGoverno({ Eleitos: [cab, linhaEleitoNovo("AC", "Dep Um", "").filter((_, i) => i !== 8)] }));
    expect(r.tipo).toBe("camara");
  });

  test("layout antigo: UF que aparece nas duas abas também sai do 2º turno", () => {
    const r = lerPlanilhaEleicao(montarGoverno({
      "Eleitos 1º turno": [CABECALHO_GOVERNO.slice(), linhaGoverno("SP", "Gov Um", "V")],
      "2º turno": [CABECALHO_GOVERNO.slice(), linhaGoverno("SP", "Gov Dois", "V"), linhaGoverno("RJ", "Gov Tres", "V")],
    }));
    if (r.tipo !== "governo") throw new Error("tipo");
    expect(r.governadores.segundoTurno.map((g) => g.uf)).toEqual(["RJ"]);
  });
});

describe("separarColisoesDeTipo", () => {
  const camara = (nome: string): ArquivoEleicaoLido => ({ nome, arquivo: { tipo: "camara", eleitos: [] } });
  const governo = (nome: string): ArquivoEleicaoLido => ({ nome, arquivo: { tipo: "governo", governadores: { eleitos: [], segundoTurno: [] } } });

  test("tipos distintos: todos aceitos, sem colisão", () => {
    const r = separarColisoesDeTipo([camara("c.xlsx"), governo("g.xlsx")]);
    expect(r.aceitos.map((l) => l.nome)).toEqual(["c.xlsx", "g.xlsx"]);
    expect(r.colisoes).toEqual([]);
  });

  test("dois arquivos do mesmo tipo: nenhum dos dois entra e a mensagem cita os dois e o tipo", () => {
    const r = separarColisoesDeTipo([camara("Deputados Federais Eleitos 2026.xlsx"), governo("g.xlsx"), camara("Governadores Eleitos 2026.xlsx")]);
    expect(r.aceitos.map((l) => l.nome)).toEqual(["g.xlsx"]);
    expect(r.colisoes).toEqual([
      '"Deputados Federais Eleitos 2026.xlsx" e "Governadores Eleitos 2026.xlsx" foram reconhecidos como deputados federais eleitos; escolha um deles.',
    ]);
  });

  test("três do mesmo tipo: a mensagem lista os três", () => {
    const r = separarColisoesDeTipo([camara("a.xlsx"), camara("b.xlsx"), camara("c.xlsx")]);
    expect(r.aceitos).toEqual([]);
    expect(r.colisoes).toEqual(['"a.xlsx", "b.xlsx" e "c.xlsx" foram reconhecidos como deputados federais eleitos; escolha um deles.']);
  });

  test("lista vazia: nada a separar", () => {
    expect(separarColisoesDeTipo([])).toEqual({ aceitos: [], colisoes: [] });
  });

  test("Senado (com '1º suplente') e governadores (com 'Turno') na mesma seleção são tipos distintos", () => {
    const senado = lerPlanilhaEleicao(montar({ Eleitos: [{ ...eleitoBase, "1º suplente": "Suplente Um" }] }));
    const governo = lerPlanilhaEleicao(montarGoverno({ Eleitos: [CABECALHO_ELEITOS_NOVO.slice(), linhaEleitoNovo("AC", "Gov Um", "1º turno")] }));
    const r = separarColisoesDeTipo([{ nome: "s.xlsx", arquivo: senado }, { nome: "g.xlsx", arquivo: governo }]);
    expect(r.aceitos.map((l) => l.arquivo.tipo)).toEqual(["senado", "governo"]);
    expect(r.colisoes).toEqual([]);
  });
});

describe("substituirPorTipo", () => {
  const lido = (nome: string, tipo: "senado" | "camara"): ArquivoEleicaoLido => ({ nome, arquivo: { tipo, eleitos: [] } });

  test("arquivo novo troca só o do mesmo tipo; os outros ficam, e os novos vão para o fim", () => {
    const r = substituirPorTipo([lido("s1.xlsx", "senado"), lido("c1.xlsx", "camara")], [lido("s2.xlsx", "senado")]);
    expect(r.map((l) => l.nome)).toEqual(["c1.xlsx", "s2.xlsx"]);
  });

  test("sem novos, devolve a lista igual; não muda as listas recebidas", () => {
    const atual = [lido("s1.xlsx", "senado")];
    expect(substituirPorTipo(atual, [])).toEqual(atual);
    substituirPorTipo(atual, [lido("s2.xlsx", "senado")]);
    expect(atual.map((l) => l.nome)).toEqual(["s1.xlsx"]);
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

describe("lerPlanilhaEleicao: deputado.xls do site da Câmara", () => {
  const CABECALHO_CAMARA = [
    "Nome Parlamentar", "Partido", "UF", "Titular/Suplente/Efetivado", "Endereço", "Anexo", "Endereço (continuação)", "Gabinete",
    "Endereço (complemento)", "Telefone", "Fax", "Mês Aniversário", "Dia Aniversário", "Correio Eletrônico", "Nome sem Acento",
    "Tratamento", "Nome Civil",
  ];
  const linhaCamara = (nome: string, partido: string, uf: string, condicao: string, gabinete: number | string, tratamento: string, civil: string, email: string) => [
    nome, partido, uf, condicao, "Câmara dos Deputados, Edifício Anexo", "4", ", gabinete nº", gabinete, "Brasília - DF - CEP 70160-900",
    "3215-5414", "3215-2414", "09", "28", email, nome, tratamento, civil,
  ];

  function montarCamara(aba = "Atualização - 29-10-2026 15-55"): ArrayBuffer {
    const wb = XLSX.utils.book_new();
    const linhas = [
      CABECALHO_CAMARA,
      linhaCamara("Leo Prates", "PDT", "BA", "T", 646, "Exmo. Senhor Deputado", "LEONARDO SILVA PRATES", "dep.leoprates@camara.leg.br"),
      linhaCamara("Professora Luciene Cavalcante", "PSOL", "SP", "S", 312, "Exma. Senhora Deputada", "LUCIENE CAVALCANTE", "dep.lucienecavalcante@camara.leg.br"),
      linhaCamara("Zé Adriano", "PP", "AC", "E", 101, "Exmo. Senhor Deputado", "JOSE ADRIANO", "dep.zeadriano@camara.leg.br"),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), aba);
    return XLSX.write(wb, { bookType: "biff8", type: "array" }) as ArrayBuffer;
  }

  test("o .xls da Câmara é reconhecido pelas colunas, qualquer que seja o nome da aba", () => {
    const r = lerPlanilhaEleicao(montarCamara());
    expect(r.tipo).toBe("atuais");
    if (r.tipo !== "atuais") throw new Error("tipo");
    expect(r.deputados).toHaveLength(3);
    expect(r.deputados.map((d) => d.condicao)).toEqual(["Titular", "Suplente", "Efetivado"]);
  });

  test("mapeia nome, UF, partido, sexo pelo tratamento, e-mail, telefone, prédio e sala (gabinete em texto)", () => {
    const r = lerPlanilhaEleicao(montarCamara());
    if (r.tipo !== "atuais") throw new Error("tipo");
    const [leo, luciene] = r.deputados;
    expect(leo).toEqual({
      uf: "BA", nomeParlamentar: "Leo Prates", nomeCivil: "LEONARDO SILVA PRATES", partido: "PDT", sexo: "Masculino",
      condicao: "Titular", email: "dep.leoprates@camara.leg.br", telefone: "3215-5414", predio: "4", sala: "646",
    });
    expect(luciene.sexo).toBe("Feminino");
    expect(r.deputados.every((d) => d.eleicao2026 === undefined)).toBe(true);
  });

  test("o reconhecimento pelas colunas vale mesmo com uma aba chamada 'Eleitos'", () => {
    const r = lerPlanilhaEleicao(montarCamara("Eleitos"));
    expect(r.tipo).toBe("atuais");
  });

  test("a planilha antiga 'Em exercício' continua sendo lida", () => {
    const r = lerPlanilhaEleicao(montar({ "Em exercício": [{ UF: "AC", "Nome parlamentar": "Fulano", "Nome civil": "Fulano de Tal", "Condição eleitoral": "Reeleito" }] }));
    expect(r.tipo).toBe("atuais");
    if (r.tipo !== "atuais") throw new Error("tipo");
    expect(r.deputados[0].condicao).toBe("Reeleito");
  });

  test("a mensagem de planilha não reconhecida cita também a planilha da Câmara", () => {
    expect(() => lerPlanilhaEleicao(montar({ Folha1: [{ a: "1" }] }))).toThrow(/Nome Parlamentar.*Titular\/Suplente\/Efetivado.*Nome Civil/);
  });
});
