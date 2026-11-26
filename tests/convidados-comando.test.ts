import { describe, expect, test } from "vitest";
import {
  formatarData,
  formatarDataHora,
  grupoConhecido,
  linhasDasContagens,
  MOTIVO_GRUPO_NAO_E_DEPUTADOS,
  MOTIVO_LISTA_E_DO_SITE,
  MOTIVO_MAIS_DE_UMA_PLANILHA_DA_CAMARA,
  MOTIVO_SEM_PLANILHA_DA_CAMARA,
  motivoSemDivergencias,
  textoDaOrigem,
  textoDasContagensDeDivergencias,
  textoDasDecisoes,
  textoDoComando,
  textoDoProtocolo,
} from "@/lib/convidados/comando";
import { HISTORICO_VAZIO } from "@/lib/decisoes";
import { rodadaDoExemplo } from "./fixtures/convidados/exemplo";

describe("quando a planilha de divergências é gerada (spec §16.5)", () => {
  test("Deputados Federais, lista do modelo Padrão e uma planilha do site: gera", () => {
    expect(motivoSemDivergencias("Deputados Federais", "padrao", 1)).toBeUndefined();
    expect(motivoSemDivergencias("Deputado Federal - Posse Presidencial 2027", "padrao", 1)).toBeUndefined();
  });
  test("outro grupo: motivo do grupo, antes de qualquer outro", () => {
    expect(motivoSemDivergencias("Deputado Federal eleitos - Posse Presidencial 2027", "padrao", 1)).toBe(MOTIVO_GRUPO_NAO_E_DEPUTADOS);
    expect(motivoSemDivergencias("Senadores", "camara", 0)).toBe(MOTIVO_GRUPO_NAO_E_DEPUTADOS);
  });
  test("lista que já é a planilha do site: não compara com ela mesma", () => {
    expect(motivoSemDivergencias("Deputados Federais", "camara", 1)).toBe(MOTIVO_LISTA_E_DO_SITE);
  });
  test("sem planilha do site: diz onde ela poderia vir", () => {
    expect(motivoSemDivergencias("Deputados Federais", "padrao", 0)).toBe(MOTIVO_SEM_PLANILHA_DA_CAMARA);
  });
  test("mais de uma planilha do site em --eleitos: pede a do dia em --camara", () => {
    expect(motivoSemDivergencias("Deputados Federais", "padrao", 2)).toBe(MOTIVO_MAIS_DE_UMA_PLANILHA_DA_CAMARA);
    expect(MOTIVO_MAIS_DE_UMA_PLANILHA_DA_CAMARA).toBe("mais de uma planilha da Câmara em --eleitos; indique a do dia em --camara");
  });
});

describe("textos do comando", () => {
  test("datas com dois dígitos", () => {
    expect(formatarData(new Date(2026, 10, 5, 9, 7))).toBe("05/11/2026");
    expect(formatarDataHora(new Date(2026, 0, 25, 9, 7))).toBe("25/01/2026 09:07");
  });
  test("texto do comando só traz as opções passadas", () => {
    expect(textoDoComando({ lista: "Lista.xlsx", grupo: "Senadores", preencherProtocolo: false }))
      .toBe('comando: npm run convidados -- "Lista.xlsx" --grupo "Senadores"');
    expect(textoDoComando({ lista: "Lista.xlsx", grupo: "Deputados Federais", preencherProtocolo: true, camara: "deputado.xls" }))
      .toBe('comando: npm run convidados -- "Lista.xlsx" --grupo "Deputados Federais" --preencher-protocolo --camara "deputado.xls"');
  });
  test("contagens das divergências numa linha", () => {
    expect(textoDasContagensDeDivergencias({ permanece: 500, saiu: 3, entrou: 4, conferir: 1 })).toBe("Permanece 500 · Saiu 3 · Entrou 4 · Conferir 1");
  });
  test("contagens da rodada, uma linha por rótulo, na ordem do Resumo", () => {
    const linhas = linhasDasContagens(rodadaDoExemplo().contagens);
    expect(linhas).toHaveLength(11);
    expect(linhas[0]).toBe("Linhas lidas: 11");
    expect(linhas[1]).toBe("Novo: importar: 8");
    expect(linhas).toContain("Tratamento ou endereçamento preenchidos pela regra: 0");
    expect(linhas.at(-1)).toBe("Endereço novo para contato já cadastrado: 1");
  });
  test("origem, protocolo e decisões do cabeçalho", () => {
    expect(textoDaOrigem({ origem: "camara", aba: "Plan1" })).toBe("Origem: planilha do site da Câmara (deputados em exercício)");
    expect(textoDaOrigem({ origem: "padrao", aba: "Lista de Convidados" })).toBe("Origem: modelo Padrão (aba 'Lista de Convidados')");
    expect(textoDoProtocolo(true)).toBe("Protocolo: Tratamento e Endereçamento vazios preenchidos pela regra");
    expect(textoDoProtocolo(false)).toBe("Protocolo: só conferido (sem --preencher-protocolo)");
    expect(textoDasDecisoes(null, "decisoes.json")).toBe("Decisões: não lidas");
    expect(textoDasDecisoes(HISTORICO_VAZIO, "decisoes.json")).toBe("Decisões: decisoes.json (0 casos)");
  });
});

describe("grupo conhecido", () => {
  test("casa um grupo da Posse pelo rótulo ou pelo apelido, ou um grupo da base", () => {
    expect(grupoConhecido("Deputados Federais", [])).toBe(true);
    expect(grupoConhecido("Deputado Federal - Posse Presidencial 2027", [])).toBe(true);
    expect(grupoConhecido("Grupo Inventado", [])).toBe(false);
    expect(grupoConhecido("Grupo Inventado", [{ nome: "Pessoa Exemplo", grupo: "Outro; Grupo Inventado" }])).toBe(true);
  });
});
