import { describe, expect, test } from "vitest";
import { abreviarLote, ehEnderecoDoDf, tratarNumero } from "@/lib/convidados/numero";
import { tratarCep, ufDoCep } from "@/lib/convidados/cep";
import { tratarBairro, tratarCidade, tratarUf } from "@/lib/convidados/bairro-cidade-uf";
import { comIniciaisMaiusculas, semTitulo, sugestaoNomeCurto, tratarNome } from "@/lib/convidados/nome";
import { conferirProtocolo, formaNoGenero } from "@/lib/convidados/protocolo";
import { abreviarAteCaber, classeDoSegmento, encaixarLogradouroComplemento, PASSOS_LOGRADOURO } from "@/lib/convidados/abreviacoes";

describe("logradouro e complemento", () => {
  test("logradouro de 71 caracteres do DF cabe em 50 só com o primeiro passo que basta", () => {
    const r = encaixarLogradouroComplemento("Setor de Autarquias Sul Quadra 3 Bloco C Edifício Sede da Associação", "5º andar, Sala 512");
    expect(r.logradouro).toBe("SAS Quadra 3 Bloco C Edifício Sede da Associação");
    expect(r.logradouro.length).toBeLessThanOrEqual(50);
    expect(r.regras).toEqual(["Logradouro acima de 50: abreviado (Setor de Autarquias Sul = SAS)"]);
    expect(r.complemento).toBe("5º andar, Sala 512");
    expect(r.revisao).toBeUndefined();
  });
  test("quando o primeiro passo não basta, os seguintes entram na ordem", () => {
    const r = encaixarLogradouroComplemento("Setor de Autarquias Sul Quadra 3 Bloco C Edifício Sede da Associação Exemplo", "");
    expect(r.logradouro).toBe("SAS Qd 3 Bl C Edifício Sede da Associação Exemplo");
    expect(r.regras).toEqual(["Logradouro acima de 50: abreviado (Setor de Autarquias Sul = SAS, Quadra = Qd, Bloco = Bl)"]);
  });
  test("não abrevia o que já cabe", () => {
    const r = encaixarLogradouroComplemento("Avenida das Nações", "Sala 301");
    expect(r).toMatchObject({ logradouro: "Avenida das Nações", complemento: "Sala 301", trechoQueNaoCoube: "", regras: [] });
  });
  test("abreviarAteCaber para no passo em que coube e respeita a caixa", () => {
    expect(abreviarAteCaber("Quadra 5 Conjunto B", 10, PASSOS_LOGRADOURO)).toEqual({ valor: "Qd 5 Cj B", passos: ["Quadra = Qd", "Conjunto = Cj"] });
    expect(abreviarAteCaber("quadra 5", 4, PASSOS_LOGRADOURO).valor).toBe("qd 5");
  });
  test("complemento acima de 30 usa nível 1 e, se não bastar, nível 2 sem preposições", () => {
    const r = encaixarLogradouroComplemento("Esplanada dos Ministérios Bloco A", "Edifício Anexo, 5º andar, Sala 512 do Gabinete");
    expect(r.complemento.length).toBeLessThanOrEqual(30);
    expect(r.complemento).toBe("Ed Anexo, 5º And, Sl 512 Gab");
    expect(r.regras.some((x) => x.startsWith("Complemento abreviado (nível 2"))).toBe(true);
    expect(r.trechoQueNaoCoube).toBe("");
  });
  test("o que não cabe no Complemento vai para o trecho que não coube, o menos essencial primeiro, e é REVISAR", () => {
    const r = encaixarLogradouroComplemento("Rua Exemplo", "Condomínio Residencial das Palmeiras Imperiais, Torre Norte, Bloco B, Apartamento 1204");
    expect(r.complemento).toBe("Torre Norte, Bl B, Apto 1204");
    expect(r.trechoQueNaoCoube).toBe("Cond Res Palmeiras Imperiais");
    expect(r.revisao).toEqual({ marca: "revisar", texto: "Complemento acima de 30: trecho não coube" });
    expect(classeDoSegmento("Sala 512")).toBe(0);
    expect(classeDoSegmento("2º And")).toBe(1);
    expect(classeDoSegmento("Ed Sede")).toBe(2);
    expect(classeDoSegmento("Portaria Norte")).toBe(3);
  });
  test("excedente do logradouro vai ao início do Complemento e andar nunca sobe ao Logradouro", () => {
    const r = encaixarLogradouroComplemento("Rodovia Exemplo Longa Demais Para Caber Quilômetro 12, Galpão 7, Portaria Norte", "2º andar");
    expect(r.logradouro.length).toBeLessThanOrEqual(50);
    expect(r.complemento.startsWith("Galpão 7") || r.complemento.startsWith("Portaria Norte")).toBe(true);
    expect(r.logradouro).not.toMatch(/andar/i);
    expect(r.regras).toContain("Logradouro: trecho movido para o Complemento");
  });
  test("logradouro de um segmento só que não cabe nem abreviado não é cortado e vira REVISAR", () => {
    const longo = "Rua Exemplo Muito Longa Sem Nenhuma Abreviação Possível Número Um";
    const r = encaixarLogradouroComplemento(longo, "");
    expect(r.logradouro).toBe(longo);
    expect(r.revisao).toEqual({ marca: "revisar", texto: "Logradouro acima de 50 mesmo abreviado" });
    expect(r.trechoQueNaoCoube).toBe("");
  });
});

describe("número", () => {
  const base = { logradouro: "Rua Exemplo", complemento: "", uf: "DF", cidade: "Brasília" };
  test("número curto fica como veio", () => {
    expect(tratarNumero({ ...base, numero: "120" })).toMatchObject({ numero: "120", regras: [] });
  });
  test("Lote 12 Casa 3 no Número: S/N e Lt 12 Cs 3 no Complemento (regra A)", () => {
    const r = tratarNumero({ ...base, numero: "Lote 12 Casa 3" });
    expect(r.numero).toBe("S/N");
    expect(r.complemento).toBe("Lt 12 Cs 3");
    expect(r.regras[0]).toMatch(/regra A/);
    expect(r.revisao).toBeUndefined();
  });
  test("regra A preserva o Complemento que já existia", () => {
    expect(tratarNumero({ ...base, numero: "Bloco 4", complemento: "Sala 2" }).complemento).toBe("Bl 4, Sala 2");
  });
  test("regra A com Complemento acima de 30 marca REVISAR e mantém o valor", () => {
    const r = tratarNumero({ ...base, numero: "Bloco 4", complemento: "Edifício Exemplo Sala 2 Andar 5" });
    expect(r.complemento).toBe("Bl 4, Edifício Exemplo Sala 2 Andar 5");
    expect(r.revisao).toEqual({ marca: "revisar", texto: "Complemento acima de 30 depois da regra A" });
  });
  test("acima de 6 sem marca conhecida é REVISAR, valor mantido", () => {
    const r = tratarNumero({ ...base, numero: "1234567" });
    expect(r.numero).toBe("1234567");
    expect(r.revisao?.marca).toBe("revisar");
    expect(r.revisao?.texto).toBe("Número acima de 6 caracteres sem lote/casa/bloco");
  });
  test("vazio no DF vira S/N; vazio em Brasília sem UF também", () => {
    expect(tratarNumero({ ...base, numero: "" }).numero).toBe("S/N");
    expect(tratarNumero({ ...base, numero: "", uf: "" }).numero).toBe("S/N");
    expect(ehEnderecoDoDf("", "BSB")).toBe(true);
    expect(ehEnderecoDoDf("GO", "Brasília")).toBe(false);
  });
  test("vazio no DF com Lote 12 no Logradouro: lote vai ao Complemento e sai do Logradouro", () => {
    const r = tratarNumero({ ...base, numero: "", logradouro: "Quadra 5 Conjunto B Lote 12" });
    expect(r).toMatchObject({ numero: "S/N", logradouro: "Quadra 5 Conjunto B", complemento: "Lt 12" });
    expect(r.regras).toContain("Lote/Casa/Chácara do Logradouro levado ao Complemento (regra A dos Correios)");
  });
  test("vazio fora do DF: S/N só com indicação no logradouro, senão REVISAR", () => {
    expect(tratarNumero({ ...base, numero: "", uf: "MG", cidade: "Belo Horizonte", logradouro: "Rua Exemplo, s/n" }).numero).toBe("S/N");
    const r = tratarNumero({ ...base, numero: "", uf: "MG", cidade: "Belo Horizonte" });
    expect(r.numero).toBe("");
    expect(r.revisao).toEqual({ marca: "revisar", texto: "Número não informado" });
  });
  test("Casa, Chácara ou Lote seguidos de nome próprio ficam no Logradouro intactos", () => {
    for (const logradouro of ["Palácio do Planalto, Casa Civil", "SHIS QI 5 Casa de Apoio", "Chácara Santa Luzia", "Rua da Casa e Jardim"]) {
      const r = tratarNumero({ ...base, numero: "", logradouro });
      expect(r).toMatchObject({ numero: "S/N", logradouro, complemento: "" });
      expect(r.regras).not.toContain("Lote/Casa/Chácara do Logradouro levado ao Complemento (regra A dos Correios)");
    }
  });
  test("Casa seguida de letra isolada vai ao Complemento", () => {
    const r = tratarNumero({ ...base, numero: "", logradouro: "SHIS QI 5 Casa B" });
    expect(r).toMatchObject({ numero: "S/N", logradouro: "SHIS QI 5", complemento: "Cs B" });
  });
  test("todas as ocorrências de lote e casa do Logradouro vão ao Complemento", () => {
    const r = tratarNumero({ ...base, numero: "", logradouro: "Quadra 5 Lote 12 Casa 3" });
    expect(r).toMatchObject({ numero: "S/N", logradouro: "Quadra 5", complemento: "Lt 12 Cs 3" });
  });
  test("Número acima de 6 com Casa seguida de nome próprio não é regra A", () => {
    const r = tratarNumero({ ...base, numero: "Casa Amarela" });
    expect(r.numero).toBe("Casa Amarela");
    expect(r.revisao?.texto).toBe("Número acima de 6 caracteres sem lote/casa/bloco");
  });
  test("abreviarLote cobre lote, casa, chácara e bloco", () => {
    expect(abreviarLote("Chácara 7 Bloco B")).toBe("Ch 7 Bl B");
    expect(abreviarLote("Lotes 1, 2")).toBe("Lt 1, 2");
  });
});

describe("cep", () => {
  test("7 dígitos em SP ganha zero à esquerda e VALIDAR; em RJ é REVISAR com o valor mantido", () => {
    expect(tratarCep("1310100", "SP")).toEqual({ valor: "01310100", regras: ["CEP com 7 dígitos em SP: zero à esquerda (01310100)"], revisao: { marca: "validar", texto: "CEP completado por inferência; confirmar nos Correios", sugestao: "01310100" } });
    const rj = tratarCep("1310100", "RJ");
    expect(rj.valor).toBe("1310100");
    expect(rj.revisao?.marca).toBe("revisar");
  });
  test("pontuação sai; letras e vazio são REVISAR", () => {
    expect(tratarCep("70.165-900", "DF")).toMatchObject({ valor: "70165900", regras: ["CEP: pontuação removida"] });
    expect(tratarCep("ABC12345", "DF")).toMatchObject({ valor: "ABC12345", revisao: { marca: "revisar", texto: "CEP inválido (ABC12345)" } });
    expect(tratarCep("", "DF").revisao?.texto).toBe("CEP vazio");
  });
  test("faixa incompatível com a UF só avisa", () => {
    expect(ufDoCep("70165900")).toBe("DF");
    const r = tratarCep("70165900", "SP");
    expect(r.valor).toBe("70165900");
    expect(r.revisao).toEqual({ marca: "revisar", texto: "CEP fora da faixa da UF SP (faixa do CEP: DF)" });
    expect(tratarCep("70165900", "DF").revisao).toBeUndefined();
  });
});

describe("bairro, cidade e uf", () => {
  test("bairro: de-para, canônico, limite e vazio", () => {
    expect(tratarBairro("Setor de Administração Federal Sul").valor).toBe("Setor de Adm. Federal Sul");
    expect(tratarBairro("zona civico administrativa")).toMatchObject({ valor: "Zona Cívico-Administrativa", regras: ["Bairro padronizado (zona civico administrativa → Zona Cívico-Administrativa)"] });
    expect(tratarBairro("Asa Sul")).toEqual({ valor: "Asa Sul", regras: [] });
    expect(tratarBairro("").revisao?.texto).toBe("Bairro vazio");
    const longo = tratarBairro("Residencial Exemplo das Palmeiras Imperiais Norte");
    expect(longo.valor).toBe("Res Exemplo das Palmeiras Imperiais Norte");
    expect(longo.regras[0]).toMatch(/^Bairro acima de 30: abreviado \(/);
    expect(longo.revisao).toEqual({ marca: "revisar", texto: "Bairro acima de 30 caracteres" });
    const medio = tratarBairro("Residencial Exemplo das Palmeiras");
    expect(medio.valor.length).toBeLessThanOrEqual(30);
    expect(medio.revisao).toBeUndefined();
  });
  test("cidade: Brasília padronizada, vazia é REVISAR", () => {
    expect(tratarCidade("brasilia").valor).toBe("Brasília");
    expect(tratarCidade("Brasília")).toEqual({ valor: "Brasília", regras: [] });
    expect(tratarCidade("").revisao?.texto).toBe("Cidade vazia");
  });
  test("uf: caixa alta, inexistente e vazia", () => {
    expect(tratarUf("df")).toMatchObject({ valor: "DF", regras: ["UF em caixa alta"] });
    expect(tratarUf("BR")).toMatchObject({ valor: "BR", revisao: { marca: "revisar", texto: "UF inexistente (BR)" } });
    expect(tratarUf("").revisao?.texto).toBe("UF vazia");
  });
});

describe("nome", () => {
  test("título sai, patente e cargo ficam", () => {
    expect(semTitulo("Dr. Carlos Eduardo Fictício Ramos")).toEqual({ valor: "Carlos Eduardo Fictício Ramos", removido: "Dr." });
    expect(semTitulo("S.E. Sra. Ana Beatriz Exemplo Souza").valor).toBe("Ana Beatriz Exemplo Souza");
    expect(semTitulo("General de Exército Roberto Hipotético Lima").valor).toBe("General de Exército Roberto Hipotético Lima");
    expect(semTitulo("Senador Paulo Amostra Teixeira").valor).toBe("Senador Paulo Amostra Teixeira");
  });
  test("caixa alta integral vira iniciais maiúsculas com conectivos minúsculos", () => {
    expect(comIniciaisMaiusculas("MARIA DA CONCEIÇÃO D'ÁVILA E SOUZA-LIMA")).toBe("Maria da Conceição D'Ávila e Souza-Lima");
    const r = tratarNome("ANA BEATRIZ EXEMPLO SOUZA");
    expect(r.valor).toBe("Ana Beatriz Exemplo Souza");
    expect(r.regras).toContain("Nome em caixa alta convertido; conferir a grafia");
    expect(tratarNome("Ana Beatriz Exemplo Souza")).toEqual({ valor: "Ana Beatriz Exemplo Souza", regras: [] });
  });
  test("nome acima de 50 é REVISAR com sugestão e contagem, valor mantido", () => {
    const nome = "Maria Auxiliadora da Conceição Exemplo de Almeida Prado";
    const r = tratarNome(nome);
    expect(r.valor).toBe(nome);
    expect(r.revisao?.marca).toBe("revisar");
    expect(r.revisao?.texto).toBe("Nome com 55 caracteres (limite 50). A ferramenta não corta nome sozinha.");
    expect(r.revisao?.sugestao).toBe("Maria de Almeida Prado (22)");
  });
  test("patente abreviada entra primeiro na sugestão", () => {
    expect(sugestaoNomeCurto("General de Exército Roberto Hipotético de Lima Exemplo Longo")).toBe("Gen Ex Roberto Hipotético de Lima Exemplo Longo (47)");
  });
  test("espaços colapsados e título removido registram a regra", () => {
    const r = tratarNome("  Dra.  Ana   Exemplo ");
    expect(r.valor).toBe("Ana Exemplo");
    expect(r.regras).toEqual(["Nome: espaços normalizados", "Nome: título removido (Dra.)"]);
  });
});

describe("protocolo", () => {
  const base = { linha: 16, nome: "Luciana Protótipo Andrade" };
  test("senadora com tratamento masculino e excelentíssimo: REVISAR nos dois campos com a forma v02 no feminino", () => {
    const achados = conferirProtocolo({ ...base, cargo: "Senadora", tratamento: "Excelentíssimo Senhor", enderecamento: "A Sua Excelência o Senhor" });
    expect(achados.map((a) => [a.campo, a.sugestao])).toEqual([["TRATAMENTO", "Senhora"], ["ENDERECAMENTO", "A Sua Excelência a Senhora"]]);
    expect(achados[0]).toMatchObject({ linha: 16, tipo: "revisar", valorRecebido: "Excelentíssimo Senhor" });
    expect(achados[0].motivo).toMatch(/Tabela de tratamentos v02 para 'Senadora'/);
  });
  test("deputado federal com Senhor e A Sua Excelência o Senhor: nada a revisar (exceção local resolve o empate)", () => {
    expect(conferirProtocolo({ ...base, cargo: "Deputado Federal", tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" })).toEqual([]);
    expect(conferirProtocolo({ ...base, cargo: "Deputada Federal", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" })).toEqual([]);
  });
  test("cargo sem regra ou vazio: nenhum achado de tabela", () => {
    expect(conferirProtocolo({ ...base, cargo: "Presidente da Associação Exemplo", tratamento: "Senhor", enderecamento: "Ao Senhor" })).toEqual([]);
    expect(conferirProtocolo({ ...base, cargo: "", tratamento: "Senhora", enderecamento: "À Senhora" })).toEqual([]);
  });
  test("incoerência de gênero sem regra na tabela é apontada", () => {
    const achados = conferirProtocolo({ ...base, cargo: "Diretora Exemplo", tratamento: "Senhor", enderecamento: "À Senhora" });
    expect(achados).toHaveLength(1);
    expect(achados[0]).toMatchObject({ campo: "TRATAMENTO", tipo: "revisar", sugestao: "" });
  });
  test("formaNoGenero resolve os marcadores da tabela", () => {
    expect(formaNoGenero("A Sua Excelência o(a) Senhor(a)", true)).toBe("A Sua Excelência a Senhora");
    expect(formaNoGenero("A Sua Excelência o(a) Senhor(a)", false)).toBe("A Sua Excelência o Senhor");
    expect(formaNoGenero("Excelentíssimo(a) Senhor(a)", true)).toBe("Excelentíssima Senhora");
    expect(formaNoGenero("Ao Senhor (À Senhora)", true)).toBe("À Senhora");
    expect(formaNoGenero("Ao Senhor (À Senhora)", false)).toBe("Ao Senhor");
  });
});
