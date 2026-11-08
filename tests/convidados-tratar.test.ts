import { describe, expect, test } from "vitest";
import { tratarLista, textoDaSituacao } from "@/lib/convidados/tratar";
import { REGRAS_TEXTO } from "@/lib/convidados/regras-texto";
import { lerListaPadrao } from "@/lib/convidados/lista";
import { montarListaPadrao } from "./fixtures/convidados/montar";
import { CASOS, GRUPO, rodadaDoExemplo } from "./fixtures/convidados/exemplo";

describe("tratarLista sobre os 11 casos do exemplo aprovado", () => {
  const r = rodadaDoExemplo();
  const l = (n: number) => r.linhas.find((x) => x.linha === n)!;
  test("situações e textos por linha", () => {
    expect(r.linhas.map((x) => [x.linha, textoDaSituacao(x)])).toEqual([
      [9, "Novo: importar"], [10, "Novo: importar"], [11, "Novo: importar (VALIDAR)"], [12, "Novo: importar"], [13, "Novo: importar (REVISAR)"],
      [14, "Já no Contatos: incluir no grupo"], [15, "Já no Contatos: no grupo escolhido"], [16, "Novo: importar (REVISAR)"], [17, "Novo: importar"],
      [18, "Repetida na própria lista"], [19, "Novo: importar (REVISAR)"],
    ]);
    expect(r.linhas.filter((x) => x.entraNoArquivo).map((x) => x.linha)).toEqual([9, 10, 11, 12, 13, 16, 17, 19]);
  });
  test("contagens do Resumo", () => {
    expect(r.contagens).toEqual({ linhas: 11, novos: 8, novosAlterados: 4, novosValidar: 1, novosRevisar: 3, jaGrupoEscolhido: 1, jaOutroGrupo: 1, repetidas: 1, semProtocolo: 0, enderecoNovo: 1 });
  });
  test("linha 10: logradouro abreviado só até caber, número S/N, complemento que já cabia fica", () => {
    expect(l(10).gravado).toMatchObject({ LOGRADOURO: "SAS Quadra 3 Bloco C Edifício Sede da Associação", NUMERO: "S/N", COMPLEMENTO: "5º andar, Sala 512" });
    expect(l(10).camposAlterados).toEqual(["LOGRADOURO", "NUMERO"]);
  });
  test("linha 11: CEP de SP completado, VALIDAR; linha 12: regra A", () => {
    expect(l(11).gravado.CEP).toBe("01310100");
    expect(l(11).achados.map((a) => a.tipo)).toEqual(["validar"]);
    expect(l(12).gravado).toMatchObject({ NUMERO: "S/N", COMPLEMENTO: "Lt 12 Cs 3" });
  });
  test("linha 13: nome longo mantido, com sugestão", () => {
    expect(l(13).gravado.NOME).toBe(CASOS[4].NOME);
    expect(l(13).achados.find((a) => a.campo === "NOME")?.sugestao).toMatch(/\(\d+\)$/);
  });
  test("linha 14 e 15: já no Contatos com Id e grupo; 15 sem endereço cadastrado é endereço novo", () => {
    expect(l(14).ocorrencias).toEqual([{ id: "12345", grupo: "Ministros de Estado" }]);
    expect(l(14).achados.map((a) => a.tipo)).toContain("ja_outro_grupo");
    expect(l(14).achados.map((a) => a.tipo)).not.toContain("endereco_diferente");
    expect(l(15).achados.map((a) => a.tipo)).toEqual(["ja_grupo_escolhido", "endereco_novo"]);
  });
  test("linha 16: tratamento e endereçamento da senadora REVISAR com a forma v02 feminina; linha 17: referência da Câmara e nada a revisar", () => {
    expect(l(16).achados.map((a) => [a.campo, a.sugestao])).toEqual([["TRATAMENTO", "Senhora"], ["ENDERECAMENTO", "A Sua Excelência a Senhora"]]);
    expect(l(16).gravado.TRATAMENTO).toBe("Excelentíssimo Senhor");
    expect(l(17).achados).toEqual([]);
    expect(l(17).referencia).toBe("Consta na lista da Câmara (deputado em exercício)");
  });
  test("linha 18 repete a 9; linha 19: CEP, UF e conferir duplicidade", () => {
    expect(l(18).repeteLinha).toBe(9);
    expect(l(18).achados[0].sugestao).toBe("Só a linha 9 entra no arquivo");
    expect(l(19).achados.map((a) => [a.tipo, a.campo])).toEqual(expect.arrayContaining([["revisar", "CEP"], ["revisar", "UF"], ["conferir_duplicidade", "NOME"]]));
    expect(l(19).conferirDuplicidade).toEqual([{ id: "34567", grupo: "Prefeitos" }]);
    expect(l(19).entraNoArquivo).toBe(true);
  });
});

describe("casos fora do exemplo", () => {
  test("linha só com nome: campos obrigatórios REVISAR, continua novo", () => {
    const r = tratarLista({ linhas: lerListaPadrao(montarListaPadrao([{ NOME: "Eleito Exemplo Sem Gabinete", TRATAMENTO: "Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor" }])), grupo: GRUPO, base: [], enderecos: [] });
    expect(r.linhas[0].situacao).toBe("novo");
    expect(r.linhas[0].achados.map((a) => a.campo).sort()).toEqual(["BAIRRO", "CEP", "CIDADE", "NUMERO", "UF"]);
    expect(r.linhas[0].entraNoArquivo).toBe(true);
  });
  test("tratamento vazio tira a linha do arquivo", () => {
    const r = tratarLista({ linhas: lerListaPadrao(montarListaPadrao([{ ...CASOS[0], TRATAMENTO: "" }])), grupo: GRUPO, base: [], enderecos: [] });
    expect(r.linhas[0].situacao).toBe("sem_protocolo");
    expect(r.linhas[0].entraNoArquivo).toBe(false);
    expect(r.contagens.semProtocolo).toBe(1);
  });
  test("Complemento que passou de 30 na regra A e coube no encaixe não fica REVISAR", () => {
    const caso = { ...CASOS[3], NUMERO: "Lote 12 Casa 3", COMPLEMENTO: "Condomínio Residencial Exemplo" };
    const r = tratarLista({ linhas: lerListaPadrao(montarListaPadrao([caso])), grupo: GRUPO, base: [], enderecos: [] });
    const linha = r.linhas[0];
    expect(linha.gravado.NUMERO).toBe("S/N");
    expect(linha.gravado.COMPLEMENTO).toBe("Lt 12 Cs 3, Cond Res Exemplo");
    expect(linha.trechoQueNaoCoube).toBe("");
    expect(linha.achados.filter((a) => a.campo === "COMPLEMENTO")).toEqual([]);
    expect(linha.marcas).not.toContain("revisar");
  });
  test("a aba Regras tem uma regra para cada família de tratamento", () => {
    expect(REGRAS_TEXTO.map((r) => r.titulo)).toContain("Duplicidade");
    expect(REGRAS_TEXTO.find((r) => r.titulo === "Duplicidade")?.texto).toMatch(/BASE GRUPOS POSSE/);
    expect(REGRAS_TEXTO).toHaveLength(13);
  });
});
