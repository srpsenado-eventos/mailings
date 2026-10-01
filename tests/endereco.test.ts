import { describe, expect, test } from "vitest";
import { auditarEndereco, formatarEnderecoContatos, indexarEnderecos } from "@/lib/endereco";
import type { ContatoPlanilha, EnderecoEstruturado } from "@/lib/types";

const linha = (over: Partial<EnderecoEstruturado> = {}): EnderecoEstruturado => ({
  contatoId: "1",
  nome: "Autoridade de Teste",
  logradouro: "Setor de Autarquias Sul, Quadra 3",
  numero: "S/N",
  complemento: "Bloco A, sala 412",
  bairro: "Asa Sul",
  cidade: "Brasília",
  uf: "DF",
  cep: "70070-030",
  prioritario: true,
  ...over,
});

const contato = (over: Partial<ContatoPlanilha> = {}): ContatoPlanilha => ({
  nome: "Autoridade de Teste",
  grupo: "Ministros do TST",
  ...over,
});

describe("auditarEndereco", () => {
  test("sem base de endereços devolve sem_base, como hoje", () => {
    const a = auditarEndereco(contato({ id: "1" }), undefined);
    expect(a.situacao).toBe("sem_base");
    expect(a.achados).toEqual([]);
  });

  test("endereço completo casa pelo Id e monta a string no formato do Contatos", () => {
    const a = auditarEndereco(contato({ id: "1" }), indexarEnderecos([linha()]));
    expect(a.situacao).toBe("completo");
    expect(a.achados).toEqual([]);
    expect(a.formatado).toBe(
      "Setor de Autarquias Sul, Quadra 3, S/N - Bloco A, sala 412\nAsa Sul\n70070-030 Brasília - DF",
    );
  });

  test("complemento ausente não é achado", () => {
    const a = auditarEndereco(contato({ id: "1" }), indexarEnderecos([linha({ complemento: undefined })]));
    expect(a.situacao).toBe("completo");
    expect(a.achados).toEqual([]);
  });

  test("bairro ausente com CEP válido é a completar, não pendência", () => {
    const a = auditarEndereco(contato({ id: "1" }), indexarEnderecos([linha({ bairro: undefined })]));
    expect(a.situacao).toBe("a_completar");
    expect(a.achados).toContain("sem_bairro");
  });

  test("CEP de sete dígitos em SP é a completar", () => {
    const a = auditarEndereco(
      contato({ id: "1" }),
      indexarEnderecos([linha({ cep: "1049000", uf: "SP", cidade: "São Paulo" })]),
    );
    expect(a.situacao).toBe("a_completar");
    expect(a.achados).toContain("cep_recuperavel");
    // O CEP recuperado é proposta, não confirmação (ver lib/cep.ts): "a_completar" nunca
    // expõe `formatado`, senão a etiqueta sairia com um CEP ainda não checado nos Correios.
    expect(a.formatado).toBeUndefined();
  });

  test("sem número é pendência humana", () => {
    const a = auditarEndereco(contato({ id: "1" }), indexarEnderecos([linha({ numero: undefined })]));
    expect(a.situacao).toBe("pendente");
    expect(a.achados).toContain("sem_numero");
    expect(a.formatado).toBeUndefined();
  });

  test("CEP vazio é pendência humana", () => {
    const a = auditarEndereco(contato({ id: "1" }), indexarEnderecos([linha({ cep: undefined })]));
    expect(a.situacao).toBe("pendente");
    expect(a.achados).toContain("cep_ausente");
    expect(a.formatado).toBeUndefined();
  });

  test("CEP e bairro ausentes ao mesmo tempo: só cep_ausente, sem_bairro não se aplica", () => {
    // O CEP é a fonte do bairro; sem CEP recuperável não há de onde completar o bairro,
    // então a pendência certa é só o CEP — "sem_bairro" aqui seria redundante e enganoso.
    const a = auditarEndereco(
      contato({ id: "1" }),
      indexarEnderecos([linha({ cep: undefined, bairro: undefined })]),
    );
    expect(a.achados).toContain("cep_ausente");
    expect(a.achados).not.toContain("sem_bairro");
  });

  test("contato sem linha na base é pendência", () => {
    const a = auditarEndereco(contato({ id: "999" }), indexarEnderecos([linha()]));
    expect(a.situacao).toBe("pendente");
    expect(a.achados).toEqual(["sem_linha"]);
  });

  test("dois endereços com um prioritário usa o prioritário", () => {
    const indice = indexarEnderecos([
      linha({ enderecoId: "1", prioritario: false, complemento: "Antigo" }),
      linha({ enderecoId: "2", prioritario: true, complemento: "Bloco A, sala 412" }),
    ]);
    const a = auditarEndereco(contato({ id: "1" }), indice);
    expect(a.endereco?.enderecoId).toBe("2");
    expect(a.linhas).toBe(2);
    expect(a.situacao).toBe("completo");
  });

  test("dois endereços e nenhum prioritário é pendência, nunca escolha", () => {
    const indice = indexarEnderecos([
      linha({ enderecoId: "1", prioritario: false }),
      linha({ enderecoId: "2", prioritario: false }),
    ]);
    const a = auditarEndereco(contato({ id: "1" }), indice);
    expect(a.situacao).toBe("pendente");
    expect(a.achados).toContain("sem_prioritario");
    expect(a.endereco).toBeUndefined();
  });

  test("dois endereços e dois prioritários é pendência, nunca escolha", () => {
    const indice = indexarEnderecos([
      linha({ enderecoId: "1", prioritario: true }),
      linha({ enderecoId: "2", prioritario: true }),
    ]);
    const a = auditarEndereco(contato({ id: "1" }), indice);
    expect(a.situacao).toBe("pendente");
    expect(a.achados).toContain("varios_prioritarios");
    expect(a.endereco).toBeUndefined();
  });

  test("linhas de contatos que não estão na planilha são ignoradas sem erro", () => {
    // A base real tem 1.531 linhas para 418 contatos do agrupador.
    const indice = indexarEnderecos([
      linha({ contatoId: "1" }),
      linha({ contatoId: "2", nome: "Outra Autoridade" }),
      linha({ contatoId: "3", nome: "Terceira Autoridade" }),
    ]);
    const a = auditarEndereco(contato({ id: "1" }), indice);
    expect(a.situacao).toBe("completo");
    expect(a.linhas).toBe(1);
  });

  test("sem Id, casa por nome quando o nome é único na base", () => {
    const a = auditarEndereco(contato(), indexarEnderecos([linha()]));
    expect(a.situacao).toBe("completo");
    expect(a.endereco?.contatoId).toBe("1");
  });

  test("com Id, nome ambíguo na base não desvia da junção por Id", () => {
    // 414 dos 418 contatos casam pelo Id sem ambiguidade nenhuma; é essa junção que
    // precisa vencer mesmo quando o nome, por coincidência, também aparece em outro id.
    const indice = indexarEnderecos([
      linha({ contatoId: "1", nome: "Nome Repetido" }),
      linha({ contatoId: "2", nome: "Nome Repetido", complemento: "Outro endereço" }),
    ]);
    const a = auditarEndereco(contato({ id: "1", nome: "Nome Repetido" }), indice);
    expect(a.situacao).toBe("completo");
    expect(a.endereco?.contatoId).toBe("1");
    expect(a.achados).not.toContain("nome_ambiguo");
  });

  test("sem Id, nome que casa dois contatos não recebe endereço nenhum", () => {
    const indice = indexarEnderecos([
      linha({ contatoId: "1" }),
      linha({ contatoId: "2", complemento: "Outro lugar" }),
    ]);
    const a = auditarEndereco(contato(), indice);
    expect(a.situacao).toBe("nao_verificado");
    expect(a.achados).toEqual(["nome_ambiguo"]);
    expect(a.endereco).toBeUndefined();
    expect(a.formatado).toBeUndefined();
  });
});

describe("formatarEnderecoContatos", () => {
  test("omite as linhas que não têm conteúdo", () => {
    expect(formatarEnderecoContatos(linha({ bairro: undefined, complemento: undefined }))).toBe(
      "Setor de Autarquias Sul, Quadra 3, S/N\n70070-030 Brasília - DF",
    );
  });

  test("sem logradouro e número, o complemento não ganha um '- ' sobrando na frente", () => {
    const a = formatarEnderecoContatos(
      linha({ logradouro: undefined, numero: undefined, bairro: undefined }),
    );
    expect(a.startsWith("- ")).toBe(false);
    expect(a).toBe("Bloco A, sala 412\n70070-030 Brasília - DF");
  });
});
