import { describe, expect, test } from "vitest";
import { aplicarEleicao, classificarEleitos, ORIENTACAO_OUTRA_CASA, RESUMO_NAO_ELEITO, resumoEleicaoDoDeputado } from "@/lib/eleitos";
import { GRUPO_DEPUTADOS_ELEITOS, GRUPO_SENADORES_ELEITOS } from "@/data/grupos-posse";
import type { ContatoPlanilha, DeputadoAtual, EleitoPlanilha, GovernadorPlanilha, ResultadoAnalise, ResultadoContato, ResultadoGrupo } from "@/lib/types";

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

  test("senador atual eleito deputado, na planilha da Câmara, fica no grupo Senadores como outra_casa", () => {
    const e = eleito({ casa: "camara", statusMandato: "Mandato novo (atual senador)" });
    const [r] = classificarEleitos([e], [senadores(joana)]);
    expect(r.destino).toBe("outra_casa");
    expect(r.contatos).toEqual([{ grupo: "Senadores", nome: "Joana Fictícia", id: "10" }]);
  });

  test("deputado suplente em exercício, na planilha da Câmara, conta como reeleito", () => {
    const [r] = classificarEleitos([eleito({ casa: "camara", statusMandato: "Atual deputado (suplente em exercício)" })], []);
    expect(r.destino).toBe("reeleito");
  });

  test("mandato novo sem ninguém no Contatos vai para o grupo novo", () => {
    expect(dest(classificarEleitos([eleito({ statusMandato: "Mandato novo" })], [senadores()]))).toEqual(["novo"]);
  });

  test("mandato novo já cadastrado no grupo novo, com o rótulo do Contatos, fica novo, marcado jaCadastrado", () => {
    const novos = grupo(GRUPO_SENADORES_ELEITOS, [{ nome: "Joana Fictícia", grupo: GRUPO_SENADORES_ELEITOS }]);
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo" })], [novos]);
    expect(r).toMatchObject({ destino: "novo", grupoDestino: GRUPO_SENADORES_ELEITOS, jaCadastrado: true });
  });

  test("grupo de eleitos com rótulo antigo ('Senadores Eleitos') não conta como já cadastrado", () => {
    const novos = grupo("Senadores Eleitos", [{ nome: "Joana Fictícia", grupo: "Senadores Eleitos" }]);
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo" })], [novos]);
    expect(r.destino).toBe("novo");
    expect(r.contatos).toEqual([{ grupo: "Senadores Eleitos", nome: "Joana Fictícia" }]);
    expect(r.jaCadastrado).toBeUndefined();
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

  test("planilha diz deputado atual, mas a pessoa não está na lista: a lista decide, senador eleito de mandato novo", () => {
    const atuais: DeputadoAtual[] = [{ uf: "MA", nomeParlamentar: "Outro Nome", nomeCivil: "Outra Pessoa" }];
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo (atual deputado federal)" })], [], atuais);
    expect(r).toMatchObject({ destino: "novo", grupoDestino: GRUPO_SENADORES_ELEITOS });
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

  test("mandato novo que consta entre os deputados em exercício é reeleito em Deputados Federais (Câmara)", () => {
    const atuais: DeputadoAtual[] = [{ uf: "MA", nomeParlamentar: "Joana Fictícia", nomeCivil: "Joana Maria Fictícia Souza" }];
    const [r] = classificarEleitos([eleito({ casa: "camara", statusMandato: "Mandato novo" })], [], atuais);
    expect(r).toMatchObject({ destino: "reeleito", grupoDestino: "Deputados Federais" });
    expect(r.motivo).toBeUndefined();
  });

  test("senador eleito de mandato novo que está em exercício na Câmara fica em Deputados Federais", () => {
    const atuais: DeputadoAtual[] = [{ uf: "MA", nomeParlamentar: "Joana Fictícia", nomeCivil: "Joana Maria Fictícia Souza" }];
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo" })], [senadores()], atuais);
    expect(r).toMatchObject({ destino: "outra_casa", grupoDestino: "Deputados Federais" });
  });

  test("mandato novo com dois deputados homônimos em exercício vai para conferir, nunca para novo", () => {
    const joanaDep: DeputadoAtual = { uf: "MA", nomeParlamentar: "Joana Fictícia", nomeCivil: "Outra Civil" };
    const [r] = classificarEleitos([eleito({ casa: "camara", statusMandato: "Mandato novo" })], [], [joanaDep, { ...joanaDep, nomeCivil: "Outra Civil Dois" }]);
    expect(r.destino).toBe("conferir");
    expect(r.motivo).toBe("Mais de um deputado em exercício casa este nome: conferir");
  });

  test("deputado atual na planilha com dois homônimos na lista vai para conferir com o motivo do homônimo", () => {
    const joanaDep: DeputadoAtual = { uf: "MA", nomeParlamentar: "Joana Fictícia", nomeCivil: "Outra Civil" };
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo (atual deputado federal)" })], [], [joanaDep, { ...joanaDep, nomeCivil: "Outra Civil Dois" }]);
    expect(r.destino).toBe("conferir");
    expect(r.motivo).toBe("Mais de um deputado em exercício casa este nome: conferir");
  });

  test("mandato novo fora da lista de deputados em exercício continua novo", () => {
    const atuais: DeputadoAtual[] = [{ uf: "MA", nomeParlamentar: "Outro Nome", nomeCivil: "Outra Pessoa" }];
    const [r] = classificarEleitos([eleito({ casa: "camara", statusMandato: "Mandato novo" })], [], atuais);
    expect(r.destino).toBe("novo");
  });

  test("'atual deputado federal' na planilha do Senado vale; na da Câmara é status não previsto", () => {
    const [r] = classificarEleitos([eleito({ casa: "camara", statusMandato: "Mandato novo (atual deputado federal)" })], []);
    expect(r.destino).toBe("conferir");
    expect(r.motivo).toBe('Status do mandato não previsto: "Mandato novo (atual deputado federal)"');
  });

  test("'atual senador' na planilha do Senado é status não previsto", () => {
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo (atual senador)" })], []);
    expect(r.destino).toBe("conferir");
    expect(r.motivo).toBe('Status do mandato não previsto: "Mandato novo (atual senador)"');
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
    resumo: { total: 2, verde: 2, amarelo: 0, vermelho: 0, novo: 0, indeterminado: 0, enderecosAConfirmar: 0, possivelSaida: 0, contatosSemFonte: 0, gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0, gruposReaproveitados: 0, urlsCaidasRepetidas: 0, gruposComMudanca: 0 },
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
    expect(aplicarEleicao(resultado, [], [], atuais).eleicao?.deputadosAtuais).toEqual([{ ...atuais[0], eleicao2026: RESUMO_NAO_ELEITO }]);
  });

  test("a orientação da troca de Casa cita a Ata 14", () => {
    expect(ORIENTACAO_OUTRA_CASA).toBe("Convidado pelo cargo atual (Ata 14 do GT Cerimonial, 09/06/2026)");
  });
});

describe("aplicarEleicao: governadores", () => {
  const reeleitoGO: GovernadorPlanilha = {
    uf: "GO", nomeUrna: "Marta Fictícia", nomeCompleto: "Marta Aparecida Fictícia Lima", situacaoTse: "Eleito", statusMandato: "Reeleição",
  };
  const martaGov: ContatoPlanilha = { id: "1", nome: "Marta Fictícia", grupo: "Governadores", departamento: "", cargo: "Governadora do Estado de Goiás" };
  const base = (): ResultadoAnalise => ({
    arquivoNome: "base.xlsx",
    grupos: [grupo("Governadores", [martaGov])],
    resumo: { total: 1, verde: 1, amarelo: 0, vermelho: 0, novo: 0, indeterminado: 0, enderecosAConfirmar: 0, possivelSaida: 0, contatosSemFonte: 0, gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0, gruposReaproveitados: 0, urlsCaidasRepetidas: 0, gruposComMudanca: 0 },
  });
  const gs = { eleitos: [reeleitoGO], segundoTurno: [] };

  test("anexa eleicaoGoverno à linha, grava eleicao.governadores e não mexe em resumo nem comparações", () => {
    const entrada = base();
    const r = aplicarEleicao(entrada, [], ["gov.xlsx"], undefined, gs);
    const l = r.grupos[0].contatos[0];
    expect(l.eleicaoGoverno).toMatchObject({ destino: "reeleito", uf: "GO" });
    expect(l.comparacoes).toEqual([]);
    expect(l.possivelSaida).toBeUndefined();
    expect(r.resumo).toEqual(entrada.resumo);
    expect(r.eleicao?.governadores?.eleitos).toHaveLength(1);
    expect(r.eleicao?.governadores?.segundoTurno).toEqual([]);
  });

  test("sem governadores o retrato não ganha eleicao.governadores nem eleicaoGoverno", () => {
    const r = aplicarEleicao(base(), [], ["a.xlsx"]);
    expect(r.eleicao && "governadores" in r.eleicao).toBe(false);
    expect("eleicaoGoverno" in r.grupos[0].contatos[0]).toBe(false);
  });

  test("não muta a entrada", () => {
    const entrada = base();
    const copia = structuredClone(entrada);
    aplicarEleicao(entrada, [], ["gov.xlsx"], undefined, gs);
    expect(entrada).toEqual(copia);
  });
});

describe("classificarEleitos com a lista de exercício da Câmara (spec 2026-10-30 §4.3.1)", () => {
  const dep = (over: Partial<DeputadoAtual>): DeputadoAtual => ({ uf: "SP", nomeParlamentar: "Outro Deputado", nomeCivil: "OUTRO DEPUTADO DA SILVA", ...over });
  const foraDaLista: DeputadoAtual[] = [dep({})];
  const deltan = eleito({ uf: "PR", nomeUrna: "Deltan Dallagnol", nomeCompleto: "Deltan Martinazzo Dallagnol", statusMandato: "Mandato novo (atual deputado federal)" });
  const camara = (over: Partial<EleitoPlanilha>) => eleito({ casa: "camara", ...over });

  test("Deltan, senador eleito que não está na lista da Câmara, vai para os senadores eleitos", () => {
    const [r] = classificarEleitos([deltan], [senadores()], foraDaLista);
    expect(r).toMatchObject({ destino: "novo", grupoDestino: GRUPO_SENADORES_ELEITOS, contatos: [] });
    expect(r.jaCadastrado).toBeUndefined();
  });

  test("Zé Adriano, mandato novo e efetivado na lista da Câmara, é reeleito em Deputados Federais", () => {
    const e = camara({ uf: "AC", nomeUrna: "Zé Adriano", nomeCompleto: "José Adriano Fictício Lima", statusMandato: "Mandato novo" });
    const [r] = classificarEleitos([e], [], [dep({ uf: "AC", nomeParlamentar: "Zé Adriano", nomeCivil: "JOSE ADRIANO FICTICIO LIMA", condicao: "E" })]);
    expect(r).toMatchObject({ destino: "reeleito", grupoDestino: "Deputados Federais" });
    expect(r.motivo).toBeUndefined();
  });

  test("Dr. Fábio Rueda, suplente em exercício pelo TSE mas fora da lista, é primeiro mandato", () => {
    const e = camara({ uf: "AC", nomeUrna: "Dr. Fábio Rueda", nomeCompleto: "Fábio Fictício Rueda", statusMandato: "Atual deputado (suplente em exercício)" });
    const [r] = classificarEleitos([e], [], foraDaLista);
    expect(r).toMatchObject({ destino: "novo", grupoDestino: GRUPO_DEPUTADOS_ELEITOS });
  });

  test("Joana Darc, 'Mandato novo (verificar)' fora da lista, é primeiro mandato", () => {
    const e = camara({ uf: "AM", nomeUrna: "Joana Darc", nomeCompleto: "Joana Darc Fictícia", statusMandato: "Mandato novo (verificar)" });
    const [r] = classificarEleitos([e], [], foraDaLista);
    expect(r).toMatchObject({ destino: "novo", grupoDestino: GRUPO_DEPUTADOS_ELEITOS });
  });

  test("Izalci Lucas, deputado eleito que é senador no Contatos, fica em Senadores", () => {
    const izalci: ContatoPlanilha = { id: "40", nome: "Izalci Lucas", grupo: "Senadores", departamento: "DISTRITO FEDERAL" };
    const e = camara({ uf: "DF", nomeUrna: "Izalci Lucas", nomeCompleto: "Izalci Lucas Ferreira", statusMandato: "Mandato novo (atual senador)" });
    const [r] = classificarEleitos([e], [senadores(izalci)], foraDaLista);
    expect(r).toMatchObject({ destino: "outra_casa", grupoDestino: "Senadores", jaCadastrado: true });
    expect(r.contatos).toEqual([{ grupo: "Senadores", nome: "Izalci Lucas", id: "40" }]);
  });

  test("senador fora de exercício eleito deputado fica em Senadores, sem contar como já cadastrado lá", () => {
    const rotulo = "Senadores titulares fora de exercício - Posse 2027";
    const contato: ContatoPlanilha = { id: "41", nome: "Joana Fictícia", grupo: rotulo, departamento: "MARANHÃO" };
    const [r] = classificarEleitos([camara({ statusMandato: "Mandato novo (atual senador)" })], [grupo(rotulo, [contato])], foraDaLista);
    expect(r).toMatchObject({ destino: "outra_casa", grupoDestino: "Senadores" });
    expect(r.contatos.map((c) => c.grupo)).toEqual([rotulo]);
    expect(r.jaCadastrado).toBeUndefined();
  });

  test("Jader Filho, mandato novo cujo nome casa o senador Jader Barbalho, vai para conferir", () => {
    const jader: ContatoPlanilha = { id: "42", nome: "Jader Barbalho", grupo: "Senadores", departamento: "PARÁ" };
    const e = camara({ uf: "PA", nomeUrna: "Jader Filho", nomeCompleto: "Jader Fontenelle Barbalho Filho", statusMandato: "Mandato novo" });
    const [r] = classificarEleitos([e], [senadores(jader)], foraDaLista);
    expect(r).toMatchObject({ destino: "conferir", grupoDestino: "" });
    expect(r.motivo).toContain('"Senadores"');
    expect(r.contatos).toEqual([{ grupo: "Senadores", nome: "Jader Barbalho", id: "42" }]);
  });

  test("senador eleito que está na lista da Câmara fica em Deputados Federais (Ata 14)", () => {
    const lista = [dep({ uf: "MA", nomeParlamentar: "Joana Fictícia", nomeCivil: "JOANA MARIA FICTICIA SOUZA" })];
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo" })], [senadores()], lista);
    expect(r).toMatchObject({ destino: "outra_casa", grupoDestino: "Deputados Federais", contatos: [] });
  });

  test("senador reeleito presente em Senadores fica em Senadores, já cadastrado", () => {
    const [r] = classificarEleitos([eleito()], [senadores(joana)], foraDaLista);
    expect(r).toMatchObject({ destino: "reeleito", grupoDestino: "Senadores", jaCadastrado: true });
  });

  test("senador reeleito fora dos grupos do Senado vai para conferir", () => {
    const [r] = classificarEleitos([eleito()], [senadores()], foraDaLista);
    expect(r).toMatchObject({ destino: "conferir", grupoDestino: "" });
    expect(r.motivo).toContain("não está no grupo de senadores");
  });

  test("status não previsto do Senado, fora da lista, é mandato novo", () => {
    const [r] = classificarEleitos([eleito({ statusMandato: "Outra coisa" })], [senadores()], foraDaLista);
    expect(r).toMatchObject({ destino: "novo", grupoDestino: GRUPO_SENADORES_ELEITOS });
  });

  test("mandato novo já no grupo de eleitos com o rótulo do Contatos fica jaCadastrado", () => {
    const novos = grupo(GRUPO_DEPUTADOS_ELEITOS, [{ nome: "Joana Fictícia", grupo: GRUPO_DEPUTADOS_ELEITOS, departamento: "MARANHÃO" }]);
    const [r] = classificarEleitos([camara({ statusMandato: "Mandato novo" })], [novos], foraDaLista);
    expect(r).toMatchObject({ destino: "novo", grupoDestino: GRUPO_DEPUTADOS_ELEITOS, jaCadastrado: true });
  });

  test("reeleito na lista que já está no grupo Deputados Federais do Contatos fica jaCadastrado", () => {
    const depContato: ContatoPlanilha = { id: "50", nome: "Joana Fictícia", grupo: "Deputados Federais", departamento: "MARANHÃO" };
    const lista = [dep({ uf: "MA", nomeParlamentar: "Joana Fictícia", nomeCivil: "JOANA MARIA FICTICIA SOUZA" })];
    const [r] = classificarEleitos([camara({ statusMandato: "Mandato novo" })], [grupo("Deputados Federais", [depContato])], lista);
    expect(r).toMatchObject({ destino: "reeleito", grupoDestino: "Deputados Federais", jaCadastrado: true });
  });

  test("primeiro mandato que casa contato de Deputados Federais do Contatos vai para conferir", () => {
    const depContato: ContatoPlanilha = { id: "51", nome: "Joana Fictícia", grupo: "Deputados Federais", departamento: "MARANHÃO" };
    const [r] = classificarEleitos([camara({ statusMandato: "Mandato novo" })], [grupo("Deputados Federais", [depContato])], foraDaLista);
    expect(r).toMatchObject({ destino: "conferir", grupoDestino: "" });
    expect(r.motivo).toContain('"Deputados Federais"');
  });
});

describe("classificarEleitos sem a lista da Câmara: grupo de destino pela tabela", () => {
  test("cada destino leva o grupo do Contatos da Ata 14", () => {
    const r = classificarEleitos([
      eleito(),
      eleito({ casa: "camara" }),
      eleito({ statusMandato: "Mandato novo" }),
      eleito({ casa: "camara", nomeUrna: "Pedro Novato", nomeCompleto: "Pedro Novato Lima", statusMandato: "Mandato novo" }),
      eleito({ casa: "camara", statusMandato: "Mandato novo (atual senador)" }),
      eleito({ statusMandato: "Mandato novo (verificar)" }),
    ], [senadores(joana)]);
    expect(r.map((x) => [x.destino, x.grupoDestino])).toEqual([
      ["reeleito", "Senadores"],
      ["reeleito", "Deputados Federais"],
      ["conferir", ""],
      ["novo", GRUPO_DEPUTADOS_ELEITOS],
      ["outra_casa", "Senadores"],
      ["conferir", ""],
    ]);
  });

  test("senador de mandato novo sem ninguém no Contatos vai para os senadores eleitos", () => {
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo" })], [senadores()]);
    expect(r.grupoDestino).toBe(GRUPO_SENADORES_ELEITOS);
  });

  test("deputado atual eleito senador vai para Deputados Federais", () => {
    const deputados = grupo("Deputados Federais", [{ id: "20", nome: "Joana Fictícia", grupo: "Deputados Federais", departamento: "MARANHÃO" }]);
    const [r] = classificarEleitos([eleito({ statusMandato: "Mandato novo (atual deputado federal)" })], [deputados]);
    expect(r).toMatchObject({ destino: "outra_casa", grupoDestino: "Deputados Federais", jaCadastrado: true });
  });
});

describe("resumoEleicaoDoDeputado", () => {
  const d: DeputadoAtual = { uf: "MA", nomeParlamentar: "Joana Fictícia", nomeCivil: "JOANA MARIA FICTICIA SOUZA" };

  test("deputado sem eleito correspondente não foi eleito em 2026", () => {
    expect(resumoEleicaoDoDeputado(d, [eleito({ nomeUrna: "Outra Pessoa", nomeCompleto: "Outra Pessoa Qualquer" })])).toBe("Não eleito em 2026");
    expect(RESUMO_NAO_ELEITO).toBe("Não eleito em 2026");
  });

  test("eleito à Câmara pelo nome parlamentar na mesma UF é reeleito", () => {
    expect(resumoEleicaoDoDeputado(d, [eleito({ casa: "camara", nomeCompleto: "Outro Nome Civil" })])).toBe("Reeleito deputado federal");
  });

  test("nome de urna igual em outra UF não casa", () => {
    expect(resumoEleicaoDoDeputado(d, [eleito({ casa: "camara", uf: "PI", nomeCompleto: "Outro Nome Civil" })])).toBe(RESUMO_NAO_ELEITO);
  });

  test("eleito ao Senado pelo nome civil, em qualquer UF, é eleito senador", () => {
    expect(resumoEleicaoDoDeputado(d, [eleito({ uf: "PI", nomeUrna: "Joana Senadora" })])).toBe("Eleito senador");
  });

  test("a Câmara vence o Senado e o Senado vence o governo", () => {
    const gov: GovernadorPlanilha = { uf: "MA", nomeUrna: "Joana Fictícia", nomeCompleto: "Joana Maria Fictícia Souza", situacaoTse: "Eleito", statusMandato: "Mandato novo" };
    const governadores = { eleitos: [gov], segundoTurno: [] };
    expect(resumoEleicaoDoDeputado(d, [eleito(), eleito({ casa: "camara" })], governadores)).toBe("Reeleito deputado federal");
    expect(resumoEleicaoDoDeputado(d, [eleito()], governadores)).toBe("Eleito senador");
    expect(resumoEleicaoDoDeputado(d, [], governadores)).toBe("Eleito governador");
  });
});

describe("aplicarEleicao: resumo da eleição do deputado do .xls", () => {
  const resultado: ResultadoAnalise = {
    arquivoNome: "base.xlsx", grupos: [],
    resumo: { total: 0, verde: 0, amarelo: 0, vermelho: 0, novo: 0, indeterminado: 0, enderecosAConfirmar: 0, possivelSaida: 0, contatosSemFonte: 0, gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0, gruposReaproveitados: 0, urlsCaidasRepetidas: 0, gruposComMudanca: 0 },
  };

  test("preenche eleicao2026 só de quem veio sem ela e mantém o texto da planilha gerada", () => {
    const doXls: DeputadoAtual = { uf: "MA", nomeParlamentar: "Joana Fictícia", nomeCivil: "JOANA MARIA FICTICIA SOUZA" };
    const semEleicao: DeputadoAtual = { uf: "SP", nomeParlamentar: "Pedro Fictício", nomeCivil: "PEDRO FICTICIO" };
    const daPlanilha: DeputadoAtual = { uf: "RJ", nomeParlamentar: "Ana Fictícia", nomeCivil: "ANA FICTICIA", eleicao2026: "Não concorreu em 2026" };
    const r = aplicarEleicao(resultado, [eleito({ casa: "camara" })], [], [doXls, semEleicao, daPlanilha]);
    expect(r.eleicao?.deputadosAtuais?.map((x) => x.eleicao2026)).toEqual(["Reeleito deputado federal", RESUMO_NAO_ELEITO, "Não concorreu em 2026"]);
    expect(doXls.eleicao2026).toBeUndefined();
  });
});
