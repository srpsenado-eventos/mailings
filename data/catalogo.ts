// Catálogo de grupos e fontes oficiais — FONTE DA VERDADE da aplicação.
//
// Gerado uma única vez por scripts/gerar-catalogo.mjs a partir de data/apply-all.sql,
// na migração que removeu o Supabase. A partir daqui, EDITE ESTE ARQUIVO À MÃO:
// cadastrar uma URL nova é acrescentar uma entrada em `fontes` e commitar.
//
// A primeira fonte com `ativo: true` é a primária do grupo — a ordem importa.
// Ver docs/superpowers/specs/2026-08-13-catalogo-em-arquivo-sem-banco.md
import type { GrupoCatalogo } from "@/lib/types";

export const CATALOGO: readonly GrupoCatalogo[] = [
  {
    nome: "Assessorias Parlamentares",
    responsavel1: "Beatriz da Conceição Silveira",
    responsavel2: "Fernanda Carolina Gonçalves Silva",
    backup: "Thiago Sabino",
    emailResp1: "beatriz.silveira@senado.leg.br",
    emailResp2: "fernanda.goncalves@senado.leg.br",
    emailBackup: "thiago.pinto@senado.leg.br",
    fontes: [],
  },
  {
    nome: "Conselho Comunicação Social Congresso Nacional",
    responsavel1: "Beatriz da Conceição Silveira",
    responsavel2: "Fernanda Carolina Gonçalves Silva",
    backup: "Thiago Sabino",
    emailResp1: "beatriz.silveira@senado.leg.br",
    emailResp2: "fernanda.goncalves@senado.leg.br",
    emailBackup: "thiago.pinto@senado.leg.br",
    fontes: [
      { url: "https://legis.senado.leg.br/atividade/comissoes/comissao/767/composicao", ativo: true },
    ],
  },
  {
    nome: "Conselho de Supervisão do SIS",
    responsavel1: "Cynara Putencio da Silva",
    responsavel2: "Beatriz da Conceição Silveira",
    backup: "Ramena Guerrieri Schleier Romero",
    emailResp1: "cynaraps@senado.leg.br",
    emailResp2: "beatriz.silveira@senado.leg.br",
    emailBackup: "ramena.schleier@senado.leg.br",
    fontes: [
      { url: "https://intranet.senado.leg.br/saude/gestao/composicao-do-conselho", ativo: true },
    ],
  },
  {
    nome: "Conselho Editorial do Senado Federal",
    responsavel1: "Fernanda Carolina Gonçalves Silva",
    responsavel2: "Adriana da Conceição Santos",
    backup: "Thassia Delphino de Lima",
    emailResp1: "fernanda.goncalves@senado.leg.br",
    emailResp2: "adriana.conceicao.santos@senado.leg.br",
    emailBackup: "thassia.lima@senado.leg.br",
    fontes: [],
  },
  {
    nome: "Conselho Nacional de Justiça (CNJ)",
    responsavel1: "Cleria Juliana Alves Pires Rosa",
    responsavel2: "Maria Ines Nepomuceno",
    backup: "Beatriz da Conceição Silveira",
    emailResp1: "cleria.rosa@senado.leg.br",
    emailResp2: "MARIAINE@senado.leg.br",
    emailBackup: "beatriz.silveira@senado.leg.br",
    fontes: [
      { url: "https://www.cnj.jus.br/composicao-atual/", ativo: true },
    ],
  },
  {
    nome: "Conselho Nacional do Ministério Público (CNMP)",
    responsavel1: "Cynara Putencio da Silva",
    responsavel2: "Beatriz da Conceição Silveira",
    backup: "Ramena Guerrieri Schleier Romero",
    emailResp1: "cynaraps@senado.leg.br",
    emailResp2: "beatriz.silveira@senado.leg.br",
    emailBackup: "ramena.schleier@senado.leg.br",
    fontes: [],
  },
  {
    nome: "Comandantes das Forças Armadas e EMCFA",
    responsavel1: "Cleria Juliana Alves Pires Rosa",
    responsavel2: "Maria Ines Nepomuceno",
    backup: "Beatriz da Conceição Silveira",
    emailResp1: "cleria.rosa@senado.leg.br",
    emailResp2: "MARIAINE@senado.leg.br",
    emailBackup: "beatriz.silveira@senado.leg.br",
    fontes: [],
  },
  {
    nome: "Defensor Público Geral da União",
    responsavel1: "Daniela Gonzaga Coelho",
    responsavel2: "Ramena Guerrieri Schleier Romero",
    backup: "Adriana da Conceição Santos",
    emailResp1: "daniela.gonzaga@senado.leg.br",
    emailResp2: "ramena.schleier@senado.leg.br",
    emailBackup: "adriana.conceicao.santos@senado.leg.br",
    fontes: [
      { url: "https://quem-e-quem.dpu.def.br/", ativo: true },
    ],
  },
  {
    nome: "Diretor-Geral e Secretário Geral da Mesa do Senado Federal",
    responsavel1: "Cynara Putencio da Silva",
    responsavel2: "Beatriz da Conceição Silveira",
    backup: "Ramena Guerrieri Schleier Romero",
    emailResp1: "cynaraps@senado.leg.br",
    emailResp2: "beatriz.silveira@senado.leg.br",
    emailBackup: "ramena.schleier@senado.leg.br",
    fontes: [],
  },
  {
    nome: "Embaixadores ( África do Sul até EUA)",
    responsavel1: "Agatha Marcondes Viana de Assis",
    responsavel2: "Thiago Sabino",
    backup: "Sarah Rachel Vieira Caldeira da Costa",
    emailResp1: "agatha.assis@senado.leg.br",
    emailResp2: "thiago.pinto@senado.leg.br",
    emailBackup: "sarah.costa@senado.leg.br",
    fontes: [
      { url: "https://www.gov.br/mre/pt-br/assuntos/cerimonial/lista-do-corpo-diplomatico-e-datas-nacionais", ativo: true },
    ],
  },
  {
    nome: "Embaixadores (Filipinas até Noruega)",
    responsavel1: "Adriana da Conceição Santos",
    responsavel2: "Beatriz Zama",
    backup: "Jaciara Brito dos Santos",
    emailResp1: "adriana.conceicao.santos@senado.leg.br",
    emailResp2: "beatriz.zama@senado.leg.br",
    emailBackup: "jaciara.santos@senado.leg.br",
    fontes: [
      { url: "https://www.gov.br/mre/pt-br/assuntos/cerimonial/lista-do-corpo-diplomatico-e-datas-nacionais", ativo: true },
    ],
  },
  {
    nome: "Embaixadores (Nova Zelândia até Zimbábue)",
    responsavel1: "Beatriz Zama",
    responsavel2: "Cynara Putencio da Silva",
    backup: "Fernanda Carolina Gonçalves Silva",
    emailResp1: "beatriz.zama@senado.leg.br",
    emailResp2: "cynaraps@senado.leg.br",
    emailBackup: "fernanda.goncalves@senado.leg.br",
    fontes: [
      { url: "https://www.gov.br/mre/pt-br/assuntos/cerimonial/lista-do-corpo-diplomatico-e-datas-nacionais", ativo: true },
    ],
  },
  {
    nome: "Ex-Presidentes da República",
    responsavel1: "Fernanda Carolina Gonçalves Silva",
    responsavel2: "Adriana da Conceição Santos",
    backup: "Thassia Delphino de Lima",
    emailResp1: "fernanda.goncalves@senado.leg.br",
    emailResp2: "adriana.conceicao.santos@senado.leg.br",
    emailBackup: "thassia.lima@senado.leg.br",
    fontes: [],
  },
  {
    nome: "Ex-Presidentes do Senado",
    responsavel1: "Cleria Juliana Alves Pires Rosa",
    responsavel2: "Maria Ines Nepomuceno",
    backup: "Beatriz da Conceição Silveira",
    emailResp1: "cleria.rosa@senado.leg.br",
    emailResp2: "MARIAINE@senado.leg.br",
    emailBackup: "beatriz.silveira@senado.leg.br",
    fontes: [],
  },
  {
    nome: "Ex-Senadores",
    responsavel1: "Fernanda Carolina Gonçalves Silva",
    responsavel2: "Adriana da Conceição Santos",
    backup: "Thassia Delphino de Lima",
    emailResp1: "fernanda.goncalves@senado.leg.br",
    emailResp2: "adriana.conceicao.santos@senado.leg.br",
    emailBackup: "thassia.lima@senado.leg.br",
    fontes: [],
  },
  {
    nome: "Governadores",
    responsavel1: "Marcus Vinicius",
    responsavel2: "Thassia Delphino de Lima",
    backup: "Daniela Gonzaga Coelho",
    emailResp1: "marcus.sousa@senado.leg.br",
    emailResp2: "thassia.lima@senado.leg.br",
    emailBackup: "daniela.gonzaga@senado.leg.br",
    fontes: [],
  },
  {
    nome: "Ministros de Estado",
    responsavel1: "Sarah Rachel Vieira Caldeira da Costa",
    responsavel2: "Agatha Marcondes Viana de Assis",
    backup: "Thiago Sabino",
    emailResp1: "sarah.costa@senado.leg.br",
    emailResp2: "agatha.assis@senado.leg.br",
    emailBackup: "thiago.pinto@senado.leg.br",
    fontes: [
      // Autorizada pelo Clovis em 2026-09-15, em troca de
      // https://www.gov.br/pt-br/orgaos-do-governo, que lista MINISTÉRIOS e nunca teve
      // os nomes: as 35 pastas passavam por composição real e os 38 ministros da
      // planilha saíam todos como "possível saída".
      //
      // O caminho /planalto/ responde desafio antibot ao fetch do Node (HTTP 200 com
      // CAPTCHA), embora o curl receba a página inteira do mesmo IP no mesmo minuto —
      // impressão digital de cliente, como o Itamaraty. Até o Chromium da varredura
      // entrar, o grupo sai "indeterminado / verificar à mão", que é o veredito
      // honesto; o falso "possível saída" acabou. A página traz cargo numa linha e
      // nome na seguinte, ordem coberta por tests/fixtures/ministros-estado.html.
      { url: "https://www.gov.br/planalto/pt-br/conheca-a-presidencia/ministros-e-ministras", ativo: true },
    ],
  },
  {
    nome: "Ministros do STF",
    responsavel1: "Ramena Guerrieri Schleier Romero",
    responsavel2: "Daniela Gonzaga Coelho",
    backup: "Maria Ines Nepomuceno",
    emailResp1: "ramena.schleier@senado.leg.br",
    emailResp2: "daniela.gonzaga@senado.leg.br",
    emailBackup: "MARIAINE@senado.leg.br",
    fontes: [
      { url: "https://portal.stf.jus.br/textos/verTexto.asp?servico=bibliotecaConsultaProdutoBibliotecaPastaMinistro&pagina=ComposicaoAtual", ativo: true },
    ],
  },
  {
    nome: "Ministros do STJ",
    responsavel1: "Maria Ines Nepomuceno",
    responsavel2: "Cleria Juliana Alves Pires Rosa",
    backup: "Andréia Andriele Meireles",
    emailResp1: "MARIAINE@senado.leg.br",
    emailResp2: "cleria.rosa@senado.leg.br",
    emailBackup: "andriele@senado.leg.br",
    fontes: [
      { url: "https://www.stj.jus.br/web/verMinistrosSTJ?parametro=1", ativo: true },
    ],
  },
  {
    nome: "Ministros do STM",
    responsavel1: "Daniela Gonzaga Coelho",
    responsavel2: "Ramena Guerrieri Schleier Romero",
    backup: "Adriana da Conceição Santos",
    emailResp1: "daniela.gonzaga@senado.leg.br",
    emailResp2: "ramena.schleier@senado.leg.br",
    emailBackup: "adriana.conceicao.santos@senado.leg.br",
    fontes: [
      { url: "https://www.stm.jus.br/institucional/conheca-o-superior-tribunal-militar/composicao-da-corte?view=default", ativo: true },
    ],
  },
  {
    nome: "Ministros do TCU",
    responsavel1: "Priscilla Flores da Silva",
    responsavel2: "Andréia Andriele Meireles",
    backup: "Cleria Juliana Alves Pires Rosa",
    emailResp1: "priscifs@senado.leg.br",
    emailResp2: "andriele@senado.leg.br",
    emailBackup: "cleria.rosa@senado.leg.br",
    fontes: [
      { url: "https://portal.tcu.gov.br/autoridades", ativo: true },
    ],
  },
  {
    nome: "Ministros do TSE",
    responsavel1: "Ramena Guerrieri Schleier Romero",
    responsavel2: "Daniela Gonzaga Coelho",
    backup: "Maria Ines Nepomuceno",
    emailResp1: "ramena.schleier@senado.leg.br",
    emailResp2: "daniela.gonzaga@senado.leg.br",
    emailBackup: "MARIAINE@senado.leg.br",
    fontes: [
      { url: "https://www.tse.jus.br/institucional/ministros/apresentacao", ativo: true },
    ],
  },
  {
    nome: "Ministros do TST",
    responsavel1: "Priscilla Flores da Silva",
    responsavel2: "Andréia Andriele Meireles",
    backup: "Cleria Juliana Alves Pires Rosa",
    emailResp1: "priscifs@senado.leg.br",
    emailResp2: "andriele@senado.leg.br",
    emailBackup: "cleria.rosa@senado.leg.br",
    fontes: [
      { url: "https://www.tst.jus.br/en/ministros", ativo: true },
    ],
  },
  {
    nome: "Presidente da Câmara dos Deputados",
    responsavel1: "Beatriz da Conceição Silveira",
    responsavel2: "Fernanda Carolina Gonçalves Silva",
    backup: "Thiago Sabino",
    emailResp1: "beatriz.silveira@senado.leg.br",
    emailResp2: "fernanda.goncalves@senado.leg.br",
    emailBackup: "thiago.pinto@senado.leg.br",
    fontes: [
      { url: "https://www.camara.leg.br/deputados/mesa-diretora", ativo: true },
    ],
  },
  {
    nome: "Presidente do Senado",
    responsavel1: "Fernanda Carolina Gonçalves Silva",
    responsavel2: "Adriana da Conceição Santos",
    backup: "Thassia Delphino de Lima",
    emailResp1: "fernanda.goncalves@senado.leg.br",
    emailResp2: "adriana.conceicao.santos@senado.leg.br",
    emailBackup: "thassia.lima@senado.leg.br",
    fontes: [
      { url: "https://www25.senado.leg.br/web/senadores/em-exercicio", ativo: true },
    ],
  },
  {
    nome: "Presidente da OAB Nacional",
    responsavel1: "Cynara Putencio da Silva",
    responsavel2: "Beatriz da Conceição Silveira",
    backup: "Ramena Guerrieri Schleier Romero",
    emailResp1: "cynaraps@senado.leg.br",
    emailResp2: "beatriz.silveira@senado.leg.br",
    emailBackup: "ramena.schleier@senado.leg.br",
    fontes: [
      { url: "https://www.conjur.com.br/2009-nov-29/veja-lista-presidentes-conselheiros-eleitos-dirigir-oab/", ativo: true },
    ],
  },
  {
    nome: "Presidente da República",
    responsavel1: "Beatriz da Conceição Silveira",
    responsavel2: "Fernanda Carolina Gonçalves Silva",
    backup: "Thiago Sabino",
    emailResp1: "beatriz.silveira@senado.leg.br",
    emailResp2: "fernanda.goncalves@senado.leg.br",
    emailBackup: "thiago.pinto@senado.leg.br",
    fontes: [],
  },
  {
    nome: "Presidentes das Assembleias Legislativas das UFs",
    responsavel1: "Adriana Araújo",
    responsavel2: "Jaciara Brito dos Santos",
    backup: "Cynara Putencio da Silva",
    emailResp1: "adriana.araujo@senado.leg.br",
    emailResp2: "jaciara.santos@senado.leg.br",
    emailBackup: "cynaraps@senado.leg.br",
    fontes: [],
  },
  {
    nome: "Procurador-Geral da República",
    responsavel1: "Daniela Gonzaga Coelho",
    responsavel2: "Ramena Guerrieri Schleier Romero",
    backup: "Adriana da Conceição Santos",
    emailResp1: "daniela.gonzaga@senado.leg.br",
    emailResp2: "ramena.schleier@senado.leg.br",
    emailBackup: "adriana.conceicao.santos@senado.leg.br",
    fontes: [],
  },
  {
    nome: "Senadores (Acre a Goiás)",
    responsavel1: "Thassia Delphino de Lima",
    responsavel2: "Marcus Vinicius",
    backup: "Priscilla Flores da Silva",
    emailResp1: "thassia.lima@senado.leg.br",
    emailResp2: "marcus.sousa@senado.leg.br",
    emailBackup: "priscifs@senado.leg.br",
    ufs: ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO"],
    fontes: [
      {
        url: "https://www25.senado.leg.br/web/senadores/em-exercicio",
        ativo: true,
        // Tabela de 6 colunas, seções por UF. Extração estruturada porque o caminho de
        // texto perde os senadores de nome de uma palavra (Weverton, Cleitinho, Romário,
        // Giordano, Irajá). Não propõe inclusão: a lista traz também suplente convocado,
        // que o GT não convida (e-mail de 2026-07-20).
        tabela: { colunas: { nome: 0, uf: 2 } },
      },
      {
        url: "https://www25.senado.leg.br/web/senadores/fora-de-exercicio",
        ativo: true,
        rotulo: "fora de exercício",
        propoeInclusao: true,
        // Só os titulares afastados. Ficam de fora "Suplentes que exerceram o cargo" e a
        // 2ª tabela (falecimento, perda de mandato, renúncia): não são senadores em
        // mandato. Ver docs/superpowers/specs/2026-09-24-segunda-fonte-senadores-fora-de-exercicio.md
        tabela: {
          colunas: { nome: 0, uf: 2, motivo: 3 },
          secoes: ["Assunção de cargo", "Licença com convocação de suplente"],
        },
      },
    ],
  },
  {
    nome: "Senadores (Maranhão ao Piauí)",
    responsavel1: "Thiago Sabino Alves Pinto",
    responsavel2: "Sarah Rachel Vieira Caldeira da Costa",
    backup: "Adriana Araújo",
    emailResp1: "thiago.pinto@senado.leg.br",
    emailResp2: "sarah.costa@senado.leg.br",
    emailBackup: "adriana.araujo@senado.leg.br",
    ufs: ["MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI"],
    fontes: [
      {
        url: "https://www25.senado.leg.br/web/senadores/em-exercicio",
        ativo: true,
        // Tabela de 6 colunas, seções por UF. Extração estruturada porque o caminho de
        // texto perde os senadores de nome de uma palavra (Weverton, Cleitinho, Romário,
        // Giordano, Irajá). Não propõe inclusão: a lista traz também suplente convocado,
        // que o GT não convida (e-mail de 2026-07-20).
        tabela: { colunas: { nome: 0, uf: 2 } },
      },
      {
        url: "https://www25.senado.leg.br/web/senadores/fora-de-exercicio",
        ativo: true,
        rotulo: "fora de exercício",
        propoeInclusao: true,
        // Só os titulares afastados. Ficam de fora "Suplentes que exerceram o cargo" e a
        // 2ª tabela (falecimento, perda de mandato, renúncia): não são senadores em
        // mandato. Ver docs/superpowers/specs/2026-09-24-segunda-fonte-senadores-fora-de-exercicio.md
        tabela: {
          colunas: { nome: 0, uf: 2, motivo: 3 },
          secoes: ["Assunção de cargo", "Licença com convocação de suplente"],
        },
      },
    ],
  },
  {
    nome: "Senadores (Rio a Tocantins)",
    responsavel1: "Jaciara Brito dos Santos",
    responsavel2: "Adriana Araújo",
    backup: "Marcus Vinicius",
    emailResp1: "jaciara.santos@senado.leg.br",
    emailResp2: "adriana.araujo@senado.leg.br",
    emailBackup: "marcus.sousa@senado.leg.br",
    ufs: ["RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"],
    fontes: [
      {
        url: "https://www25.senado.leg.br/web/senadores/em-exercicio",
        ativo: true,
        // Tabela de 6 colunas, seções por UF. Extração estruturada porque o caminho de
        // texto perde os senadores de nome de uma palavra (Weverton, Cleitinho, Romário,
        // Giordano, Irajá). Não propõe inclusão: a lista traz também suplente convocado,
        // que o GT não convida (e-mail de 2026-07-20).
        tabela: { colunas: { nome: 0, uf: 2 } },
      },
      {
        url: "https://www25.senado.leg.br/web/senadores/fora-de-exercicio",
        ativo: true,
        rotulo: "fora de exercício",
        propoeInclusao: true,
        // Só os titulares afastados. Ficam de fora "Suplentes que exerceram o cargo" e a
        // 2ª tabela (falecimento, perda de mandato, renúncia): não são senadores em
        // mandato. Ver docs/superpowers/specs/2026-09-24-segunda-fonte-senadores-fora-de-exercicio.md
        tabela: {
          colunas: { nome: 0, uf: 2, motivo: 3 },
          secoes: ["Assunção de cargo", "Licença com convocação de suplente"],
        },
      },
    ],
  },
  {
    nome: "Vice-Presidente da República",
    responsavel1: "Beatriz da Conceição Silveira",
    responsavel2: "Fernanda Carolina Gonçalves Silva",
    backup: "Thiago Sabino",
    emailResp1: "beatriz.silveira@senado.leg.br",
    emailResp2: "fernanda.goncalves@senado.leg.br",
    emailBackup: "thiago.pinto@senado.leg.br",
    fontes: [
      { url: "https://www.gov.br/planalto/pt-br/vice-presidencia/acesso-a-informacao/institucional/biografia-do-vice-presidente-da-republica-1", ativo: true },
    ],
  },
];
