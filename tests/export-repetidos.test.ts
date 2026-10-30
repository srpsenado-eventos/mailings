import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { CABECALHO_REPETIDAS, descreverOcorrencia, gerarXlsxRepetidas, linhasRepetidas } from "@/lib/export-repetidos";
import { HISTORICO_VAZIO, registrar, type RegistroManual } from "@/lib/decisoes";
import { autoridadesRepetidas, type OcorrenciaRepetida } from "@/lib/repetidos";
import type { EleitoClassificado, ResultadoContato, ResultadoEleicao, ResultadoGrupo } from "@/lib/types";

const linha = (nome: string, cargo: string): ResultadoContato => ({
  contato: { nome, cargo, grupo: "x" }, semaforo: "verde", score: 1, comparacoes: [], camposDivergentes: [], origem: "oficial",
});
const grupo = (nome: string, contatos: ResultadoContato[]): ResultadoGrupo => ({ grupo: nome, semFonte: false, contatos, novos: [] });

const lista = autoridadesRepetidas([
  grupo("Ministros do STF", [linha("Ana Fictícia", "Ministra do Supremo Tribunal Federal")]),
  grupo("Ministros do TSE", [linha("Ana Fictícia", "Ministra do Tribunal Superior Eleitoral")]),
  grupo("Ex-Presidentes do Senado", [linha("Rui Fictício", "")]),
  grupo("Senadores", [linha("Rui Fictício", "Senador")]),
]);

describe("export das autoridades em mais de um grupo", () => {
  test("descreve cada ocorrência com cargo e nível", () => {
    const rui = lista.find((a) => a.nome === "Rui Fictício");
    expect(rui?.ocorrencias.map(descreverOcorrencia)).toEqual([
      "Ex-Presidentes do Senado: cargo vazio (3.5, ex-)",
      "Senadores: Senador (4.13)",
    ]);
  });

  test("uma linha por pessoa, com o grupo do convite", () => {
    const linhas = linhasRepetidas(lista);
    expect(linhas[0]).toEqual({
      Nome: "Ana Fictícia",
      "Situação": "Decidido pela regra",
      "Convidar pelo grupo": "Ministros do STF",
      "Cargo do convite": "Ministra do Supremo Tribunal Federal",
      "Nível na Nominata": "4.9 Ministros do Supremo Tribunal Federal",
      Motivo: "Ministros do STF (4.9) antes de Ministros do TSE (5.9)",
      "Grupos em que está": "Ministros do STF: Ministra do Supremo Tribunal Federal (4.9); Ministros do TSE: Ministra do Tribunal Superior Eleitoral (5.9)",
      Origem: "Contatos",
      "Eleição 2026": "",
      "Decisão do GT": "",
      "Data da decisão": "",
      "Situação no Contatos": "",
    });
  });

  test("linha de caso a conferir deixa convite e nível vazios", () => {
    const conferir = autoridadesRepetidas([
      grupo("Conselho Nacional de Justiça (CNJ)", [linha("Ana Fictícia", "Conselheira")]),
      grupo("Conselho Nacional do Ministério Público (CNMP)", [linha("Ana Fictícia", "Conselheira")]),
    ]);
    const [l] = linhasRepetidas(conferir);
    expect(l["Situação"]).toBe("Conferir");
    expect(l["Convidar pelo grupo"]).toBe("");
    expect(l["Nível na Nominata"]).toBe("");
  });

  test("ocorrência sem nível aparece como fora da Nominata", () => {
    const o: OcorrenciaRepetida = {
      grupo: "g", grupoRegra: "Embaixadores", chave: "ana", cargo: "Embaixadora", ex: false, possivelSaida: false, origem: "contatos",
    };
    expect(descreverOcorrencia(o)).toBe("Embaixadores: Embaixadora (fora da Nominata)");
  });

  test("gera a aba com o cabeçalho, mesmo vazia", () => {
    for (const entrada of [lista, []]) {
      const wb = XLSX.read(gerarXlsxRepetidas(entrada), { type: "array" });
      expect(wb.SheetNames).toEqual(["Em mais de um grupo"]);
      const [cab] = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Em mais de um grupo"], { header: 1 });
      expect(cab).toEqual([...CABECALHO_REPETIDAS]);
    }
  });

  describe("com as listas de fora do Contatos", () => {
    const eleitoSenado: EleitoClassificado = {
      eleito: { casa: "senado", uf: "SP", nomeUrna: "Rui Fictício", nomeCompleto: "Rui Fictício Lima", situacaoTse: "Eleito", statusMandato: "x" },
      destino: "reeleito", projecao: false, grupoDestino: "Senadores", contatos: [{ grupo: "Senadores", nome: "Rui Fictício" }],
    };
    const eleicao: ResultadoEleicao = { arquivos: [], eleitos: [eleitoSenado], camaraNoContatos: false };
    const deFora = autoridadesRepetidas(
      [grupo("Senadores", [linha("Rui Fictício", "Senador")]), grupo("Ex-Presidentes do Senado", [linha("Rui Fictício", "Ex-Presidente do Senado Federal")])],
      eleicao,
    );

    test("ocorrência de fora mostra a origem na descrição", () => {
      const rui = deFora.find((a) => a.nome === "Rui Fictício");
      const descricoes = rui?.ocorrencias.map(descreverOcorrencia) ?? [];
      expect(descricoes).toContain("Senadores Eleitos: Senador eleito (4.13.1) [Eleição 2026]");
      expect(descricoes.filter((d) => d.includes("["))).toHaveLength(1);
    });

    test("ocorrência da planilha da Câmara mostra a origem na descrição", () => {
      const o: OcorrenciaRepetida = {
        grupo: "Deputados Federais", grupoRegra: "Deputados Federais", chave: "ciro ficticio", cargo: "Deputado Federal",
        ex: false, possivelSaida: false, origem: "camara",
      };
      expect(descreverOcorrencia(o)).toBe("Deputados Federais: Deputado Federal (fora da Nominata) [Planilha da Câmara]");
    });

    test("eleito sai com Eleição 2026 = Sim e a origem do grupo do convite", () => {
      const [l] = linhasRepetidas(deFora);
      expect(l["Eleição 2026"]).toBe("Sim");
      expect(l.Origem).toBe("Contatos");
      expect(l["Convidar pelo grupo"]).toBe("Senadores");
    });

    test("origem vazia quando o caso é para conferir", () => {
      const conferir = autoridadesRepetidas([
        grupo("Conselho Nacional de Justiça (CNJ)", [linha("Ana Fictícia", "Conselheira")]),
        grupo("Conselho Nacional do Ministério Público (CNMP)", [linha("Ana Fictícia", "Conselheira")]),
      ]);
      expect(linhasRepetidas(conferir)[0].Origem).toBe("");
    });

    test("cabeçalho: Origem e Eleição 2026, depois as colunas da decisão do GT", () => {
      expect(CABECALHO_REPETIDAS.slice(-5)).toEqual(["Origem", "Eleição 2026", "Decisão do GT", "Data da decisão", "Situação no Contatos"]);
    });
  });

  describe("com as decisões do GT", () => {
    const manual = (extra: Partial<RegistroManual> & Pick<RegistroManual, "tipo" | "grupos">): RegistroManual => ({
      data: "2026-10-26", quem: "Marina e Clóvis", observacao: "", validacao: "validado", ...extra,
    });
    const CUEVA = "Ricardo Villas Bôas Cueva";
    const cueva = [
      grupo("Ministros do STJ", [linha(CUEVA, "Ministro do Superior Tribunal de Justiça")]),
      grupo("Ministros do TSE", [linha(CUEVA, "Ministro do Tribunal Superior Eleitoral")]),
    ];
    const decisaoCueva = registrar(HISTORICO_VAZIO, CUEVA, [], manual({
      tipo: "mesma_pessoa", convidaPor: "Ministros do TSE", grupos: ["Ministros do STJ", "Ministros do TSE"],
    }));

    test("mesma pessoa pendente: decisão, data e Pendente no Contatos", () => {
      const [l] = linhasRepetidas(autoridadesRepetidas(cueva, undefined, decisaoCueva));
      expect(l["Situação"]).toBe("Decidido pelo GT");
      expect(l["Convidar pelo grupo"]).toBe("Ministros do TSE");
      expect(l["Decisão do GT"]).toBe("Mesma pessoa: convidar pelo grupo Ministros do TSE (Marina e Clóvis)");
      expect(l["Data da decisão"]).toBe("26/10/2026");
      expect(l["Situação no Contatos"]).toBe("Pendente no Contatos");
    });

    test("caso tratado e caso reaberto", () => {
      const tratado = linhasRepetidas(autoridadesRepetidas([cueva[1]], undefined, decisaoCueva));
      expect(tratado[0]["Situação"]).toBe("Tratado no Contatos");
      expect(tratado[0]["Situação no Contatos"]).toBe("Tratado no Contatos");
      const reaberto = linhasRepetidas(autoridadesRepetidas(
        [...cueva, grupo("Ministros do STF", [linha(CUEVA, "Ministro")])], undefined, decisaoCueva,
      ));
      expect(reaberto[0]["Situação"]).toBe("Conferir");
      expect(reaberto[0]["Situação no Contatos"]).toBe("Reaberto");
    });

    test("pessoas diferentes fica sem situação no Contatos", () => {
      const h = registrar(HISTORICO_VAZIO, CUEVA, [], manual({ tipo: "pessoas_diferentes", grupos: ["Ministros do STJ", "Ministros do TSE"] }));
      const [l] = linhasRepetidas(autoridadesRepetidas(cueva, undefined, h));
      expect(l["Decisão do GT"]).toBe("Pessoas diferentes (Marina e Clóvis)");
      expect(l["Situação no Contatos"]).toBe("");
    });
  });
});
