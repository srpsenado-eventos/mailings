# Fontes individuais por contato: Governadores e Ministros de Estado

Data: 2026-10-15. Decisões tomadas com o Clovis em conversa nesta data, uma a uma; nada aqui foi presumido. Substitui, para os grupos Governadores e Ministros de Estado, a regra "uma composição por grupo" do spec de 2026-06-06 (`extracao-estruturada-auditoria-por-campo-design.md`) e complementa o de 2026-09-24 (todas as fontes ativas compõem o grupo). Para os outros grupos nada muda.

## 1. Problema

O GT conferiu à mão, em 06/10, governadores e ministros contra as páginas oficiais de cada governo estadual e de cada ministério (planilha `Referencia 2/Conferencia contatos 06_10.xlsx`, aba "Sites Governo Estados", fora do git). Essas páginas são individuais: uma por UF e uma por pasta. O app só sabe ler uma lista por grupo, então:

- Governadores não tem fonte: os 27 contatos saem vermelhos "cadastrar fonte".
- Ministros de Estado depende só da página geral do Planalto, que responde CAPTCHA ao `fetch` do Node e ao Chrome headless (medido em 2026-10-15): os 38 contatos saem "não verificado".

## 2. Regras (decididas pelo Clovis em 2026-10-15)

1. **Governadores**: fonte individual por UF, referência de **nome e cargo**. Entram 22 UFs. MT, MG, SC, PE e DF ficam **sem fonte individual** (a página indicada é Diário Oficial, PDF, notícia ou página da vice): o contato continua vermelho "cadastrar fonte", como hoje, até haver página oficial com o nome.
2. **Ministros de Estado**: a página individual do ministério, ligada ao contato pelo **nome** (coluna G da planilha), é a referência do **nome** e da permanência. A página geral do Planalto passa a ser só uma **lista de denominações de cargo**: o cargo do contato é casado pela denominação, sem usar o nome. Não há confronto de nome entre as duas páginas.
3. **AGU e CGU**: a página individual é a referência de **nome e cargo**; a página geral não é usada para eles.
4. **Ligação contato→fonte**: por UF para governadores; por nome para ministros, com a **régua da comparação do campo Nome**: igualdade após `normalizarNome`. Nome parcial ou grafia diferente não casa.
5. **Página individual lida sem o nome**: vermelho, `possivelSaida`; as pessoas com cargo que a página traz viram proposta de inclusão (`novos`).
6. **Uma fonte caiu**: cada campo sai pela sua fonte. Individual caída: contato indeterminado, nome "não verificado", cargo pela sua fonte se houver. Fonte do cargo caída (a geral, para ministros): cargo "não verificado", semáforo pelo nome.
7. **Sem fonte individual**: governador sai vermelho com campo `fonte` ("cadastrar fonte"); ministro sai indeterminado, nome "não verificado", cargo conferido pela geral, observação "Sem fonte individual cadastrada".
8. **Fontes moram em `data/catalogo.ts`**, versionadas, como as de grupo. A planilha de referência é só a origem da transcrição.
9. **Bloqueio do gov.br**: as páginas do gov.br são lidas numa sessão do Chrome local **com janela** (teste de 2026-10-15: a página geral do Planalto veio inteira com janela e CAPTCHA sem janela; a individual da Fazenda veio nas duas). Nenhum CAPTCHA é resolvido pelo app: página com CAPTCHA é fonte inacessível.

## 3. Catálogo (`lib/types.ts`, `data/catalogo.ts`)

### 3.1 Tipos

```ts
export type CampoFonte = "nome" | "cargo";

export interface FonteCatalogo {
  url: string;
  ativo: boolean;
  rotulo?: string;
  tabela?: ExtracaoTabela;
  propoeInclusao?: boolean;
  /** `true`: Chrome headless (caso TCU). `"janela"`: Chrome com janela visível, numa sessão por varredura (gov.br). */
  navegador?: true | "janela";
  /** Campos de que esta fonte é referência. Ausente: nome e cargo (composição do grupo, regra atual). */
  campos?: readonly CampoFonte[];
  /** Ausente ou "pessoa": compõe o grupo com pessoas (regra atual). "cargo": só lista de denominações de cargo; não casa ninguém, não gera saída nem inclusão. */
  casamento?: "pessoa" | "cargo";
}

export type ChaveFonteIndividual = { uf: string } | { nome: string };

export interface FonteIndividual {
  url: string;
  ativo: boolean;
  chave: ChaveFonteIndividual;
  /** Obrigatório: `["nome", "cargo"]` ou `["nome"]`. */
  campos: readonly CampoFonte[];
  navegador?: true | "janela";
}

export interface GrupoCatalogo {
  // ...campos atuais...
  fontes: FonteCatalogo[];
  fontesIndividuais?: readonly FonteIndividual[];
  ufs?: readonly string[];
}
```

Invariantes, cobertas por `tests/catalogo-dados.test.ts`:

- Toda URL de fonte individual é de domínio oficial (`.gov.br`, `.jus.br`, `.leg.br`, `.mp.br`, `.def.br`).
- Chave única dentro do grupo (duas individuais com a mesma UF ou o mesmo nome normalizado são erro).
- `campos` de individual nunca vazio e sempre contém `"nome"`.
- Grupo com fonte `casamento: "cargo"` tem pelo menos uma individual ativa (a geral sozinha não verifica ninguém).
- Fonte `casamento: "cargo"` tem `campos: ["cargo"]`.

### 3.2 Conteúdo

**Governadores**: `fontes: []` (continua sem fonte de grupo); 22 `fontesIndividuais`, `campos: ["nome", "cargo"]`, chave por UF, lidas pelo `fetch` (nenhuma é gov.br federal; se alguma responder CAPTCHA ou montar por JavaScript, ganha `navegador` na forma que a leitura exigir, registrado no comentário da entrada). A coluna "Entra" abaixo vem da decisão do Clovis; o motivo entre parênteses é a observação do GT na planilha.

| UF | URL | Entra |
|---|---|---|
| AC | https://estado.ac.gov.br/orgao-entidades/ | sim |
| AP | https://amapa.gov.br/gestores | sim |
| AM | https://www.transparencia.am.gov.br/estrutura-organizacional/ | sim |
| PA | https://www.pa.gov.br/orgao?id_orgao=2 | sim |
| RO | https://rondonia.ro.gov.br/?page_id=1207 | sim |
| RR | https://transparencia.rr.gov.br/principaiscargos | sim |
| TO | https://www.to.gov.br/governo | sim |
| AL | https://alagoas.al.gov.br/governo/governador-de-alagoas | sim |
| BA | https://www.ba.gov.br/comunicacao/equipe-de-governo | sim |
| CE | https://www.ce.gov.br/o-governo/ | sim |
| MA | https://egma.ma.gov.br/integrantes-do-governo | sim |
| PB | https://paraiba.pb.gov.br/governadoria/governador-1 | sim |
| PE | notícia do TSE | não (o site do estado cai) |
| PI | https://www.pi.gov.br/governador/ | sim |
| RN | https://www.rn.gov.br/postagem/governadora/ | sim |
| SE | https://www.se.gov.br/agencia/governo | sim |
| DF | página da vice-governadora | não (o site ainda traz a titular como vice) |
| GO | https://goias.gov.br/administracao-direta/ | sim |
| MT | Diário Oficial | não (sem dado no site) |
| MS | https://www.transparencia.ms.gov.br/#/QuemEQuem | sim |
| ES | https://www.es.gov.br/governo/governador | sim |
| MG | Diário Oficial | não (sem dado no site) |
| RJ | https://www.rj.gov.br/pagina/sobre-o-governo9806 | sim |
| SP | https://www.sp.gov.br/sp/institucional/estrutura/!ut/p/z1/04_Sj9CPykssy0xPLMnMz0vMAfIjo8ziDSzMTIyM3Q2MPYyDnQ3MXB3DzJ2NQg0M_Y31wyEKcABHA_0oovTjVhCF3_hw_ShUKwKCg4Am-BpaOvtauhk7-pvhV-DpbAxTgNuSgtzQCINMT0UAo-8oDA!!/ | sim |
| PR | https://www.parana.pr.gov.br/Pagina/Quemequem | sim |
| RS | https://www.estado.rs.gov.br/governadoria | sim |
| SC | PDF do Diário Oficial | não (site do gabinete fora do ar) |

Observação sobre o MS: a URL tem fragmento `#/QuemEQuem`, sinal de página montada por JavaScript; se o `fetch` não trouxer o nome, a entrada ganha `navegador: true` no cadastro, com o comentário dizendo isso.

**Ministros de Estado**: a fonte geral do Planalto (`https://www.gov.br/planalto/pt-br/conheca-a-presidencia/ministros-e-ministras`) fica `ativo: true, campos: ["cargo"], casamento: "cargo", navegador: "janela"`. 38 `fontesIndividuais` com `chave: { nome }` transcrito da coluna G da planilha, URL da coluna H, `navegador: "janela"`; 36 com `campos: ["nome"]`, AGU e CGU com `campos: ["nome", "cargo"]`.

| Cargo (coluna F, só para localizar a linha) | URL (coluna H) | Campos |
|---|---|---|
| Ministra de Estado da Casa Civil da Presidência da República | https://www.gov.br/casacivil/pt-br/composicao/ministra | nome |
| Ministro de Estado da Secretaria-Geral da Presidência da República | https://www.gov.br/secretariageral/pt-br/composicao/ministro | nome |
| Ministro de Estado da Secretaria de Relações Institucionais da Presidência da República | https://www.gov.br/sri/pt-br/composicao/ministra-1 | nome |
| Ministro de Estado da Secretaria de Comunicação Social da Presidência da República | https://www.gov.br/secom/pt-br/acesso-a-informacao/institucional/quem-e-quem | nome |
| Ministro de Estado Chefe do Gabinete de Segurança Institucional da Presidência da República | https://www.gov.br/gsi/pt-br/composicao/gabinete/ministro | nome |
| Advogado-Geral da União | https://www.gov.br/agu/pt-br/acesso-a-informacao/institucional/quem | nome, cargo |
| Ministro da Controladoria-Geral da União | https://www.gov.br/cgu/pt-br/composicao/ministro | nome, cargo |
| Ministro de Estado da Agricultura e Pecuária | https://www.gov.br/agricultura/pt-br/composicao/ministro-e-staff/andre-carlos-alves-de-paula-filho | nome |
| Ministro de Estado das Cidades | https://www.gov.br/cidades/pt-br/composicao/ministro-das-cidades | nome |
| Ministra de Estado da Ciência, Tecnologia e Inovação | https://www.gov.br/mcti/pt-br/acesso-a-informacao/institucional/quem-e-quem | nome |
| Ministro de Estado das Comunicações | https://www.gov.br/mcom/pt-br/composicao/ministro | nome |
| Ministra de Estado da Cultura | https://www.gov.br/cultura/pt-br/composicao/gabinete-da-ministra | nome |
| Ministro de Estado da Defesa | https://www.gov.br/defesa/pt-br/composicao/quem-e-quem | nome |
| Ministra de Estado do Desenvolvimento Agrário e Agricultura Familiar | https://www.gov.br/mda/pt-br/acesso-a-informacao/institucional/quem-e-quem/gabinete-da-ministra | nome |
| Ministro de Estado do Desenvolvimento e Assistência Social, Família e Combate à Fome | https://www.gov.br/mds/pt-br/composicao/ministro | nome |
| Ministro de Estado do Desenvolvimento, Indústria, Comércio e Serviços | https://www.gov.br/mdic/pt-br/composicao/ministro/marcio-fernando-elias-rosa | nome |
| Ministra de Estado dos Direitos Humanos e da Cidadania | https://www.gov.br/mdh/pt-br/composicao/quem-e-quem | nome |
| Ministro de Estado da Educação | https://www.gov.br/mec/pt-br/composicao/gabinete-do-ministro/leonardo-osvaldo-barchini-rosa | nome |
| Ministro de Estado do Empreendedorismo, da Microempresa e da Empresa de Pequeno Porte | https://www.gov.br/memp/pt-br/composicao/ministro/marcio-franca?activeAccordion=accordion-panel-1 | nome |
| Ministro de Estado do Esporte | https://www.gov.br/esporte/pt-br/composicao/Gabinete-do-Ministro/paulo-henrique-perna-cordeiro | nome |
| Ministro de Estado da Fazenda | https://www.gov.br/fazenda/pt-br/composicao/ministro/dario-carnevalli-durigan | nome |
| Ministra de Estado da Gestão e da Inovação em Serviços Públicos | https://www.gov.br/gestao/pt-br/composicao/quem-e-quem/ministra-e-orgaos-de-assistencia-direta | nome |
| Ministra de Estado da Igualdade Racial | https://www.gov.br/igualdaderacial/pt-br/composicao/quem-e-quem | nome |
| Ministro de Estado da Integração e do Desenvolvimento Regional | https://www.gov.br/mdr/pt-br/composicao/ministro-e-secretarios | nome |
| Ministro de Estado da Justiça e Segurança Pública | https://www.gov.br/mj/pt-br/acesso-a-informacao/institucional/sumario/quemequem/gabinete-do-ministro-1 | nome |
| Ministro de Estado do Meio Ambiente e Mudança do Clima | https://www.gov.br/mma/pt-br/composicao/gm/quem-e-quem | nome |
| Ministro de Estado de Minas e Energia | https://www.gov.br/mme/pt-br/composicao/gabinete-do-ministro/alexandre-silveira | nome |
| Ministra de Estado das Mulheres | https://www.gov.br/mulheres/pt-br/composicao/ministra/marcia-lopes | nome |
| Ministro de Estado da Pesca e Aquicultura | https://www.gov.br/mpa/pt-br/acesso-a-informacao/institucional/quem-e-quem-3/gabinete-do-ministro/ministro | nome |
| Ministro de Estado do Planejamento e Orçamento | https://www.gov.br/planejamento/pt-br/composicao/gabinete-do-ministro/simone-nassar-tebet | nome |
| Ministro de Estado de Portos e Aeroportos | https://www.gov.br/portos-e-aeroportos/pt-br/composicao/autoridades-1/tome-monteiro-da-franca?activeAccordion=accordion-panel-1 | nome |
| Ministro de Estado dos Povos Indígenas | https://www.gov.br/povosindigenas/pt-br/composicao/ministro-e-orgaos-de-assistencia-direta/ministro | nome |
| Ministro de Estado da Previdência Social | https://www.gov.br/previdencia/pt-br/composicao/ministro-e-secretarios | nome |
| Ministro de Estado das Relações Exteriores | https://www.gov.br/mre/pt-br/composicao/gabinete-do-ministro-das-relacoes-exteriores/embaixador-mauro-luiz-iecker-vieira | nome |
| Ministro de Estado da Saúde | https://www.gov.br/saude/pt-br/composicao/ministro | nome |
| Ministro de Estado do Trabalho e Emprego | https://www.gov.br/trabalho-e-emprego/pt-br/composicao/quem-e-quem | nome |
| Ministro de Estado dos Transportes | https://www.gov.br/transportes/pt-br/composicao/quem-e-quem | nome |
| Ministro de Estado do Turismo | https://www.gov.br/turismo/pt-br/composicao/gabinete-do-ministro/gustavo-costa-feliciano?activeAccordion= | nome |

A chave `nome` de cada entrada é o texto da coluna G, transcrito tal qual; a ligação com o Contatos é por `normalizarNome` dos dois lados, então acento, caixa e tratamento não importam, mas o nome tem que ser inteiro.

## 4. Resolução e leitura (`lib/catalogo.ts`, `lib/raspagem.ts`, `lib/navegador.ts`, `lib/analise.ts`)

### 4.1 Resolução contato→fonte

Função pura nova `fonteIndividualDe(contato, fontesIndividuais)` em `lib/catalogo.ts`:

- Chave `{ uf }`: a sigla do contato sai de `ufNoTexto` aplicado, nesta ordem, ao Departamento, ao Cargo e ao Órgão (mesma leitura que `lib/eleitos-governo.ts` já faz para governadores). Sem UF reconhecida, sem individual.
- Chave `{ nome }`: `normalizarNome(contato.nome) === normalizarNome(chave.nome)`.
- Só fontes `ativo: true`. Um contato casa no máximo uma individual; a primeira da lista vence (a chave é única, então não há empate real).

`FonteResolvida` ganha `fontesIndividuais: readonly FonteIndividual[]` (as ativas do grupo dono da primária, ou do grupo casado quando não há primária). `listarGruposComFonte` passa a contar grupo com individual ativa como "com fonte".

### 4.2 Leitura

- O orquestrador lê, em paralelo, as fontes de grupo (como hoje) e as individuais que algum contato casou. Individual sem contato não é lida. Cada leitura vira `conteudo` ou `erro` (`FonteLida`), como hoje; a falha de uma não derruba as outras.
- `rasparFonte` continua a porta única: `navegador: true` vai para `rasparComNavegador` (headless, como hoje); `navegador: "janela"` vai para a sessão com janela; o resto, `fetch`. Tudo passa pelo mesmo `extrairConteudo`.
- `lib/navegador.ts` ganha `abrirSessao(opcoes)`, que lança **um** Chrome com janela visível e devolve `{ raspar(url): Promise<ConteudoFonte>; fechar(): Promise<void> }`. As páginas "janela" são lidas **uma por vez** nessa sessão (a mesma aba, navegação em sequência), cada uma com o teto de 30 s (`TETO_NAVEGADOR_MS`); página que estoura vira `ScrapeError(MOTIVO_NAVEGADOR_TEMPO)` e a sessão segue para a próxima. Chrome ausente: toda fonte "janela" sai `ScrapeError(MOTIVO_NAVEGADOR_AUSENTE)`. `fechar()` é chamado sempre, no `finally` da varredura. O lançador é injetável (`Lancador`), e nenhum teste abre navegador.
- A sessão é criada por `analisar` uma vez por varredura e entregue a `raspar` pelas `Dependencias` (`Raspadores` ganha `janela`). Só existe em modo local; na Vercel nada muda, porque ela nunca varre.
- A Camada 2 (IA) continua uma chamada por grupo, com o texto da fonte primária, e **só quando a primária é `casamento: "pessoa"`**. Para Ministros de Estado a IA deixa de rodar (a geral virou lista de cargos e não há composição de pessoas a refinar). Para Governadores nunca rodou (sem fonte de grupo) e segue assim. Páginas individuais nunca vão para a IA.

### 4.3 Nome na página individual

A página individual vira `ConteudoFonte` pelo `extrairConteudo` normal. O nome do contato está presente quando **qualquer** das duas vias confirma:

1. há uma `PessoaSite` com `normalizarNome(pessoa.nome) === normalizarNome(contato.nome)`; ou
2. `normalizarNome(contato.nome)` aparece como trecho contíguo de `normalizarTexto(textoLimpo)` com fronteiras de palavra (a página de um ministério raramente sai como lista estruturada).

Nenhuma via: nome ausente. Cargo (quando a individual cobre cargo): o `cargo` da `PessoaSite` da via 1; sem pessoa estruturada, `fonte_nao_informa`.

**Regra de ouro preservada.** A página só "não contém" o nome quando foi lida **com conteúdo**: `textoLimpo` não vazio e, descontados menus e rodapé, acima de um mínimo (`MIN_TEXTO_PAGINA_INDIVIDUAL`, 300 caracteres, calibrado pelas fixtures). Resposta vazia, página de CAPTCHA (texto curto, sem o nome, sem pessoas) ou erro de rede são `erro` da fonte, nunca ausência. A constante e o teste de regressão ficam em `lib/analise.ts` e `tests/analise.test.ts`.

**Guarda de grupo.** Se duas ou mais individuais do grupo foram lidas com conteúdo e **nenhuma** confirmou o nome do seu contato, o grupo inteiro cai em leitura suspeita: todos indeterminados, `erroFonte: MOTIVO_LEITURA_SUSPEITA`, sem `novos`. É a extensão da regra que já existe para a composição de grupo: um governador que saiu continua sendo apontado; vinte e dois "saíram de uma vez" é layout que mudou ou bloqueio que devolveu outra página.

## 5. Vereditos por campo e semáforo (`lib/match.ts`, `lib/types.ts`)

### 5.1 Tipos

- `SituacaoCampo` ganha `"nao_verificado"`: a fonte daquele campo caiu, ou não existe para o contato. Como `fonte_nao_informa` e `sem_regra`, **não é divergência** e não pinta amarelo; na tela é etiqueta neutra.
- `ComparacaoCampo` ganha `fonteUrl?: string`: de qual página saiu o valor esperado (ou de qual página se tentou, quando `nao_verificado`).

### 5.2 Contato com fonte individual (`compararContatoIndividual`)

| Situação | Nome | Cargo | Semáforo e observação |
|---|---|---|---|
| Individual lida, nome presente; cargo confere | `confere` | `confere` | verde |
| Individual lida, nome presente; cargo diverge | `confere` | `divergente`, `valorEsperado` com o texto oficial | amarelo |
| Individual lida, nome presente; fonte do cargo sem o cargo | `confere` | `fonte_nao_informa` | verde |
| Individual lida com conteúdo, nome ausente | (`camposDivergentes` com `nome`, como hoje) | não se compara | vermelho, `possivelSaida`, "Não consta na página individual"; `novos` recebe as pessoas com cargo da página, com `fonteUrl` da individual |
| Individual caiu (erro, CAPTCHA, vazia) | `nao_verificado` | pela sua fonte, se houver e se foi lida | indeterminado, observação com o motivo técnico da individual |
| Fonte do cargo caiu (ministro: a geral) | pela individual | `nao_verificado` | pelo nome (verde se confere) |

Tratamento, Endereçamento (Camadas A, B e C), endereço (Camada D), eleição e repetidos: **inalterados**. Entram em `comparacoes` e nos seus eixos como hoje, em todos os caminhos.

`fonteUrl` do contato é a URL da individual. A comparação de `cargo` leva `fonteUrl` da fonte do cargo (a geral, para ministros; a individual, para governadores, AGU e CGU).

### 5.3 Cargo pela lista geral (`casamento: "cargo"`)

A página geral é lida pelo `extrairConteudo` e vira a lista de denominações: os `cargo` das `PessoaSite` que a extração produziu (a fixture `tests/fixtures/ministros-estado.html` já cobre o layout cargo numa linha, nome na seguinte). O cargo do contato é comparado com cada denominação pela régua de cargo atual (`situacaoCampo`, papel pelo léxico de `lib/cargos.ts`):

- alguma confere: `confere`, `valorEsperado` com a denominação que conferiu;
- nenhuma confere: `divergente`, `valorEsperado` com a denominação de maior sobreposição de tokens significativos (`tokensSignificativos`), exigindo ao menos um token em comum;
- nenhum token em comum com denominação alguma: `fonte_nao_informa`.

O nome do contato não é usado nesta fonte. Ela não gera `possivelSaida` nem `novos`. AGU e CGU não passam por aqui.

### 5.4 Contato sem fonte individual

- Governador: vermelho com campo `fonte` ("cadastrar fonte"), conta em `contatosSemFonte`, como hoje. Observação: "Sem fonte individual para a UF X" quando a UF foi reconhecida; "UF não reconhecida no cadastro" quando não foi.
- Ministro: indeterminado; nome `nao_verificado`; cargo pela geral (5.3) se ela foi lida, senão `nao_verificado`; observação "Sem fonte individual cadastrada".

### 5.5 Grupo

- `semFonte` é falso quando há fonte de grupo ativa **ou** fonte individual ativa. Governadores deixa de ser "grupo sem fonte" (`gruposSemFonte` cai para 0 com o catálogo de hoje).
- `fonteUrl` do grupo: a geral (Ministros) ou ausente (Governadores). Com ela ausente, o cabeçalho do grupo não mostra "abrir".
- `fonteInacessivel` do grupo só quando **nenhuma** fonte, de grupo ou individual, foi lida com conteúdo; aí todos os contatos saem indeterminados como hoje (`marcarFonteInacessivel`), e `erroFonte` traz o motivo da geral e a contagem das individuais caídas.
- `erroFonte` (grupo lido): as fontes que caíram, identificadas pela URL e o motivo, separadas por " · ", como hoje. Nunca por nome de contato.
- `leituraParcial` (spec 2026-09-24) continua valendo só entre fontes de grupo. Entre individuais não existe leitura parcial: cada contato responde pela sua.
- `novos` do grupo: os das individuais (5.2) mais os da composição de grupo quando ela existe com `casamento: "pessoa"`.
- `resumo`: sem contador novo; `indeterminado` já conta os `nao_verificado`.

## 6. Tela, export, publicação

### 6.1 Painel (`lib/painel.ts`, `components/painel.tsx`, `components/linha-contato.tsx`)

- Linha do contato: "abrir" aponta para `fonteUrl` do contato (a individual). No detalhe, cada comparação com `fonteUrl` ganha o seu link, então o nome aponta para a página do ministério e o cargo para a do Planalto.
- Etiqueta neutra "não verificado" para `nao_verificado`, ao lado de "fonte não informa" e "sem regra"; a regra de "Tudo confere" e "Nada a revisar" não muda.
- Cabeçalho do grupo: além de "abrir" da geral (quando há), "N páginas individuais · M inacessíveis" quando o grupo tem individuais; `erroFonte` como hoje.
- `/grupos`: cada grupo mostra a contagem de fontes individuais ativas e, por fonte de grupo, os campos que cobre ("cargo" para a geral do Planalto).

### 6.2 Export (`lib/export.ts`)

- "Fonte" continua a URL do contato (agora a individual).
- Coluna nova "Fonte do cargo", com a URL da fonte do cargo quando é diferente da "Fonte".
- `nao_verificado` sai como "não verificado" na coluna "(site)" do campo.
- Linhas de `novos` levam a URL da individual na coluna "Fonte".

### 6.3 Publicação e modo web

`lib/publicar.ts` já leva `fonteUrl`; URL oficial não é dado pessoal e nada novo é removido. A tela web mostra as mesmas etiquetas e links.

### 6.4 Rotina da coleta (CLAUDE.md)

- A varredura abre uma janela do Chrome enquanto lê o gov.br; ela não deve ser tocada e fecha sozinha. A varredura passa de 30 s para alguns minutos (39 páginas do gov.br em sequência, mais 22 estaduais em paralelo).
- Trava de qualidade: grupo que teve individuais lidas na coleta anterior e vem com **todas** caídas não publica sem falar com o Clovis, além das regras atuais.

## 7. Testes (Vitest, sem rede, nenhum teste abre navegador)

- `tests/catalogo.test.ts`: `fonteIndividualDe` por UF (Departamento vazio, UF no Cargo, no Órgão, nenhuma UF) e por nome (igualdade normalizada, tratamento no nome, nome parcial não casa, chave inativa não casa); `resolverGrupoEFonte` devolvendo `fontesIndividuais`; `listarGruposComFonte` contando grupo só com individuais.
- `tests/catalogo-dados.test.ts`: invariantes de 3.1 sobre o catálogo real; 22 individuais em Governadores e 38 em Ministros; AGU e CGU com `["nome", "cargo"]`; geral do Planalto com `casamento: "cargo"`.
- `tests/match.test.ts`: tabela 5.2 caso a caso; 5.3 (confere, divergente com melhor sobreposição, sem token em comum); AGU/CGU; 5.4.
- `tests/analise.test.ts`: orquestrador com fontes injetadas: individual lida e geral caída; geral lida e individual caída; guarda de grupo (duas ou mais lidas, nenhuma casa); governador sem individual; ministro sem individual; CAPTCHA (texto curto) tratado como erro e não como ausência; `semFonte` falso com só individuais; `erroFonte` sem nome de contato; IA não chamada para grupo cuja primária é `casamento: "cargo"`. Regressão explícita: página individual vazia nunca vira saída.
- `tests/navegador.test.ts`: `abrirSessao` com lançador injetado: páginas em sequência na mesma aba, teto por página, `fechar` chamado mesmo com erro, Chrome ausente.
- `tests/raspagem.test.ts`: `rasparFonte` roteando `true`, `"janela"` e ausente.
- `tests/painel.test.ts` e `tests/export.test.ts`: etiqueta "não verificado", links por campo, coluna "Fonte do cargo", cabeçalho com contagem de individuais.
- Fixtures novas em `tests/fixtures/`: `ministerio-individual.html` (página de gabinete de ministério, anonimizada) e `governo-estadual.html` (página de governo estadual, anonimizada), além da `ministros-estado.html` que já existe.

## 8. Fora de escopo

- Resolver ou contornar CAPTCHA. Página com CAPTCHA é fonte inacessível.
- Fontes individuais para outros grupos (Embaixadores, tribunais). O mecanismo fica genérico, mas só Governadores e Ministros de Estado recebem cadastro neste spec.
- Ler a planilha de referência na varredura: a transcrição para o catálogo é manual, conferida pelo Clovis.
- Cache de leituras anteriores de fonte: o retrato continua a única persistência.

## 9. Desvios registrados na implementação (2026-10-15)

- §5.3: "confere" na lista de cargos exige também o mesmo conjunto de tokens distintivos entre o cargo do Contatos e a denominação (decisão do controlador R3, para evitar verde falso entre pastas que compartilham um token).
- §6.2: a coluna "Fonte do cargo" entra depois de "Observacao", no fim das colunas existentes (R4).
