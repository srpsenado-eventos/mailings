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
      // gov.br: o fetch recebe CAPTCHA; o Chrome com janela traz a lista inteira (medido em 2026-10-16).
      { url: "https://www.gov.br/mre/pt-br/assuntos/cerimonial/lista-do-corpo-diplomatico-e-datas-nacionais", ativo: true, navegador: "janela" },
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
      // gov.br: o fetch recebe CAPTCHA; o Chrome com janela traz a lista inteira (medido em 2026-10-16).
      { url: "https://www.gov.br/mre/pt-br/assuntos/cerimonial/lista-do-corpo-diplomatico-e-datas-nacionais", ativo: true, navegador: "janela" },
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
      // gov.br: o fetch recebe CAPTCHA; o Chrome com janela traz a lista inteira (medido em 2026-10-16).
      { url: "https://www.gov.br/mre/pt-br/assuntos/cerimonial/lista-do-corpo-diplomatico-e-datas-nacionais", ativo: true, navegador: "janela" },
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
    // Spec 2026-10-15 §3.2: uma página oficial por UF, transcrita da planilha de conferência
    // do GT (Referencia 2/Conferencia contatos 06_10.xlsx, aba "Sites Governo Estados").
    // Ficam fora, por decisão do Clovis: MT e MG (Diário Oficial), SC (PDF do Diário
    // Oficial), PE (notícia do TSE) e DF (página da vice). Esses cinco saem "cadastrar fonte".
    // MS: a URL tem fragmento "#/QuemEQuem" e a página é montada por JavaScript: o fetch
    // traz só a casca do SPA, e o Chrome headless monta a página com "GOVERNADOR:"
    // (medido em 2026-10-15). Por isso é lida pelo navegador (`navegador: true`).
    // AM, RR e RJ: o fetch falhava ("fetch failed" no AM; RR e RJ só com a casca da página)
    // e o Chrome com janela traz a página inteira (medido em 2026-10-16): `navegador: "janela"`.
    fontesIndividuais: [
      { url: "https://estado.ac.gov.br/orgao-entidades/", ativo: true, chave: { uf: "AC" }, campos: ["nome", "cargo"] },
      { url: "https://amapa.gov.br/gestores", ativo: true, chave: { uf: "AP" }, campos: ["nome", "cargo"] },
      { url: "https://www.transparencia.am.gov.br/estrutura-organizacional/", ativo: true, chave: { uf: "AM" }, campos: ["nome", "cargo"], navegador: "janela" },
      { url: "https://www.pa.gov.br/orgao?id_orgao=2", ativo: true, chave: { uf: "PA" }, campos: ["nome", "cargo"] },
      { url: "https://rondonia.ro.gov.br/?page_id=1207", ativo: true, chave: { uf: "RO" }, campos: ["nome", "cargo"] },
      { url: "https://transparencia.rr.gov.br/principaiscargos", ativo: true, chave: { uf: "RR" }, campos: ["nome", "cargo"], navegador: "janela" },
      { url: "https://www.to.gov.br/governo", ativo: true, chave: { uf: "TO" }, campos: ["nome", "cargo"] },
      { url: "https://alagoas.al.gov.br/governo/governador-de-alagoas", ativo: true, chave: { uf: "AL" }, campos: ["nome", "cargo"] },
      { url: "https://www.ba.gov.br/comunicacao/equipe-de-governo", ativo: true, chave: { uf: "BA" }, campos: ["nome", "cargo"] },
      { url: "https://www.ce.gov.br/o-governo/", ativo: true, chave: { uf: "CE" }, campos: ["nome", "cargo"] },
      { url: "https://egma.ma.gov.br/integrantes-do-governo", ativo: true, chave: { uf: "MA" }, campos: ["nome", "cargo"] },
      { url: "https://paraiba.pb.gov.br/governadoria/governador-1", ativo: true, chave: { uf: "PB" }, campos: ["nome", "cargo"] },
      { url: "https://www.pi.gov.br/governador/", ativo: true, chave: { uf: "PI" }, campos: ["nome", "cargo"] },
      { url: "https://www.rn.gov.br/postagem/governadora/", ativo: true, chave: { uf: "RN" }, campos: ["nome", "cargo"] },
      { url: "https://www.se.gov.br/agencia/governo", ativo: true, chave: { uf: "SE" }, campos: ["nome", "cargo"] },
      { url: "https://goias.gov.br/administracao-direta/", ativo: true, chave: { uf: "GO" }, campos: ["nome", "cargo"] },
      { url: "https://www.transparencia.ms.gov.br/#/QuemEQuem", ativo: true, chave: { uf: "MS" }, campos: ["nome", "cargo"], navegador: true },
      { url: "https://www.es.gov.br/governo/governador", ativo: true, chave: { uf: "ES" }, campos: ["nome", "cargo"] },
      { url: "https://www.rj.gov.br/pagina/sobre-o-governo9806", ativo: true, chave: { uf: "RJ" }, campos: ["nome", "cargo"], navegador: "janela" },
      { url: "https://www.sp.gov.br/sp/institucional/estrutura/!ut/p/z1/04_Sj9CPykssy0xPLMnMz0vMAfIjo8ziDSzMTIyM3Q2MPYyDnQ3MXB3DzJ2NQg0M_Y31wyEKcABHA_0oovTjVhCF3_hw_ShUKwKCg4Am-BpaOvtauhk7-pvhV-DpbAxTgNuSgtzQCINMT0UAo-8oDA!!/", ativo: true, chave: { uf: "SP" }, campos: ["nome", "cargo"] },
      { url: "https://www.parana.pr.gov.br/Pagina/Quemequem", ativo: true, chave: { uf: "PR" }, campos: ["nome", "cargo"] },
      { url: "https://www.estado.rs.gov.br/governadoria", ativo: true, chave: { uf: "RS" }, campos: ["nome", "cargo"] },
    ],
  },
  {
    // Spec 2026-10-15: existe para o casamento exato vencer a contenção e os eleitos de
    // mandato novo não serem ligados às páginas dos governadores atuais.
    nome: "Governadores Eleitos",
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
      // Autorizada pelo Clovis em 2026-09-15 (trocou https://www.gov.br/pt-br/orgaos-do-governo,
      // que lista MINISTÉRIOS sem nomes). Desde o spec 2026-10-15 é só a LISTA DE DENOMINAÇÕES
      // DE CARGO (`casamento: "cargo"`): o nome e a permanência de cada ministro saem da página
      // individual abaixo. A página responde CAPTCHA ao fetch do Node e ao Chrome headless,
      // e vem inteira no Chrome com janela (medido em 2026-10-15): `navegador: "janela"`.
      // Layout cargo numa linha e nome na seguinte, coberto por tests/fixtures/ministros-estado.html.
      { url: "https://www.gov.br/planalto/pt-br/conheca-a-presidencia/ministros-e-ministras", ativo: true, campos: ["cargo"], casamento: "cargo", navegador: "janela" },
    ],
    // Spec 2026-10-15 §3.2: página de cada ministério, transcrita da planilha de conferência
    // do GT (Referencia 2/Conferencia contatos 06_10.xlsx, aba "Sites Governo Estados",
    // colunas F a H). A chave é o nome COMO ESTÁ NO CONTATOS (decisão do Clovis em
    // 2026-10-15: 15 nomes da planilha não casavam com o do Contatos pela régua de igualdade
    // normalizada (em geral a planilha trazia o nome mais longo)). O comentário de cada linha é o cargo da planilha,
    // só para localizar a linha. AGU e CGU cobrem nome E cargo; as demais, só nome.
    fontesIndividuais: [
      // Ministra de Estado da Casa Civil da Presidência da República
      { url: "https://www.gov.br/casacivil/pt-br/composicao/ministra", ativo: true, chave: { nome: "Miriam Belchior" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Secretaria-Geral da Presidência da República
      { url: "https://www.gov.br/secretariageral/pt-br/composicao/ministro", ativo: true, chave: { nome: "Guilherme Boulos" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Secretaria de Relações Institucionais da Presidência da República
      { url: "https://www.gov.br/sri/pt-br/composicao/ministra-1", ativo: true, chave: { nome: "José Guimarães" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Secretaria de Comunicação Social da Presidência da República
      { url: "https://www.gov.br/secom/pt-br/acesso-a-informacao/institucional/quem-e-quem", ativo: true, chave: { nome: "Sidônio Palmeira" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado Chefe do Gabinete de Segurança Institucional da Presidência da República
      { url: "https://www.gov.br/gsi/pt-br/composicao/gabinete/ministro", ativo: true, chave: { nome: "Marcos Antonio Amaro Dos Santos" }, campos: ["nome"], navegador: "janela" },
      // Advogado-Geral da União
      { url: "https://www.gov.br/agu/pt-br/acesso-a-informacao/institucional/quem", ativo: true, chave: { nome: "Jorge Messias" }, campos: ["nome", "cargo"], navegador: "janela" },
      // Ministro da Controladoria-Geral da União
      { url: "https://www.gov.br/cgu/pt-br/composicao/ministro", ativo: true, chave: { nome: "Vinicius de Carvalho" }, campos: ["nome", "cargo"], navegador: "janela" },
      // Ministro de Estado da Agricultura e Pecuária
      { url: "https://www.gov.br/agricultura/pt-br/composicao/ministro-e-staff/andre-carlos-alves-de-paula-filho", ativo: true, chave: { nome: "André de Paula" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado das Cidades
      { url: "https://www.gov.br/cidades/pt-br/composicao/ministro-das-cidades", ativo: true, chave: { nome: "Antonio Vladimir Moura Lima" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado da Ciência, Tecnologia e Inovação
      { url: "https://www.gov.br/mcti/pt-br/acesso-a-informacao/institucional/quem-e-quem", ativo: true, chave: { nome: "Luciana Santos" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado das Comunicações
      { url: "https://www.gov.br/mcom/pt-br/composicao/ministro", ativo: true, chave: { nome: "Frederico de Siqueira Filho" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado da Cultura
      { url: "https://www.gov.br/cultura/pt-br/composicao/gabinete-da-ministra", ativo: true, chave: { nome: "Margareth Menezes" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Defesa
      { url: "https://www.gov.br/defesa/pt-br/composicao/quem-e-quem", ativo: true, chave: { nome: "José Mucio" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado do Desenvolvimento Agrário e Agricultura Familiar
      { url: "https://www.gov.br/mda/pt-br/acesso-a-informacao/institucional/quem-e-quem/gabinete-da-ministra", ativo: true, chave: { nome: "Fernanda Machiaveli" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Desenvolvimento e Assistência Social, Família e Combate à Fome
      { url: "https://www.gov.br/mds/pt-br/composicao/ministro", ativo: true, chave: { nome: "Wellington Dias" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Desenvolvimento, Indústria, Comércio e Serviços
      { url: "https://www.gov.br/mdic/pt-br/composicao/ministro/marcio-fernando-elias-rosa", ativo: true, chave: { nome: "Márcio Elias Rosa" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado dos Direitos Humanos e da Cidadania
      { url: "https://www.gov.br/mdh/pt-br/composicao/quem-e-quem", ativo: true, chave: { nome: "JANINE MELLO DOS SANTOS" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Educação
      { url: "https://www.gov.br/mec/pt-br/composicao/gabinete-do-ministro/leonardo-osvaldo-barchini-rosa", ativo: true, chave: { nome: "Leonardo Barchini" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Empreendedorismo, da Microempresa e da Empresa de Pequeno Porte
      { url: "https://www.gov.br/memp/pt-br/composicao/ministro/marcio-franca?activeAccordion=accordion-panel-1", ativo: true, chave: { nome: "Paulo Henrique Pereira" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Esporte
      { url: "https://www.gov.br/esporte/pt-br/composicao/Gabinete-do-Ministro/paulo-henrique-perna-cordeiro", ativo: true, chave: { nome: "Paulo Henrique Perna Cordeiro" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Fazenda
      { url: "https://www.gov.br/fazenda/pt-br/composicao/ministro/dario-carnevalli-durigan", ativo: true, chave: { nome: "Dario Carnevalli Durigan" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado da Gestão e da Inovação em Serviços Públicos
      { url: "https://www.gov.br/gestao/pt-br/composicao/quem-e-quem/ministra-e-orgaos-de-assistencia-direta", ativo: true, chave: { nome: "Esther Dweck" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado da Igualdade Racial
      { url: "https://www.gov.br/igualdaderacial/pt-br/composicao/quem-e-quem", ativo: true, chave: { nome: "Rachel Barros" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Integração e do Desenvolvimento Regional
      { url: "https://www.gov.br/mdr/pt-br/composicao/ministro-e-secretarios", ativo: true, chave: { nome: "Antônio Waldez Góes da Silva" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Justiça e Segurança Pública
      { url: "https://www.gov.br/mj/pt-br/acesso-a-informacao/institucional/sumario/quemequem/gabinete-do-ministro-1", ativo: true, chave: { nome: "Wellington César Lima e Silva" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Meio Ambiente e Mudança do Clima
      { url: "https://www.gov.br/mma/pt-br/composicao/gm/quem-e-quem", ativo: true, chave: { nome: "João Paulo Ribeiro Capobianco" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado de Minas e Energia
      { url: "https://www.gov.br/mme/pt-br/composicao/gabinete-do-ministro/alexandre-silveira", ativo: true, chave: { nome: "Alexandre Silveira de Oliveira" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado das Mulheres
      { url: "https://www.gov.br/mulheres/pt-br/composicao/ministra/marcia-lopes", ativo: true, chave: { nome: "Márcia Helena Carvalho Lopes" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Pesca e Aquicultura
      { url: "https://www.gov.br/mpa/pt-br/acesso-a-informacao/institucional/quem-e-quem-3/gabinete-do-ministro/ministro", ativo: true, chave: { nome: "Rivetla Edipo Araujo Cruz" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Planejamento e Orçamento (o endereço ainda traz o nome da titular
      // anterior, mas a página já mostra o titular atual, conferido em 2026-10-15)
      { url: "https://www.gov.br/planejamento/pt-br/composicao/gabinete-do-ministro/simone-nassar-tebet", ativo: true, chave: { nome: "Bruno Moretti" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado de Portos e Aeroportos
      { url: "https://www.gov.br/portos-e-aeroportos/pt-br/composicao/autoridades-1/tome-monteiro-da-franca?activeAccordion=accordion-panel-1", ativo: true, chave: { nome: "Tomé Monteiro da Franca" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado dos Povos Indígenas
      { url: "https://www.gov.br/povosindigenas/pt-br/composicao/ministro-e-orgaos-de-assistencia-direta/ministro", ativo: true, chave: { nome: "Luiz Henrique Eloy Amado" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Previdência Social
      { url: "https://www.gov.br/previdencia/pt-br/composicao/ministro-e-secretarios", ativo: true, chave: { nome: "Wolney Queiroz" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado das Relações Exteriores
      { url: "https://www.gov.br/mre/pt-br/composicao/gabinete-do-ministro-das-relacoes-exteriores/embaixador-mauro-luiz-iecker-vieira", ativo: true, chave: { nome: "Embaixador Mauro Vieira" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Saúde
      { url: "https://www.gov.br/saude/pt-br/composicao/ministro", ativo: true, chave: { nome: "Alexandre Rocha Santos Padilha" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Trabalho e Emprego
      { url: "https://www.gov.br/trabalho-e-emprego/pt-br/composicao/quem-e-quem", ativo: true, chave: { nome: "Luiz Marinho" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado dos Transportes
      { url: "https://www.gov.br/transportes/pt-br/composicao/quem-e-quem", ativo: true, chave: { nome: "GEORGE SANTORO" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Turismo
      { url: "https://www.gov.br/turismo/pt-br/composicao/gabinete-do-ministro/gustavo-costa-feliciano?activeAccordion=", ativo: true, chave: { nome: "Gustavo Costa Feliciano" }, campos: ["nome"], navegador: "janela" },
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
      // Página em JavaScript: o fetch recebe o esqueleto vazio. Lida pelo navegador
      // (spec 2026-10-02, §5); a Camada 2 deixa de ser a única composição do grupo.
      { url: "https://portal.tcu.gov.br/autoridades", ativo: true, navegador: true },
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
      // 2026-10-20: a antiga `/en/ministros` passou a responder HTTP 404 (medido em 19/10); a
      // página em português responde 200 com a lista (título "Ministros - TST").
      { url: "https://www.tst.jus.br/ministros", ativo: true },
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
