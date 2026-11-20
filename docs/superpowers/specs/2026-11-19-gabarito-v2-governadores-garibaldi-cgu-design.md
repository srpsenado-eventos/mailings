# Gabarito de conferência, versão 2: governadores, Garibaldi e CGU

Data: 2026-11-19 (tarde). Decisões do Clovis de 19/11 sobre as cinco abas novas da versão 2 do gabarito das conferentes (edição de 11/11, versão 8, abas "ok2"): Comandantes e EMCFA, Ex-Presidentes do Congresso, Governadores, Ministros de Estado e Sem cargo. Spec curta, continuação da spec 2026-11-19 da manhã (gabarito, 14 abas). Tudo o que não está aqui permanece; a regra de ouro do "possível saída" não muda.

## 1. Decisões do Clovis

1. **Comandantes e EMCFA:** ok, sem mudança de regra.
2. **Ex-Presidentes do Congresso:** ok; acrescentar a página individual do Senado como fonte do nome do Garibaldi Alves Filho.
3. **Governadores:** atualizar o catálogo com os links atuais do gabarito; o cargo é "Governador(a) do estado de(a/o) X" com "estado" em minúscula, e o Fiscal **precisa indicar quando estiver em caixa alta**.
4. **Ministros de Estado:** usar a fonte do gabarito para a CGU.
5. **Sem cargo:** sem decisão ainda; fora desta spec.

## 2. O que muda

### 2.1 Caixa de "estado" no cargo dos governadores (Camada C)

Regra de escrita do cargo (`lib/regras-cargo.ts`, ao lado de `comparacaoCargoExPresidente` e `comparacaoCargoIndicado`), nos grupos **Governadores** (grupo canônico do catálogo) e **Governadores eleitos - Posse Presidencial 2027** (rótulo do agrupador, por segmento): quando o cargo, sem caixa e sem acento, casa `^governador(a)?( em exercicio| substitut[oa]| eleit[oa])? do estado d[aeo]s? .+$`, a palavra **"estado" tem de estar toda em minúscula** no cadastro. "Estado", "ESTADO" ou qualquer outra caixa é o achado novo `cargo_governador_caixa`, divergente, `origemValor: "coerencia"`, com o esperado igual ao cadastro com a palavra trocada por "estado" (resto intocado), rótulo "Cargo do governador com \"estado\" em caixa alta (o GT escreve em minúscula)". Cargo que não casa o padrão (DF "Governador(a) do Distrito Federal", vazio, outra forma) não gera o achado: a regra só vigia a caixa, como o Clovis pediu. A comparação com a página e com a lista continua sem caixa, e o esperado da lista dos eleitos (`cargoGovernador` em `lib/grupos-lista.ts`) passa a escrever "do estado de" em minúscula, como o gabarito e o Contatos (34 de 34 cadastros de 05 NOV já estão em minúscula). Entrada de 19/11 no quadro "Regras do GT em vigor": "Governadores: cargo", texto "Cargo \"Governador(a) do estado de(a/o) X\" com \"estado\" em minúscula (Manual de Comunicação do Senado); DF é \"Governador(a) do Distrito Federal\".", grupos Governadores e Governadores eleitos.

### 2.2 Links dos governadores

Dos 12 links do gabarito que diferem do catálogo, 7 são páginas que listam o governador e 5 são diários oficiais (edição do dia em PDF), que o Fiscal não consegue ler como lista de nomes. Fetch de 19/11: os 7 respondem 200 com a palavra "governador" no texto; os 5 respondem 200 sem ela.

- **Passam a fonte de leitura principal** (a URL atual vira `urlAlternativa`, lida só quando a principal falha; CE já é a mesma página, só muda de http para https): AC `https://estado.ac.gov.br/orgao-entidades/` (alternativa: a governadoria de hoje; a agência sai), PB `https://iphaep.pb.gov.br/governadoria/governador-1`, RO `https://rondonia.ro.gov.br/portal/o-governador/`, SP `https://www.sp.gov.br/sp/institucional/estrutura/governador`, TO `https://www.to.gov.br/secom/governador/21pfeahm3org`. **DF** troca a notícia provisória da CLDF por `https://www.df.gov.br/perfil-do-governador`, fonte definitiva (sem `provisoria`), `campos: ["nome", "cargo"]` (a página traz "Governadora do Distrito Federal").
- **Entram só como links de referência** no cabeçalho do grupo Governadores (`linksInformativos`, spec da manhã §2.5), sem leitura, com a fonte atual mantida: ES `https://ioes.dio.es.gov.br/portal/visualizacoes/diario_oficial`, MS `https://www.diariooficial.ms.gov.br`, PE `https://diariooficial.cepe.com.br/diariooficialweb/#/home?diario=MQ%3D%3D` (a notícia provisória do TSE continua como leitura), RJ `https://portal.ioerj.com.br`, RR `https://www.imprensaoficial.rr.gov.br/_inicial/`; títulos "Diário Oficial do <UF> (referência do gabarito)". Mais os dois links do Manual de Comunicação citados na aba (artigo definido e "estado" em minúscula).
- Os 15 restantes já são iguais. `tests/catalogo-dados.test.ts` continua exigindo domínio oficial; `.gov.br`, `.leg.br` e `cepe.com.br` (Companhia Editora de Pernambuco, diário oficial do estado) entram na lista de domínios aceitos só para `linksInformativos`, nunca para fonte de leitura.

**Resultado da conferência de leitura (19/11):** a regra usada foi o raspador como juiz: a página nova só passou a principal quando a leitura por `fetch` de 19/11 rendeu o governador com cargo; quando não rendeu, ficou como `urlAlternativa` e a fonte atual seguiu principal (o Clovis pode mandar inverter). Por UF: **PB** e **RO** com a página nova como principal e a atual como alternativa; **SP** e **TO** com a atual principal e a nova só como `urlAlternativa`; **DF** com a notícia provisória da CLDF principal e `https://www.df.gov.br/perfil-do-governador` como `urlAlternativa` (o texto traz o nome da governadora e "governadora do distrito federal", mas a extração não rende pessoa com cargo); **AC** sem a página nova no catálogo, porque o único slot de alternativa é o da agência (exigida pela spec de 05/11), e a nova só consta em comentário; **CE** já era a mesma página, só muda de http para https.

### 2.3 Fonte individual complementar: Garibaldi e CGU

Hoje um grupo com `fontesIndividuais` vai inteiro pelo caminho por contato, e quem não tem página fica "cadastrar fonte". Ex-Presidentes do Congresso e Ministros de Estado leem uma página de grupo que compõe todo mundo; o gabarito acrescenta, em cada um, **uma** página individual para **um** contato. Entra `FonteIndividual.complementar: true`:

- Grupo cujas fontes individuais vigentes são **todas** complementares segue o caminho de grupo de sempre (composição, possível saída, cargo pela pasta, propostas de inclusão), e **depois** cada contato ligado a uma complementar (`chave` por nome, como no Contatos) tem os campos dela (`campos`) comparados com a página individual, por `compararContatoIndividual`, substituindo as comparações desses campos no resultado do grupo; `camposDivergentes` e semáforo são recalculados. A presença (possível saída) vem só do grupo; a página complementar **nunca** cria saída nem proposta de inclusão. Página complementar que falha deixa esses campos `nao_verificado` com a URL, e o resto do contato fica como o grupo decidiu. Memória de leitura, janela do Chrome e `falhas` valem como em qualquer individual; o rodapé "De onde veio cada resposta" mostra a página. Grupo com alguma individual não complementar continua como hoje.
- **Garibaldi Alves Filho** (grupo "Ex-Presidentes do Congresso"): `url: "https://www25.senado.leg.br/web/senadores/senador/-/perfil/87"`, `chave: { nome: "Garibaldi Alves Filho" }`, `campos: ["nome"]`, `complementar: true`. A página "Nova República" continua compondo o grupo (lá ele é "Garibaldi Alves"); o nome confere pela página individual ("Senador Garibaldi Alves Filho" no título, "Senador" é tratamento removível). Comentário no catálogo: exceção do gabarito, versão 2.
- **CGU** (grupo "Ministros de Estado"): `url: "https://www.gov.br/cgu/pt-br/acesso-a-informacao/institucional/quem-e-quem/gabinete-ministerial"`, `chave: { nome: "Vinicius Marques de Carvalho" }` (como no Contatos de 05 NOV), `campos: ["nome", "cargo"]`, `navegador: "janela"` (gov.br), `complementar: true`. A página traz "Ministro da Controladoria-Geral da União", que é o cargo do gabarito e o do Contatos; o cargo deixa de sair `fonte_nao_informa` para esse contato. A página grafa "Vinícius" com acento e o Contatos "Vinicius": a regra de 06/11 vai apontar "Diferença de acento em relação à fonte" (é o esperado; o GT decide a grafia). AGU e GSI ficam como estão (o Clovis só pediu a CGU).
- Entrada de 19/11 no quadro: "Ministros de Estado: CGU", texto "O cargo do ministro da CGU é \"Ministro da Controladoria-Geral da União\", conferido na página \"Quem é quem\" da CGU; os demais seguem a página do Planalto.", grupo Ministros de Estado.

### 2.4 Comandantes e EMCFA (proposta minha, não pedida)

O gabarito aponta o EMCFA em `https://www.gov.br/defesa/pt-br/composicao/quem-e-quem` (fetch de 19/11: 200, com o nome do chefe e o marcador "CHEFE DO ESTADO-MAIOR CONJUNTO DAS FORÇAS ARMADAS" em linha própria) e a Marinha em `https://www.marinha.mil.br/relacao-de-autoridades` (403, Cloudflare, como a atual). Proposta: trocar a fonte do EMCFA pela "Quem é quem" (mesmo `marcador.obrigatorio`, mesma janela; a `/composicao` vira `urlAlternativa`) e pôr a `relacao-de-autoridades` como `urlAlternativa` da Marinha. O Clovis pode vetar; sem veto, entra.

## 3. O que não muda

Comandantes (cargos e nome), Ex-Presidentes (formato do cargo; a regra "mandatos não consecutivos registram só o último" fica para o Clovis decidir, hoje o Fiscal aceita vários períodos), tabela de tratamentos, agrupador (29 grupos; "Sem cargo" fora até decisão), regra de ouro, Camada D, eleição, repetidos, decisões.

## 4. Critérios de aceite

- Governador com cargo "Governador do Estado de Goiás" sai amarelo com esperado "Governador do estado de Goiás"; "Governador do estado de Goiás", "Governadora do Distrito Federal" e "Governador eleito do estado de Alagoas" não geram o achado; "Governador ELEITO DO ESTADO DO PARÁ" gera, esperado com "estado".
- Catálogo (resultado da conferência de leitura de 19/11, §2.2): PB e RO com a URL do gabarito como principal e a antiga como alternativa; SP, TO e DF com a do gabarito só como alternativa (DF segue com a notícia provisória como principal); AC com a página nova só em comentário; CE https; Governadores com 7 links informativos; todos de domínio oficial.
- Ex-Presidentes do Congresso: contato "Garibaldi Alves Filho" com a composição "Garibaldi Alves" e a página individual com "Senador Garibaldi Alves Filho" sai "Nome confere"; os outros ex-presidentes não mudam; nenhum fica "cadastrar fonte".
- Ministros de Estado: o ministro da CGU sai com cargo "confere" pela página da CGU e nome com a observação de acento; os demais ministros não mudam; página da CGU caída deixa nome e cargo `nao_verificado` sem mudar o resto.
- Suíte, typecheck e build verdes.
