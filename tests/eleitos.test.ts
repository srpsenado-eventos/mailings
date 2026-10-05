import { describe, expect, test } from "vitest";
import { aplicarEleicao, classificarEleitos, ORIENTACAO_OUTRA_CASA } from "@/lib/eleitos";
import type { ContatoPlanilha, DeputadoAtual, EleitoPlanilha, ResultadoAnalise, ResultadoContato, ResultadoGrupo } from "@/lib/types";

const eleito = (over: Partial<EleitoPlanilha> = {}): EleitoPlanilha => ({
  casa: "senado", uf: "MA", nomeUrna: "Joana Fictícia", nomeCompleto: "Joana Maria Fictícia Souza",
  situacaoTse: "Eleito", statusMandato: "Reeleição", ...over,
});
const linha = (contato: ContatoPlanilha): ResultadoContato => ({
  contato, semaforo: "verde", score: 1, comparacoes: [], camposDivergentes: [], origem: "oficial",
});
const grupo = (nome: string, contatos: ContatoPlanilha[]): ResultadoGrupo => ({
  grupo: nome, semFonte: false, contatos: contatos.map(linha), novos: [],
});
const senadores = (...cs: ContatoPlanilha[]) => grupo("Senadores", cs);
const joana: ContatoPlanilha = { id: "10", nome: "Joana Fictícia", grupo: "Senadores", departamento: "MARANHÃO" };
const dest = (r: ReturnType<typeof classificarEleitos>) => r.map((x) => x.destino);

describe("classificarEleitos: destino pelo Status do mandato", () => {
  test("reeleição no grupo atual fica como reeleito e aponta a linha do Contatos", () => {
    const [r] = classificarEleitos([eleito()], [senadores(joana)]);
    expect(r.destino).toBe("reeleito");
    expect(r.contatos).toEqual([{ grupo: "Senadores", nome: "Joana Fictícia", id: "10" }]);
  });

  test("suplente em exercício conta como reeleito", () => {
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo (em exercício como 1º suplente)" })], [senadores(joana)]);
    expect(r.destino).toBe("reeleito");
  });

  test("deputado atual eleito senador fica no grupo atual como outra_casa (Ata 14)", () => {
    const e = eleito({ statusMandato: "Mandato novo (atual deputado federal)" });
    const deputados = grupo("Deputados Federais", [{ id: "20", nome: "Joana Fictícia", grupo: "Deputados Federais", departamento: "MARANHÃO" }]);
    const [r] = classificarEleitos([e], [deputados]);
    expect(r.destino).toBe("outra_casa");
    expect(r.contatos[0].grupo).toBe("Deputados Federais");
  });

  test("mandato novo sem ninguém no Contatos vai para o grupo novo", () => {
    expect(dest(classificarEleitos([eleito({ statusMandato: "Mandato novo" })], [senadores()]))).toEqual(["novo"]);
  });

  test("mandato novo já cadastrado no grupo novo fica novo, marcado jaCadastrado", () => {
    const novos = grupo("Senadores Eleitos", [{ nome: "Joana Fictícia", grupo: "Senadores Eleitos" }]);
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo" })], [novos]);
    expect(r).toMatchObject({ destino: "novo", jaCadastrado: true });
  });

  test("'verificar' e status desconhecido vão para conferir, com motivo", () => {
    const r = classificarEleitos([eleito({ statusMandato: "Mandato novo (verificar)" }), eleito({ statusMandato: "Outra coisa" })], []);
    expect(dest(r)).toEqual(["conferir", "conferir"]);
    expect(r[0].motivo).toContain("verificação");
    expect(r[1].motivo).toBe('Status do mandato não previsto: "Outra coisa"');
  });

  test("status com caixa e espaços diferentes é normalizado", () => {
    expect(dest(classificarEleitos([eleito({ statusMandato: "  REELEIÇÃO " })], [senadores(joana)]))).toEqual(["reeleito"]);
  });

  test("projeção da imprensa é marcada sem mudar o destino", () => {
    const [r] = classificarEleitos([eleito({ situacaoTse: "PROJEÇÃO da imprensa (TSE ainda não homologou)" })], [senadores(joana)]);
    expect(r).toMatchObject({ destino: "reeleito", projecao: true });
  });
});

describe("classificarEleitos: contradições viram conferir", () => {
  test("reeleito que não está no grupo de senadores", () => {
    const [r] = classificarEleitos([eleito()], [senadores()]);
    expect(r.destino).toBe("conferir");
    expect(r.motivo).toContain("não está no grupo de senadores");
  });

  test("mandato novo que já está num grupo de parlamentar atual", () => {
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo" })], [senadores(joana)]);
    expect(r.destino).toBe("conferir");
    expect(r.motivo).toContain("já está em \"Senadores\"");
  });

  test("planilha diz deputado atual, mas a pessoa não está na lista de deputados em exercício", () => {
    const atuais: DeputadoAtual[] = [{ uf: "MA", nomeParlamentar: "Outro Nome", nomeCivil: "Outra Pessoa" }];
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo (atual deputado federal)" })], [], atuais);
    expect(r.destino).toBe("conferir");
    expect(r.motivo).toContain("deputados em exercício");
  });

  test("com a lista de atuais e a pessoa nela, sem grupo de deputados no Contatos, vale a planilha", () => {
    const atuais: DeputadoAtual[] = [{ uf: "MA", nomeParlamentar: "Joana Fictícia", nomeCivil: "Joana Maria Fictícia Souza" }];
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo (atual deputado federal)" })], [], atuais);
    expect(r.destino).toBe("outra_casa");
    expect(r.contatos).toEqual([]);
  });

  test("deputado reeleito sem o grupo Deputados Federais no Contatos vale pela planilha", () => {
    const [r] = classificarEleitos([eleito({ casa: "camara" })], [senadores(joana)]);
    expect(r.destino).toBe("reeleito");
  });

  test("nome que casa duas pessoas diferentes do Contatos vai para conferir", () => {
    const outra: ContatoPlanilha = { id: "11", nome: "Joana Fictícia", grupo: "Senadores", departamento: "MARANHÃO" };
    const [r] = classificarEleitos([eleito()], [senadores(joana, outra)]);
    expect(r.destino).toBe("conferir");
    expect(r.motivo).toBe("Nome casa mais de um contato do Contatos");
  });
});

describe("classificarEleitos: casamento por nome", () => {
  test("nome de urna curto não casa senador homônimo de outra UF", () => {
    const camilo: ContatoPlanilha = { id: "30", nome: "Camilo Outro Sobrenome", grupo: "Senadores", departamento: "AMAPÁ" };
    const [r] = classificarEleitos([eleito({ uf: "CE", nomeUrna: "Camilo", nomeCompleto: "Camilo Fictício Santos" })], [senadores(camilo)]);
    expect(r.destino).toBe("conferir");
    expect(r.motivo).toContain("não está no grupo");
  });

  test("casa por token quando o Contatos tem o nome mais curto, na mesma UF", () => {
    const curto: ContatoPlanilha = { id: "31", nome: "Joana Souza", grupo: "Senadores", departamento: "MARANHÃO" };
    const [r] = classificarEleitos([eleito()], [senadores(curto)]);
    expect(r.destino).toBe("reeleito");
  });

  test("a mesma pessoa em dois grupos de senadores, com o mesmo Id, não é ambiguidade", () => {
    const presidente = grupo("Presidente do Senado Federal; Senadores", [{ ...joana, grupo: "Presidente do Senado Federal; Senadores" }]);
    const [r] = classificarEleitos([eleito()], [senadores(joana), presidente]);
    expect(r.destino).toBe("reeleito");
    expect(r.contatos.map((c) => c.grupo)).toEqual(["Senadores", "Presidente do Senado Federal; Senadores"]);
  });

  test("grupo de ex-senadores não conta como grupo atual", () => {
    const ex = grupo("Ex-Senadores", [{ ...joana, grupo: "Ex-Senadores" }]);
    expect(dest(classificarEleitos([eleito()], [ex]))).toEqual(["conferir"]);
  });
});

describe("aplicarEleicao", () => {
  const resultado: ResultadoAnalise = {
    arquivoNome: "base.xlsx",
    grupos: [senadores(joana, { id: "12", nome: "Pedro Ficticio", grupo: "Senadores", departamento: "PIAUÍ" })],
    resumo: { total: 2, verde: 2, amarelo: 0, vermelho: 0, novo: 0, indeterminado: 0, enderecosAConfirmar: 0, possivelSaida: 0, contatosSemFonte: 0, gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0 },
  };

  test("anexa a eleição só à linha casada, sem mudar semáforo nem resumo, e guarda o resultado", () => {
    const r = aplicarEleicao(resultado, [eleito({ partido: "PXX" })], ["senado.xlsx"]);
    const [c1, c2] = r.grupos[0].contatos;
    expect(c1.eleicao).toMatchObject({ casa: "senado", destino: "reeleito", uf: "MA", partido: "PXX", nomeUrna: "Joana Fictícia" });
    expect(c1.semaforo).toBe("verde");
    expect(c2.eleicao).toBeUndefined();
    expect(r.resumo).toEqual(resultado.resumo);
    expect(r.eleicao).toMatchObject({ arquivos: ["senado.xlsx"], camaraNoContatos: false });
    expect(r.eleicao?.eleitos).toHaveLength(1);
  });

  test("não muta a entrada", () => {
    const antes = JSON.stringify(resultado);
    aplicarEleicao(resultado, [eleito()], ["x.xlsx"]);
    expect(JSON.stringify(resultado)).toBe(antes);
  });

  test("guarda a lista de deputados atuais quando enviada", () => {
    const atuais: DeputadoAtual[] = [{ uf: "MA", nomeParlamentar: "X", nomeCivil: "Y" }];
    expect(aplicarEleicao(resultado, [], [], atuais).eleicao?.deputadosAtuais).toEqual(atuais);
  });

  test("a orientação da troca de Casa cita a Ata 14", () => {
    expect(ORIENTACAO_OUTRA_CASA).toBe("Convidado pelo cargo atual (Ata 14 do GT Cerimonial, 09/06/2026)");
  });
});
