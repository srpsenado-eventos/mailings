import { describe, expect, test } from "vitest";
import { enxugarParaPublicar } from "@/lib/publicar";
import type { Retrato, ResultadoContato } from "@/lib/types";

const contato: ResultadoContato = {
  contato: { nome: "Ana Maria Política Completa", grupo: "ORG", cargo: "Presidente", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora", telefone: "(61) 99999-0000", email: "ana@exemplo.gov.br", redeSocial: "@ana", endereco: "Praça dos Três Poderes" },
  semaforo: "verde",
  comparacoes: [
    { campo: "nome", valorPlanilha: "Ana Maria Política Completa", situacao: "confere", origemValor: "pagina" },
    { campo: "telefone", valorPlanilha: "(61) 99999-0000", situacao: "fonte_nao_informa", origemValor: "pagina" },
    { campo: "email", valorPlanilha: "ana@exemplo.gov.br", situacao: "fonte_nao_informa", origemValor: "pagina" },
  ],
  camposDivergentes: [],
} as unknown as ResultadoContato;

const retrato: Retrato = {
  arquivoNome: "c.xlsx",
  grupos: [{ grupo: "ORG", contatos: [contato], novos: [], semFonte: false, fonteInacessivel: false } as unknown as Retrato["grupos"][number]],
  resumo: { total: 1 } as unknown as Retrato["resumo"],
  sugestoesCadastro: [],
  geradoEm: "2026-10-03T14:20:22.969Z",
  planilhaContatos: { nome: "c.xlsx", linhas: 1 },
} as unknown as Retrato;

describe("enxugarParaPublicar", () => {
  test("remove a foto do contato", () => {
    const comFoto: Retrato = {
      ...retrato,
      grupos: [{ ...retrato.grupos[0], contatos: [{ ...contato, contato: { ...contato.contato, foto: "data:image/png;base64,AAAA" } }] }],
    };
    const p = enxugarParaPublicar(comFoto, "2026-10-04T10:00:00.000Z");
    expect(p.grupos[0].contatos[0].contato.foto).toBeUndefined();
    expect(JSON.stringify(p)).not.toMatch(/base64/);
  });
  test("remove telefone, e-mail e rede social do contato e as comparações de telefone e e-mail", () => {
    const p = enxugarParaPublicar(retrato, "2026-10-04T10:00:00.000Z");
    const c = p.grupos[0].contatos[0];
    expect(c.contato.telefone).toBeUndefined();
    expect(c.contato.email).toBeUndefined();
    expect(c.contato.redeSocial).toBeUndefined();
    expect(c.comparacoes.map((x) => x.campo)).toEqual(["nome"]);
    expect(JSON.stringify(p)).not.toMatch(/99999-0000|ana@exemplo|@ana/);
  });
  test("mantém nome, cargo, tratamento, endereçamento e endereço, e carimba publicadoEm", () => {
    const p = enxugarParaPublicar(retrato, "2026-10-04T10:00:00.000Z");
    const c = p.grupos[0].contatos[0].contato;
    expect(c).toMatchObject({ nome: "Ana Maria Política Completa", cargo: "Presidente", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora", endereco: "Praça dos Três Poderes" });
    expect(p.publicadoEm).toBe("2026-10-04T10:00:00.000Z");
    expect(p.geradoEm).toBe(retrato.geradoEm);
  });
  test("não muta o retrato de entrada", () => {
    enxugarParaPublicar(retrato, "2026-10-04T10:00:00.000Z");
    expect(retrato.grupos[0].contatos[0].contato.telefone).toBe("(61) 99999-0000");
    expect(retrato.grupos[0].contatos[0].comparacoes).toHaveLength(3);
  });
});
