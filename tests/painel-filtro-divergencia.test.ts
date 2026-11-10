import { describe, expect, test } from "vitest";
import { cartoesDoResumo, filtrarGrupos, FILTROS, contarContatos } from "@/lib/painel";
import type { ResultadoContato, ResultadoGrupo, Semaforo } from "@/lib/types";

function contato(nome: string, semaforo: Semaforo): ResultadoContato {
  return {
    contato: { nome, grupo: "G", cargo: "Ministro", tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" },
    semaforo, score: 1, comparacoes: [], camposDivergentes: [], origem: "oficial",
  };
}

const grupos: ResultadoGrupo[] = [
  { grupo: "G1", semFonte: false, fonteUrl: "https://x.gov.br", contatos: [contato("A", "verde"), contato("B", "amarelo")], novos: [] },
  { grupo: "G2", semFonte: false, fonteUrl: "https://y.gov.br", contatos: [contato("C", "amarelo"), contato("D", "vermelho")], novos: [{ nome: "Novo", cargo: "Ministro" }] },
  { grupo: "G3", semFonte: false, fonteUrl: "https://z.gov.br", contatos: [contato("E", "verde")], novos: [] },
];

describe("filtro Com divergência", () => {
  test("fica logo depois de Tudo na lista de filtros", () => {
    // Arrange / Act
    const ids = FILTROS.map((f) => f.id);
    // Assert
    expect(ids.slice(0, 2)).toEqual(["tudo", "divergencia"]);
    expect(FILTROS[1].rotulo).toBe("Com divergência");
  });

  test("mostra só os contatos amarelos, o mesmo número do cartão, e nenhuma proposta de inclusão", () => {
    // Arrange
    const amarelos = grupos.flatMap((g) => g.contatos).filter((c) => c.semaforo === "amarelo").length;
    const cartao = cartoesDoResumo({ amarelo: amarelos }).find((c) => c.rotulo === "Com divergência")?.valor;
    // Act
    const resultado = filtrarGrupos(grupos, "divergencia", "");
    // Assert
    expect(contarContatos(resultado)).toBe(cartao);
    expect(resultado.map((g) => g.grupo)).toEqual(["G1", "G2"]);
    expect(resultado.every((g) => g.novos.length === 0)).toBe(true);
    expect(resultado.flatMap((g) => g.contatos).every((c) => c.semaforo === "amarelo")).toBe(true);
  });
});
