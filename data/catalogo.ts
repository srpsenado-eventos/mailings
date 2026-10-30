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
    // Sem fonte. Candidata da planilha de 23/10: https://biblioteca2.presidencia.gov.br/acervo/
    // (respondeu vazio em 23/10); cadastrar só quando responder e a página for conferida.
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
    fontes: [
      // Planilha de 23/10, conferida com fetch em 23/10 (200, lista de 26 itens, sem cargo).
      // Garibaldi: o Contatos prevalece sobre o nome da página (spec 2026-10-23 §4.2).
      { url: "https://www25.senado.leg.br/web/senadores/nova-republica", ativo: true, nomesDoContatos: ["Garibaldi Alves Filho"] },
    ],
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
    // Planilha de 23/10 (spec 2026-10-23 §5): PE e DF entram por notícia de órgão oficial, só
    // como `provisoria: "noticia"` (até a posse de 2027), conferidas com fetch em 23/10. MT, MG e SC
    // continuam sem individual (conferência manual pelo Diário Oficial: IOMAT, Jornal Minas
    // Gerais, DOE/SC) e saem "cadastrar fonte". RO, TO e ES mantêm a URL atual, a rever após 25/10.
    // MS: a URL tem fragmento "#/QuemEQuem" e a página é montada por JavaScript: o fetch
    // traz só a casca do SPA, e o Chrome headless monta a página com "GOVERNADOR:"
    // (medido em 2026-10-15). Por isso é lida pelo navegador (`navegador: true`).
    // AM, RR e RJ: o fetch falhava ("fetch failed" no AM; RR e RJ só com a casca da página)
    // e o Chrome com janela traz a página inteira (medido em 2026-10-16): `navegador: "janela"`.
    // AC (2026-10-26, fornecida pelo Clovis): a página institucional da governadora na agência
    // oficial do Acre passa a primária (fetch 200, nome e "governadora" no texto); a antiga
    // `orgao-entidades`, que vinha sem conteúdo legível, fica como alternativa.
    // DF: o portal df.gov.br (fornecido em 26/10) não traz o nome da governadora no texto e
    // geraria possível saída falsa; fica a notícia da CLDF.
    fontesIndividuais: [
      { url: "https://agencia.ac.gov.br/governadora/", ativo: true, urlAlternativa: "https://estado.ac.gov.br/orgao-entidades/", chave: { uf: "AC" }, campos: ["nome", "cargo"] },
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
      // Provisória (notícia do TSE), planilha de 23/10.
      { url: "https://www.tse.jus.br/comunicacao/noticias/2026/Outubro/raquel-lyra-psd-e-reeleita-governadora-de-pernambuco", ativo: true, chave: { uf: "PE" }, campos: ["nome", "cargo"], provisoria: "noticia" },
      { url: "https://www.pi.gov.br/governador/", ativo: true, chave: { uf: "PI" }, campos: ["nome", "cargo"] },
      { url: "https://www.rn.gov.br/postagem/governadora/", ativo: true, chave: { uf: "RN" }, campos: ["nome", "cargo"] },
      { url: "https://www.se.gov.br/agencia/governo", ativo: true, chave: { uf: "SE" }, campos: ["nome", "cargo"] },
      { url: "https://goias.gov.br/administracao-direta/", ativo: true, chave: { uf: "GO" }, campos: ["nome", "cargo"] },
      // Provisória (notícia da Câmara Legislativa do DF), planilha de 23/10.
      { url: "https://www.cl.df.gov.br/-/celina-leao-toma-posse-como-governadora-do-distrito-federal", ativo: true, chave: { uf: "DF" }, campos: ["nome", "cargo"], provisoria: "noticia" },
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
    // Nota de 2026-10-30 (spec 2026-10-30 §4.6): o rótulo da Posse no Contatos,
    // "Governadores eleitos - Posse Presidencial 2027", é do modo `lista` do agrupador
    // (`data/grupos-posse.ts`), que `lib/analise.ts` decide antes de resolver o catálogo; esta
    // entrada não é mais alcançada por ele, e as fontes de campanha abaixo não são lidas para
    // esse grupo. Ficam só para um rótulo antigo que case "Governadores Eleitos" fora do agrupador.
    nome: "Governadores Eleitos",
    fontes: [],
    // Spec 2026-10-26: os eleitos de mandato novo no 2º turno (ES, RN e TO) não têm página
    // oficial até a posse. Sites de campanha fornecidos pelo Clovis em 26/10, conferidos com
    // fetch em 26/10 (200, nome do eleito no texto). Única exceção de domínio não oficial do
    // catálogo: só aqui, `provisoria: "campanha"`, só o nome (o site não diz o cargo de eleito)
    // e `validaAte` no dia anterior à posse dos governadores (6/1/2027, EC 111/2021).
    fontesIndividuais: [
      { url: "https://lorenzopazolini10.com.br/", ativo: true, chave: { uf: "ES" }, campos: ["nome"], provisoria: "campanha", validaAte: "2027-01-05" },
      { url: "https://cadudelula.com.br/", ativo: true, chave: { uf: "RN" }, campos: ["nome"], provisoria: "campanha", validaAte: "2027-01-05" },
      { url: "https://vicentinho45.com.br/", ativo: true, chave: { uf: "TO" }, campos: ["nome"], provisoria: "campanha", validaAte: "2027-01-05" },
    ],
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
    // `urlAlternativa` (planilha de 23/10, as cinco responderam 200 em 23/10): Casa Civil,
    // Secom, Cultura, Defesa e Igualdade Racial. Só é lida quando a principal falha
    // (spec 2026-10-23 §3.3). Em 2026-10-26, a pedido do Clovis, Casa Civil, Cultura, Defesa e
    // Igualdade Racial passaram a ler primeiro o link principal da planilha de 23/10; a URL
    // antiga, que confirmou o nome em 20/10, virou a alternativa.
    fontesIndividuais: [
      // Ministra de Estado da Casa Civil da Presidência da República
      { url: "https://www.gov.br/casacivil/pt-br/composicao/gabinete-do-ministro/quem-e-quem-1", ativo: true, urlAlternativa: "https://www.gov.br/casacivil/pt-br/composicao/ministra", chave: { nome: "Miriam Belchior" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Secretaria-Geral da Presidência da República
      { url: "https://www.gov.br/secretariageral/pt-br/composicao/ministro", ativo: true, chave: { nome: "Guilherme Castro Boulos" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Secretaria de Relações Institucionais da Presidência da República
      { url: "https://www.gov.br/sri/pt-br/composicao/ministra-1", ativo: true, chave: { nome: "José Nobre Guimarães" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Secretaria de Comunicação Social da Presidência da República
      { url: "https://www.gov.br/secom/pt-br/acesso-a-informacao/institucional/quem-e-quem", ativo: true, urlAlternativa: "https://www.gov.br/secom/pt-br/composicao/ministro-e-assistencia-direta/sidonio-cardoso-palmeira", chave: { nome: "Sidônio Cardoso Palmeira" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado Chefe do Gabinete de Segurança Institucional da Presidência da República
      { url: "https://www.gov.br/gsi/pt-br/composicao/gabinete/ministro", ativo: true, chave: { nome: "Marcos Antonio Amaro Dos Santos" }, campos: ["nome"], navegador: "janela" },
      // Advogado-Geral da União
      { url: "https://www.gov.br/agu/pt-br/acesso-a-informacao/institucional/quem", ativo: true, chave: { nome: "Jorge Messias" }, campos: ["nome", "cargo"], navegador: "janela" },
      // Ministro da Controladoria-Geral da União
      { url: "https://www.gov.br/cgu/pt-br/composicao/ministro", ativo: true, chave: { nome: "Vinicius Marques de Carvalho" }, campos: ["nome", "cargo"], navegador: "janela" },
      // Ministro de Estado da Agricultura e Pecuária
      { url: "https://www.gov.br/agricultura/pt-br/composicao/ministro-e-staff/andre-carlos-alves-de-paula-filho", ativo: true, chave: { nome: "André Carlos Alves de Paula Filho" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado das Cidades
      { url: "https://www.gov.br/cidades/pt-br/composicao/ministro-das-cidades", ativo: true, chave: { nome: "Vladimir Lima" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado da Ciência, Tecnologia e Inovação
      { url: "https://www.gov.br/mcti/pt-br/acesso-a-informacao/institucional/quem-e-quem", ativo: true, chave: { nome: "Luciana Santos" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado das Comunicações
      { url: "https://www.gov.br/mcom/pt-br/composicao/ministro", ativo: true, chave: { nome: "Frederico de Siqueira Filho" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado da Cultura
      { url: "https://www.gov.br/cultura/pt-br/composicao/gabinete-da-ministra/margareth-menezes-1", ativo: true, urlAlternativa: "https://www.gov.br/cultura/pt-br/composicao/gabinete-da-ministra", chave: { nome: "Margareth Menezes da Purificação" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Defesa
      { url: "https://www.gov.br/defesa/pt-br/composicao/gabinete-do-ministro/jose-mucio-monteiro-filho", ativo: true, urlAlternativa: "https://www.gov.br/defesa/pt-br/composicao/quem-e-quem", chave: { nome: "José Mucio Monteiro Filho" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado do Desenvolvimento Agrário e Agricultura Familiar
      { url: "https://www.gov.br/mda/pt-br/acesso-a-informacao/institucional/quem-e-quem/gabinete-da-ministra", ativo: true, chave: { nome: "Fernanda Machiaveli Morão de Oliveira" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Desenvolvimento e Assistência Social, Família e Combate à Fome
      { url: "https://www.gov.br/mds/pt-br/composicao/ministro", ativo: true, chave: { nome: "Wellington Dias" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Desenvolvimento, Indústria, Comércio e Serviços
      { url: "https://www.gov.br/mdic/pt-br/composicao/ministro/marcio-fernando-elias-rosa", ativo: true, chave: { nome: "Márcio Fernando Elias Rosa" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado dos Direitos Humanos e da Cidadania
      { url: "https://www.gov.br/mdh/pt-br/composicao/quem-e-quem", ativo: true, chave: { nome: "JANINE MELLO DOS SANTOS" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Educação
      { url: "https://www.gov.br/mec/pt-br/composicao/gabinete-do-ministro/leonardo-osvaldo-barchini-rosa", ativo: true, chave: { nome: "Leonardo Osvaldo Barchini Rosa" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Empreendedorismo, da Microempresa e da Empresa de Pequeno Porte
      { url: "https://www.gov.br/memp/pt-br/composicao/ministro/marcio-franca?activeAccordion=accordion-panel-1", ativo: true, chave: { nome: "Paulo Henrique Rodrigues Pereira" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Esporte
      { url: "https://www.gov.br/esporte/pt-br/composicao/Gabinete-do-Ministro/paulo-henrique-perna-cordeiro", ativo: true, chave: { nome: "Paulo Henrique Perna Cordeiro" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Fazenda
      { url: "https://www.gov.br/fazenda/pt-br/composicao/ministro/dario-carnevalli-durigan", ativo: true, chave: { nome: "Dario Carnevalli Durigan" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado da Gestão e da Inovação em Serviços Públicos
      { url: "https://www.gov.br/gestao/pt-br/composicao/quem-e-quem/ministra-e-orgaos-de-assistencia-direta", ativo: true, chave: { nome: "Esther Dweck" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado da Igualdade Racial
      { url: "https://www.gov.br/igualdaderacial/pt-br/composicao/gabinete-da-ministra/rachel-barros-de-oliveira", ativo: true, urlAlternativa: "https://www.gov.br/igualdaderacial/pt-br/composicao/quem-e-quem", chave: { nome: "Rachel Barros de Oliveira" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Integração e do Desenvolvimento Regional
      { url: "https://www.gov.br/mdr/pt-br/composicao/ministro-e-secretarios", ativo: true, chave: { nome: "Waldez Góes" }, campos: ["nome"], navegador: "janela" },
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
      { url: "https://www.gov.br/previdencia/pt-br/composicao/ministro-e-secretarios", ativo: true, chave: { nome: "Wolney Queiroz Maciel" }, campos: ["nome"], navegador: "janela" },
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
      // Planilha de 23/10, conferida com fetch em 23/10 (200, 1 página). PDF da composição: os
      // convocados são os nomes seguidos de "**" (spec 2026-10-23 §5.1 e §5.2).
      {
        url: "https://www.stj.jus.br/sites/portalp/SiteAssets/Paginas/Institucional/Composicao/Composicao-do-STJ.pdf",
        ativo: true,
        tipo: "pdf",
        rotulo: "convocado",
        propoeInclusao: true,
        marcador: { textos: ["**"] },
      },
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
      // Planilha de 23/10, conferida com fetch em 23/10 (200, 6 marcas "(convocad…)"). Só as
      // pessoas cujo nome é seguido de "(convocado)" ou "(convocada)" (spec 2026-10-23 §5.2).
      {
        url: "https://www.tst.jus.br/orgaos",
        ativo: true,
        rotulo: "convocado",
        propoeInclusao: true,
        marcador: { textos: ["(convocado)", "(convocada)"] },
      },
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
      // 2026-10-27, a pedido do Clovis: a fonte oficial é a página do deputado que preside a
      // Câmara (antes, a Mesa Diretora, que trazia os outros membros como propostas de inclusão).
      // Fetch de 27/10: 200, nome parlamentar em destaque e nome civil; a página não diz
      // "Presidente", então o cargo sai "fonte não informa". Na troca da presidência, trocar a URL.
      { url: "https://www.camara.leg.br/deputados/160674", ativo: true },
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
    fontes: [
      // Planilha de 23/10, conferida com fetch em 23/10 (200). Nome em `strong` e cargo no
      // parágrafo seguinte, coberto por fixture (spec 2026-10-23 §5).
      { url: "https://www.mpf.mp.br/o-mpf/o-mpf/membros/procurador-geral-da-republica", ativo: true },
    ],
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
    ],
  },
  {
    // Grupo novo da planilha de 23/10 (spec 2026-10-23 §5): substitui a segunda fonte
    // "fora de exercício" dos três grupos de Senadores. Página conferida com fetch em 23/10
    // (200). Tem duas tabelas com o mesmo cabeçalho; a dos titulares é a primeira (índice 0,
    // fixture em tests/scrape-tabela.test.ts). Suplentes não entram. Propõe inclusão:
    // afastado ainda não movido pelo GT aparece aqui como inclusão e em "Senadores" como
    // possível saída. Sem responsáveis: a planilha de 23/10 não os traz.
    // 2026-10-27: a base de contatos de 27/10 trouxe o rótulo "Senadores titulares fora de
    // exercício - Posse 2027"; o nome cadastrado segue o começo do rótulo, que casa por
    // `casaSegmento` (nome cadastrado no começo do rótulo, seguido de espaço).
    nome: "Senadores titulares fora de exercício",
    fontes: [
      {
        url: "https://www25.senado.leg.br/web/senadores/fora-de-exercicio/-/f/por-tipo",
        ativo: true,
        propoeInclusao: true,
        // A tabela 0 traz três seções (medido em 27/10): "Assunção de cargo…", "Licença com
        // convocação de suplente…" e "Suplentes que exerceram o cargo". Suplentes não entram
        // (spec 2026-10-23 §5): só as duas primeiras, como na antiga segunda fonte dos Senadores.
        tabela: { indice: 0, colunas: { nome: 0, uf: 2, motivo: 3 }, secoes: ["Assunção de cargo", "Licença com convocação de suplente"] },
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
