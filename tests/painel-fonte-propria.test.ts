import { describe, expect, test } from "vitest";
import { fontePropria } from "@/lib/painel-fonte-propria";
import type { ResultadoGrupo } from "@/lib/types";

const PRINCIPAL = "https://www.tst.jus.br/ministros";
const SECUNDARIA = "https://www.tst.jus.br/orgaos";

const grupo = (over: Partial<ResultadoGrupo> = {}): ResultadoGrupo => ({
  grupo: "Ministros do TST", fonteUrl: PRINCIPAL, semFonte: false, contatos: [], novos: [], ...over,
});

describe("fontePropria", () => {
  test("devolve a URL da pessoa quando ela veio de outra página que a principal do grupo", () => {
    // Arrange
    const g = grupo();

    // Act
    const url = fontePropria(SECUNDARIA, g);

    // Assert
    expect(url).toBe(SECUNDARIA);
  });

  test("não devolve nada quando a pessoa veio da própria fonte principal", () => {
    expect(fontePropria(PRINCIPAL, grupo())).toBeUndefined();
  });

  test("não devolve nada sem URL da pessoa", () => {
    expect(fontePropria(undefined, grupo())).toBeUndefined();
    expect(fontePropria("", grupo())).toBeUndefined();
  });

  test("ignora a sentinela da composição via IA (não é http)", () => {
    expect(fontePropria("pesquisa-ampla://ia", grupo())).toBeUndefined();
  });

  test("não marca contato de grupo com páginas individuais (a página dele é sempre outra)", () => {
    const g = grupo({ fonteUrl: "https://www.gov.br/planalto/ministros", individuais: { lidas: 10, caidas: 0 } });
    expect(fontePropria("https://www.gov.br/mme/ministro", g)).toBeUndefined();
  });

  test("não marca quando o grupo inteiro foi lido pela URL alternativa", () => {
    const alternativa = "https://www.tst.jus.br/ministros-alternativa";
    const g = grupo({ alternativa: { url: alternativa, urlPrincipal: PRINCIPAL, motivoPrincipal: "HTTP 503" } });
    expect(fontePropria(alternativa, g)).toBeUndefined();
  });

  test("grupo sem fonte principal (lista ou neutro) também não marca sem URL da pessoa", () => {
    expect(fontePropria(undefined, grupo({ fonteUrl: undefined }))).toBeUndefined();
  });
});
