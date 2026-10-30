# Regras fixas de nome, cargo e protocolo pelos pares; leitura de Roraima

Data: 2026-10-30. Situação: desenho a aprovar pelo Clovis. Decisões tomadas por ele em 30/10, numa rodada de perguntas depois da coleta de 30/10 15h04. Complementa as specs de 2026-08-13 (tratamento e endereçamento), 2026-09-18 (Camada C, regras de nome), 2026-10-15 (fontes individuais) e 2026-10-23 (nome mais curto em destaque). Nada aqui muda a regra de ouro do "possível saída".

## 1. Intenção

O GT corrige o Contatos a cada coleta e não quer que o app volte a acusar o que já está certo, nem que deixe passar o que o GT fixou como regra. As regras abaixo são **fixas**: vivem em `data/` e `lib/`, versionadas, e valem em toda coleta, sem depender de decisão registrada.

Casos que motivaram (coleta de 30/10):
- **STJ:** o Contatos tem "Sérgio Kukina" e "Herman Benjamin", que são as partes em negrito na página do STJ, e o app propõe "Sérgio Luíz Kukina" e "Antonio Herman de Vasconcellos e Benjamin". 20 divergências de nome falsas.
- **Cargo nos tribunais:** o app acusa "Vice-Presidente", "Corregedor-Geral da Justiça do Trabalho", "Diretor-Geral da ENFAM", "(Corregedor-Geral)" como divergência de "Ministro do …". São 6 falsas em STJ, TSE, TST e TCU, mais "Ministro(a)" do STM acusado contra "Ministra".
- **Tratamento e endereçamento "sem regra":** Governadores (27), Ministros do STF (8), Ex-Presidentes (11), PGR, Defensor e 44 Embaixadores saem "sem regra" porque o cargo não está na tabela de protocolo, embora os pares do grupo sejam iguais entre si.
- **Ex-Presidentes:** os 11 contatos têm o cargo "Ex-Presidente do …", e a regra do GT é registrar o período da presidência, sem "Ex".
- **Presidente da República:** o nome é "Presidente Luís Inácio Lula da Silva" e o prefixo "Presidente" é regra, não erro.
- **Roraima:** a página individual do governador (`transparencia.rr.gov.br/principaiscargos`) é uma tabela de cargos do Estado; a extração sai deslocada (cargo no lugar do nome), o governador não é encontrado e vira **possível saída falsa**, e 9 linhas da tabela viram "propostas de inclusão" em Governadores. Já era assim em 27/10.

## 2. Decisões do Clovis (30/10)

1. **Negrito do STJ:** o nome esperado é só a parte em negrito da página. Vale **só no STJ**.
2. **Cargo nos tribunais:** Presidente, Vice-Presidente, Corregedor-Geral, Diretor-Geral e afins valem como "Ministro" e não geram revisão. O Presidente fica com o cargo próprio no Contatos, **"Presidente do …"**, e leva "Ministro(a)" no nome.
3. **Prefixo no nome:** só para o Presidente de tribunal ("Ministro(a) Nome") e para o Presidente da República ("Presidente Nome"). Presidente do Senado e da Câmara ficam fora da regra.
4. **Tratamento e endereçamento pelos pares:** cargo sem regra na tabela passa a ser comparado com a maioria do grupo; diferente da maioria é **divergência (amarelo)**, com o valor da maioria como esperado.
5. **Ex-Presidentes:** o cargo certo é **"Presidente do Senado Federal de AAAA a AAAA"** (e "Presidente da República Federativa do Brasil de AAAA a AAAA"); "Ex-Presidente…" é erro.
6. As regras ficam inalteradas a cada nova coleta.

## 3. Desenho

### 3.1 Nome em negrito no STJ

- A fonte do STJ no catálogo ganha `nomeEmDestaque: true`. Na extração (`lib/scrape.ts`), para fonte com essa marca, cada pessoa guarda também `nomeDestaque`: as partes do nome que estão em `b`/`strong` dentro do bloco da pessoa, na ordem, unidas por espaço ("Marco Aurélio Bellizze" de "<b>Marco Aurélio Bellizze</b> Oliveira"; se a página marcar partes separadas, "Sérgio Kukina" de "<b>Sérgio</b> Luíz <b>Kukina</b>").
- O casamento contato × pessoa continua pelo nome completo **e** pelo destaque (qualquer um casa).
- O nome esperado (`valorEsperado`) passa a ser `nomeDestaque` quando existe; sem destaque na página, continua o nome completo.
- Nome do Contatos igual ao destaque (após `normalizarNome`) confere. Nome do Contatos igual ao completo, mas diferente do destaque, **diverge**, com o destaque como esperado (regra do GT: "STJ: usar as partes do nome em negrito").
- A memória de leitura guarda `nomeDestaque` junto com a pessoa.

### 3.2 Cargo nos tribunais

Vale para os grupos de tribunal: Ministros do STF, STJ, TSE, TST, STM e TCU (segmentos do catálogo; lista em `data/cargos-tribunal.ts`).

- **Funções de tribunal** que a página pode trazer: "Ministro(a)", "Presidente", "Vice-Presidente", "Corregedor(a)-Geral …", "Diretor(a)-Geral …", "Decano(a)", "Ouvidor(a)", e as formas com parênteses ("(Corregedor-Geral)"). Todas **confirmam** o cargo "Ministro(a) do <tribunal>" do Contatos.
- O cargo "Presidente do <tribunal>" do Contatos é confirmado pela página quando ela diz "Presidente" **ou** só a função genérica "Ministro(a)" (caso do STF, que não marca a presidência na lista). Uma função específica diferente ("Vice-Presidente", "Corregedor-Geral") **não** confirma "Presidente do …" (regra atual, mantida).
- Página que diz "Presidente" para um contato cadastrado como "Ministro(a) do …" → cargo diverge, com "Presidente do <tribunal>" como esperado (é como o app já aponta hoje a troca de presidência).
- Gênero: "Ministro(a)" e "Ministro/Ministra" da página confirmam tanto "Ministro" quanto "Ministra" do Contatos. A regra "Ministra não confirma Ministro" da Camada 1 continua só quando a página traz **um** gênero explícito e o Contatos traz o outro.
- Os convocados ("Desembargador(a) Convocado(a) do …") não mudam: o cargo deles é comparado como hoje.

### 3.3 Prefixo no nome

- **Presidente de tribunal** (cargo do Contatos "Presidente do <tribunal>"): o nome deve começar com "Ministro " ou "Ministra ". O prefixo esperado é **resolvido pelo gênero** do contato: "Ministra" quando o tratamento/endereçamento é feminino ("Senhora", "a Senhora") ou o cargo é feminino pela tabela de cargos; senão "Ministro". O esperado é esse prefixo + o nome da página (pronto para copiar); sem o prefixo, o campo nome **diverge** com esse esperado; com o prefixo, a comparação ignora o prefixo (como `normalizarNome` já faz) e confere pelo resto.
- A regra do prefixo e a do "Ex-" (§3.5) são regras do cadastro (Camada C, como as de `data/regras-nome.ts`): rodam nos três caminhos, com fonte, via IA e sem fonte. Num grupo sem fonte o contato continua vermelho "cadastrar fonte", e a divergência de prefixo ou de "Ex-" aparece como etiqueta do campo, como hoje aparecem as de tratamento.
- **Presidente da República** (grupo "Presidente da República"): o nome deve começar com "Presidente ". Mesma mecânica. Hoje o contato é "Presidente Luís Inácio Lula da Silva": a comparação com a página (ou com a IA, enquanto não há fonte) fica só no "Luís Inácio Lula da Silva".
- O app **nunca** propõe tirar o prefixo. Em nenhum outro grupo o prefixo é exigido ou acusado (Senado e Câmara ficam como estão).

### 3.4 Tratamento e endereçamento pelos pares

Camada B hoje: regra da tabela de protocolo por cargo; cargo sem regra sai `sem_regra` (neutro). Passa a existir um segundo degrau:

- **Pares** do contato: os outros contatos do mesmo grupo do Contatos cujo cargo **do Contatos** (não o da página), com o gênero neutralizado, tem o mesmo núcleo (`Ministro do Supremo Tribunal Federal`, `Governador do Estado de …` → núcleo "Governador do Estado"; `Embaixador de …` → "Embaixador"; "Encarregado de Negócios …" → "Encarregado de Negócios"). O Presidente de tribunal e os convocados não são pares dos ministros, e vice-versa.
- **Maioria**: o valor mais frequente entre os pares, comparado com o gênero neutralizado (`Senhor`/`Senhora`, `o Senhor`/`a Senhora`) e sem espaços dobrados; exige **2 ou mais pares com valor** e **mais da metade** deles com o mesmo valor. Sem maioria, continua `sem_regra`.
- O valor esperado sai **no gênero do contato**.
- Só quando a tabela de protocolo não tem regra para o cargo (`sem_regra` hoje). Com regra na tabela, a tabela manda, como hoje: "Presidente do Supremo Tribunal Federal" e "Presidente da República" já têm regra própria em `data/tratamentos.ts` e nunca entram como pares dos ministros.
- Diferente da maioria: `divergente`, `valorEsperado` = maioria, `observacao` "Pela maioria dos pares: N de M no grupo usam …". Igual: `confere`, com a mesma observação. O campo `origemValor` novo: `"pares"`.
- Vale para `tratamento` e `enderecamento`, cada um com a sua maioria.
- A implementação deve conferir por que a regra "Governador" da tabela não casa "Governador do Estado de …" (27 "sem regra" hoje). Se for defeito do casamento por similaridade, corrigir; a regra da tabela vem antes da dos pares.

### 3.5 Ex-Presidentes

Vale para os grupos "Ex-Presidentes do Senado" e "Ex-Presidentes da República" (segmentos do catálogo).

- **Adendo de 30/10 (decisão do Clovis, depois da revisão da implementação):** nesses dois grupos, **todo cargo que não esteja exatamente no formato** "<cargo> de AAAA a AAAA" (um ou mais períodos válidos) diverge, não só o que começa com "Ex-": "Presidente do Senado Federal" sem período, "Presidente do Senado de 2019 a 2021" (sem "Federal") e "Senador" também são acusados. Cargo vazio fica com o achado "Cargo vazio" de sempre. Fora desses grupos nada muda.
- Cargo do Contatos que começa com "Ex-" (ou "Ex " / "Ex-Presidente") **diverge** sempre. O esperado é "Presidente do Senado Federal de AAAA a AAAA" / "Presidente da República Federativa do Brasil de AAAA a AAAA": quando a página (ou a composição) traz o período da pessoa, o app preenche os anos; senão, deixa "AAAA" e a observação "Informar o período da presidência".
- Cargo já no formato "Presidente do … de AAAA a AAAA" confere com a página que diz "Presidente do Senado Federal" (compara o papel; o período só precisa ter dois anos de quatro dígitos, o segundo maior ou igual ao primeiro; "1º Vice-Presidente" na página continua divergência).
- **Mais de um mandato** (Sarney, Renan): **ainda a definir pelo Clovis** (30/10). Até lá o app aceita um ou mais períodos no formato "de AAAA a AAAA", separados por vírgula ou "e", e não propõe qual período escrever quando há mais de um (deixa "AAAA" e a observação).
- Onde o app lê "ex-" do cargo para decidir precedência (`lib/repetidos-base.ts`, `OcorrenciaRepetida.ex`; `casaDoGrupo`), passa a valer: ocorrência é "ex-" quando o **grupo** começa com "Ex-" **ou** o cargo tem período no formato acima. O grupo decide; o formato novo do cargo não pode fazer um ex-presidente virar cargo atual.
- O período da página do Senado (`nova-republica`): a página lista presidente e período; o extrator guarda o período como `periodo` da pessoa quando o reconhece ("2019 a 2021", "2019-2021", "2019/2021"). Para a República não há fonte: fica "AAAA".

### 3.6 Leitura de Roraima e inclusões de página individual

- **Página individual nunca propõe inclusão.** `compararContatoIndividual` deixa de montar `novos` quando o nome não consta na página: a página individual fala de uma pessoa, e quem mais está nela não é candidato ao grupo. "Não consta" continua possível saída (lida com conteúdo), como hoje.
- **Roraima:** conferido em 30/10: o texto que o app lê de `transparencia.rr.gov.br/principaiscargos` (6 mil caracteres, 17 pessoas) lista o Vice-Governador e secretários, e **não traz o nome do governador**. Decisão do Clovis (30/10): a fonte fica como está e vale a regra geral da página individual, "não consta na página individual (possível saída)", que o GT confere à mão; a única mudança é que as 9 linhas da tabela deixam de virar propostas de inclusão (item anterior). A troca da fonte, se o Clovis quiser, é cadastro no catálogo, fora desta spec.

## 4. Fora do escopo

- Regras para Presidente do Senado e da Câmara (decisão 3).
- Mudar a tabela de protocolo (`data/tratamentos.ts`); a regra dos pares é só o degrau abaixo dela.
- Fonte oficial para Ex-Presidentes da República.

## 5. Critérios de aceite (coleta com a base de 27/10)

1. STJ: "Sérgio Kukina", "Herman Benjamin", "Gurgel de Faria", "Isabel Gallotti", "Marco Aurélio Bellizze" conferem no nome; as 20 divergências de nome falsas somem; um contato com o nome completo no Contatos diverge com o destaque como esperado.
2. Tribunais: "Vice-Presidente", "Corregedor-Geral …", "Diretor-Geral da ENFAM", "(Corregedor-Geral)" confirmam "Ministro do …"; "Ministro(a)" confirma "Ministra do STM"; "Presidente do STF" com a página "Ministro"/"Presidente" confere; nome "Ministro Edson Fachin" confere; "Edson Fachin" sem prefixo, com cargo Presidente, diverge com esperado "Ministro Edson Fachin".
3. Presidente da República: "Presidente Luís Inácio Lula da Silva" não diverge pelo prefixo (pode divergir por "Luís"/"Luiz", que é outra coisa).
4. Pares: os 8 "sem regra" de tratamento do STF viram confere (7 "Senhor" iguais entre si; o Presidente, "Excelentíssimo Senhor", é julgado pela regra própria, não pelos pares); Governadores saem de "sem regra" pela tabela ou pelos pares; um contato com tratamento diferente da maioria do grupo sai amarelo com o valor da maioria.
5. Ex-Presidentes: os 11 contatos com "Ex-Presidente …" saem amarelos no cargo com o esperado no formato novo; "Presidente do Senado Federal de 2019 a 2021" confere; a precedência de `/repetidos` continua tratando esses grupos como "ex-".
6. Roraima: as 9 propostas de inclusão de Governadores somem; nenhuma página individual gera "novos"; o governador de RR continua "não consta na página individual" até o Clovis trocar a fonte.
7. `npm test`, `npm run typecheck` e `npm run build` verdes; cada regra com teste em `tests/`; o critério 1 com fixture do STJ.

## 6. Escolhas do construtor

Ficam com o construtor: o nome dos arquivos de dados (`data/cargos-tribunal.ts` ou dentro de `lib/cargos.ts`); como extrair o período na página do Senado; o cálculo do núcleo do cargo para os pares, desde que os exemplos do §3.4 passem; e a forma de guardar `nomeDestaque` na memória de leitura.

Minhas escolhas, que o Clovis pode rever: exigir 2 ou mais pares e maioria estrita para a regra dos pares; o valor esperado no gênero do contato; "AAAA" como marcador quando o período não é conhecido; ocorrência "ex-" decidida pelo grupo; página individual nunca propor inclusão; a função genérica "Ministro(a)" da página confirmar também o "Presidente do …" do Contatos; o prefixo "Ministro(a)" resolvido pelo gênero do contato; as regras de prefixo e de "Ex-" valerem também nos grupos sem fonte e via IA.
