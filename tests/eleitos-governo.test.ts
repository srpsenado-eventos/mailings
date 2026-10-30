import { describe, expect, test } from "vitest";
import { agruparSegundoTurno, classificarGovernadores, paraContatoGoverno } from "@/lib/eleitos-governo";
import { MOTIVO_AMBIGUO } from "@/lib/eleitos";
import { GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS } from "@/data/grupos-posse";
import { HISTORICO_VAZIO, registrar, type RegistroManual } from "@/lib/decisoes";
import type { ContatoPlanilha, DeputadoAtual, GovernadorPlanilha, ResultadoContato, ResultadoGrupo } from "@/lib/types";

const gov = (over: Partial<GovernadorPlanilha> = {}): GovernadorPlanilha => ({
  uf: "GO", nomeUrna: "Marta Fictícia", nomeCompleto: "Marta Aparecida Fictícia Lima",
  situacaoTse: "Eleito", statusMandato: "Reeleição", ...over,
});
const linha = (contato: ContatoPlanilha): ResultadoContato => ({
  contato, semaforo: "verde", score: 1, comparacoes: [], camposDivergentes: [], origem: "oficial",
});
const grupo = (nome: string, contatos: ContatoPlanilha[]): ResultadoGrupo => ({
  grupo: nome, semFonte: false, contatos: contatos.map(linha), novos: [],
});
// Formato real do Contatos: Departamento vazio, UF no Cargo.
const marta = (g: string, cargo = "Governadora do Estado de Goiás"): ContatoPlanilha => ({
  id: "1", nome: "Marta Fictícia", grupo: g, cargo, departamento: "",
});

describe("classificarGovernadores", () => {
  test("reeleição com contato em Governadores da mesma UF fica reeleito", () => {
    const [r] = classificarGovernadores([gov()], [grupo("Governadores", [marta("Governadores")])]);
    expect(r.destino).toBe("reeleito");
    expect(r.contatos).toEqual([{ grupo: "Governadores", nome: "Marta Fictícia", id: "1" }]);
  });

  test("reeleição sem contato vai para conferir", () => {
    const [r] = classificarGovernadores([gov()], [grupo("Governadores", [])]);
    expect(r.destino).toBe("conferir");
    expect(r.motivo).toContain("não está no grupo Governadores do Contatos");
  });

  test("homônimo em Governadores de outra UF não casa", () => {
    const outra = marta("Governadores", "Governadora do Estado de Minas Gerais");
    const [r] = classificarGovernadores([gov()], [grupo("Governadores", [outra])]);
    expect(r.destino).toBe("conferir");
    expect(r.contatos).toEqual([]);
  });

  test("mandato novo sem contato fica novo", () => {
    const [r] = classificarGovernadores([gov({ statusMandato: "Mandato novo" })], []);
    expect(r).toMatchObject({ destino: "novo", contatos: [] });
    expect(r.jaCadastrado).toBeUndefined();
  });

  test("mandato novo já no grupo de governadores eleitos com o rótulo do Contatos fica novo e jaCadastrado", () => {
    const rotulo = "governadores eleitos - posse presidencial 2027 ";
    const [r] = classificarGovernadores([gov({ statusMandato: "Mandato novo" })], [grupo(rotulo, [marta(rotulo)])]);
    expect(r).toMatchObject({ destino: "novo", grupoDestino: GRUPO_GOVERNADORES_ELEITOS, jaCadastrado: true });
  });

  test("mandato novo no grupo com o rótulo antigo 'Governadores Eleitos' é ligado, mas não conta como cadastrado", () => {
    // Ajuste de 30/10: o já cadastrado segue o rótulo do agrupador, como senadores e deputados.
    const [r] = classificarGovernadores([gov({ statusMandato: "Mandato novo" })], [grupo("Governadores Eleitos", [marta("Governadores Eleitos")])]);
    expect(r).toMatchObject({ destino: "novo", contatos: [{ grupo: "Governadores Eleitos", nome: "Marta Fictícia", id: "1" }] });
    expect(r.jaCadastrado).toBeUndefined();
  });

  test("mandato novo com contato em Governadores vai para conferir citando o grupo", () => {
    const [r] = classificarGovernadores([gov({ statusMandato: "Mandato novo" })], [grupo("Governadores", [marta("Governadores")])]);
    expect(r.destino).toBe("conferir");
    expect(r.motivo).toContain("Governadores");
  });

  test("atual senador com contato em Senadores fica outro_cargo", () => {
    const e = gov({ statusMandato: "Mandato novo (atual senador)" });
    const [r] = classificarGovernadores([e], [grupo("Senadores", [marta("Senadores")])]);
    expect(r.destino).toBe("outro_cargo");
    expect(r.contatos[0].grupo).toBe("Senadores");
  });

  test("atual senador sem contato vai para conferir", () => {
    const [r] = classificarGovernadores([gov({ statusMandato: "Mandato novo (atual senador)" })], [grupo("Senadores", [])]);
    expect(r.destino).toBe("conferir");
  });

  test("Governadores e Senadores juntos: reeleição não confunde os grupos", () => {
    const grupos = [grupo("Governadores", [marta("Governadores")]), grupo("Senadores", [marta("Senadores")])];
    const [r] = classificarGovernadores([gov()], grupos);
    expect(r.destino).toBe("reeleito");
    expect(r.contatos.map((c) => c.grupo)).toEqual(["Governadores"]);
  });

  describe("atual deputado federal", () => {
    const e = gov({ statusMandato: "Mandato novo (atual deputado federal)" });
    const atual: DeputadoAtual = { uf: "GO", nomeParlamentar: "Marta F.", nomeCivil: "Marta Aparecida Fictícia Lima" };

    test("sem grupo de deputados no Contatos, presente em deputadosAtuais, vira outro_cargo", () => {
      const [r] = classificarGovernadores([e], [], [atual]);
      expect(r).toMatchObject({ destino: "outro_cargo", contatos: [], deputadoAtual: { uf: "GO", nomeParlamentar: "Marta F." } });
    });

    test("sem grupo de deputados e ausente da planilha da Câmara vai para conferir", () => {
      const [r] = classificarGovernadores([e], [], [{ ...atual, nomeCivil: "Outra Pessoa", nomeParlamentar: "Outra" }]);
      expect(r.destino).toBe("conferir");
    });

    test("sem grupo de deputados e sem a lista de atuais vai para conferir com o motivo da planilha não enviada", () => {
      const [r] = classificarGovernadores([e], []);
      expect(r).toMatchObject({ destino: "conferir", motivo: "Planilha de deputados atuais não enviada: conferir se é deputado federal em exercício" });
    });

    test("com dois deputados homônimos na lista vai para conferir com o motivo do homônimo", () => {
      const [r] = classificarGovernadores([e], [], [atual, { ...atual, nomeCivil: "Marta Aparecida Fictícia Lima" }]);
      expect(r).toMatchObject({ destino: "conferir", motivo: "Mais de um deputado em exercício casa este nome: conferir" });
    });

    test("com a lista enviada e a pessoa fora dela mantém o motivo de não estar em exercício", () => {
      const [r] = classificarGovernadores([e], [], []);
      expect(r.motivo).toBe("Planilha diz deputado federal atual, mas a pessoa não está na lista de deputados em exercício");
    });

    test("com grupo Deputados Federais e contato lá fica outro_cargo com o contato", () => {
      const [r] = classificarGovernadores([e], [grupo("Deputados Federais", [marta("Deputados Federais")])]);
      expect(r.destino).toBe("outro_cargo");
      expect(r.contatos[0].grupo).toBe("Deputados Federais");
    });
  });

  test("vice-governador atual vai para conferir com o baseStatus e leva a linha achada em Governadores", () => {
    const e = gov({ statusMandato: "Mandato novo (vice-governador atual)", baseStatus: "Vice assumiu o governo" });
    const [r] = classificarGovernadores([e], [grupo("Governadores", [marta("Governadores")])]);
    expect(r.destino).toBe("conferir");
    expect(r.motivo).toBe("Vice assumiu o governo");
    expect(r.contatos).toHaveLength(1);
  });

  test("governador de outra UF e texto desconhecido vão para conferir como não previsto", () => {
    const r = classificarGovernadores([gov({ statusMandato: "Mandato novo (governador de outra UF)" }), gov({ statusMandato: "Xyz" })], []);
    expect(r.map((x) => x.destino)).toEqual(["conferir", "conferir"]);
    expect(r[0].motivo).toContain("Status do mandato não previsto");
    expect(r[1].motivo).toContain("Status do mandato não previsto");
  });

  test("dois contatos diferentes casando viram conferir ambíguo", () => {
    const outro: ContatoPlanilha = { id: "2", nome: "Marta Fictícia", grupo: "Governadores", cargo: "Governadora do Estado de Goiás" };
    const [r] = classificarGovernadores([gov()], [grupo("Governadores", [marta("Governadores"), outro])]);
    expect(r).toMatchObject({ destino: "conferir", motivo: MOTIVO_AMBIGUO });
  });

  test("grupo Ex-Governadores nunca é candidato", () => {
    const [r] = classificarGovernadores([gov()], [grupo("Ex-Governadores", [marta("Ex-Governadores")])]);
    expect(r.destino).toBe("conferir");
    expect(r.contatos).toEqual([]);
  });
});

describe("UF do contato do governador", () => {
  test("UF só no Departamento ainda vale como guarda", () => {
    const soDepto: ContatoPlanilha = { id: "1", nome: "Marta Fictícia", grupo: "Governadores", departamento: "MINAS GERAIS" };
    const [r] = classificarGovernadores([gov()], [grupo("Governadores", [soDepto])]);
    expect(r.destino).toBe("conferir");
    const mesmo = { ...soDepto, departamento: "GOIÁS" };
    expect(classificarGovernadores([gov()], [grupo("Governadores", [mesmo])])[0].destino).toBe("reeleito");
  });

  test("Departamento vazio e cargo de Goiás casa eleito de GO e não o homônimo de MG", () => {
    const g = [grupo("Governadores", [marta("Governadores", "Governador do Estado de Goiás")])];
    expect(classificarGovernadores([gov()], g)[0].destino).toBe("reeleito");
    expect(classificarGovernadores([gov({ uf: "MG" })], g)[0].destino).toBe("conferir");
  });

  test("sem UF no Departamento nem no Cargo, a UF vem do Órgão", () => {
    const c: ContatoPlanilha = { id: "1", nome: "Marta Fictícia", grupo: "Governadores", cargo: "Governadora", orgao: "Governo do Estado de Minas Gerais" };
    const g = [grupo("Governadores", [c])];
    expect(classificarGovernadores([gov({ uf: "MG" })], g)[0].destino).toBe("reeleito");
    expect(classificarGovernadores([gov()], g)[0].destino).toBe("conferir");
  });

  test("sem UF em lugar nenhum, casa só por nome", () => {
    const c: ContatoPlanilha = { id: "1", nome: "Marta Fictícia", grupo: "Governadores" };
    expect(classificarGovernadores([gov()], [grupo("Governadores", [c])])[0].destino).toBe("reeleito");
  });
});

describe("agruparSegundoTurno", () => {
  test("agrupa por UF em ordem alfabética", () => {
    const linhas = [
      gov({ uf: "SP", nomeUrna: "C", statusMandato: "2º turno" }), gov({ uf: "AC", nomeUrna: "A", statusMandato: "2º turno" }),
      gov({ uf: "SP", nomeUrna: "D", statusMandato: "2º turno" }), gov({ uf: "AC", nomeUrna: "B", partido: "XX", statusMandato: "2º turno" }),
    ];
    const r = agruparSegundoTurno(linhas);
    expect(r.map((x) => x.uf)).toEqual(["AC", "SP"]);
    expect(r.map((x) => x.candidatos.length)).toEqual([2, 2]);
    expect(r[0].candidatos[1]).toEqual({ nomeUrna: "B", partido: "XX", statusMandato: "2º turno" });
  });
});

describe("paraContatoGoverno", () => {
  test("copia só o necessário e omite opcionais ausentes", () => {
    const [x] = classificarGovernadores([gov()], []);
    const c = paraContatoGoverno(x);
    expect(c).toMatchObject({ destino: "conferir", uf: "GO", nomeUrna: "Marta Fictícia", statusMandato: "Reeleição" });
    expect("partido" in c).toBe(false);
  });
});

describe("grupo de destino dos governadores (spec 2026-10-30 §4.3.1)", () => {
  const atual: DeputadoAtual = { uf: "GO", nomeParlamentar: "Marta F.", nomeCivil: "Marta Aparecida Fictícia Lima" };

  test("reeleito vai para Governadores e mandato novo para os governadores eleitos", () => {
    const [reeleito] = classificarGovernadores([gov()], [grupo("Governadores", [marta("Governadores")])]);
    const [novo] = classificarGovernadores([gov({ statusMandato: "Mandato novo" })], []);
    expect(reeleito.grupoDestino).toBe("Governadores");
    expect(novo.grupoDestino).toBe(GRUPO_GOVERNADORES_ELEITOS);
  });

  test("senador ou deputado atual eleito governador fica no grupo da sua Casa", () => {
    const [sen] = classificarGovernadores([gov({ statusMandato: "Mandato novo (atual senador)" })], [grupo("Senadores", [marta("Senadores")])]);
    const [dep] = classificarGovernadores([gov({ statusMandato: "Mandato novo (atual deputado federal)" })], [], [atual]);
    const [depContatos] = classificarGovernadores([gov({ statusMandato: "Mandato novo (atual deputado federal)" })], [grupo("Deputados Federais", [marta("Deputados Federais")])]);
    expect([sen.grupoDestino, dep.grupoDestino, depContatos.grupoDestino]).toEqual(["Senadores", "Deputados Federais", "Deputados Federais"]);
  });

  test("conferir fica sem grupo de destino", () => {
    const [r] = classificarGovernadores([gov()], []);
    expect(r.destino).toBe("conferir");
    expect("grupoDestino" in r).toBe(false);
  });
});

describe("classificarGovernadores: a decisão do GT vence a regra (spec 2026-10-30 §4.1.1)", () => {
  const manual = (over: Partial<RegistroManual>): RegistroManual => ({
    tipo: "mesma_pessoa", data: "2026-10-29", quem: "GT (planilha de 29/10)", observacao: "", validacao: "validado", grupos: [], ...over,
  });
  const vice = gov({ statusMandato: "Mandato novo (vice-governador atual)" });

  test("vice a conferir com mesma pessoa para Governadores fica reeleito em Governadores, já cadastrado", () => {
    // Arrange
    const h = registrar(HISTORICO_VAZIO, "Marta Fictícia", [], manual({ convidaPor: GRUPO_GOVERNADORES, grupos: [GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS] }));
    // Act
    const [semDecisao] = classificarGovernadores([vice], [grupo("Governadores", [marta("Governadores")])]);
    const [r] = classificarGovernadores([vice], [grupo("Governadores", [marta("Governadores")])], undefined, h);
    // Assert
    expect(semDecisao.destino).toBe("conferir");
    expect(r).toMatchObject({ destino: "reeleito", grupoDestino: GRUPO_GOVERNADORES, jaCadastrado: true, motivo: "Decisão do GT de 29/10" });
    expect(r.decisao?.convidaPor).toBe(GRUPO_GOVERNADORES);
  });

  test("mesma pessoa para os governadores eleitos fica novo; a ligação marcada como outra pessoa sai", () => {
    // Arrange: a regra acharia a pessoa em Governadores e mandaria conferir
    const h = registrar(HISTORICO_VAZIO, "Marta Fictícia", [], manual({
      convidaPor: GRUPO_GOVERNADORES_ELEITOS, outraPessoa: [GRUPO_GOVERNADORES], grupos: [GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS],
    }));
    // Act
    const [r] = classificarGovernadores([gov({ statusMandato: "Mandato novo" })], [grupo("Governadores", [marta("Governadores")])], undefined, h);
    // Assert
    expect(r).toMatchObject({ destino: "novo", grupoDestino: GRUPO_GOVERNADORES_ELEITOS, contatos: [] });
    expect(r.jaCadastrado).toBeUndefined();
  });

  test("pessoas diferentes de Governadores × Deputados Federais, sem grupo de eleitos, mantém o reeleito", () => {
    const h = registrar(HISTORICO_VAZIO, "Marta Fictícia", [], manual({ tipo: "pessoas_diferentes", grupos: [GRUPO_GOVERNADORES, "Deputados Federais"] }));
    const [r] = classificarGovernadores([gov()], [grupo("Governadores", [marta("Governadores")])], undefined, h);
    expect(r).toMatchObject({ destino: "reeleito", grupoDestino: GRUPO_GOVERNADORES, jaCadastrado: true });
    expect(r.decisao?.tipo).toBe("pessoas_diferentes");
  });

  test("convite fora do eixo da eleição deixa o governador a conferir", () => {
    const h = registrar(HISTORICO_VAZIO, "Marta Fictícia", [], manual({ convidaPor: "Ministros de Estado", grupos: ["Ministros de Estado", GRUPO_GOVERNADORES] }));
    const [r] = classificarGovernadores([gov()], [grupo("Governadores", [marta("Governadores")])], undefined, h);
    expect(r).toMatchObject({ destino: "conferir", motivo: "Decisão do GT de 29/10: grupo Ministros de Estado fora do eixo da eleição" });
  });

  test("pessoas diferentes reclassifica pela regra sem a ligação com o Contatos", () => {
    const h = registrar(HISTORICO_VAZIO, "Marta Fictícia", [], manual({ tipo: "pessoas_diferentes", grupos: [GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS] }));
    const [r] = classificarGovernadores([gov({ statusMandato: "Mandato novo" })], [grupo("Governadores", [marta("Governadores")])], undefined, h);
    expect(r).toMatchObject({ destino: "novo", grupoDestino: GRUPO_GOVERNADORES_ELEITOS, contatos: [] });
    expect(r.decisao?.tipo).toBe("pessoas_diferentes");
  });
});
