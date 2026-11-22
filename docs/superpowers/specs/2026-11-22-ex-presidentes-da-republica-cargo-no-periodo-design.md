# Ex-Presidentes da República: cargo no formato do Congresso

Data: 2026-11-22. Decisão do Clovis de 22/11, depois da coleta de 21/11: nas divergências de cargo dos Ex-Presidentes da República, considerar a regra que já estava fixada em 05/11 para os ex-presidentes do Congresso (spec 2026-11-05 §7.2). Adendo curto à spec 2026-10-30 §3.5. Tudo o que não está aqui permanece; a regra de ouro do "possível saída" não muda.

## 1. O problema

A regra de 30/10 esperava para a República "Presidente da República Federativa do Brasil de AAAA a AAAA". O Contatos de 21/11 escreve o cargo como o do Congresso, "Presidente da República Federativa do Brasil no período de 2011 a 2016", e a coleta de 21/11 acusou os quatro ex-presidentes com "Cargo de ex-presidente fora do formato do GT".

## 2. O que muda

- `data/regras-nome.ts`: "Ex-Presidentes da República" ganha `formaDoPeriodo: "no_periodo_ou_em_ano"`, como "Ex-Presidentes do Congresso". O cargo aceito passa a ser "Presidente da República Federativa do Brasil no período de AAAA a AAAA" (um ou mais períodos, "… e de AAAA a AAAA") ou "Presidente da República Federativa do Brasil em AAAA" para um único ano. "de AAAA a AAAA" sem "no período" passa a divergir, como já divergia no Congresso desde 05/11; o esperado é "Presidente da República Federativa do Brasil no período de AAAA a AAAA", e a regra do traço (06/11) vale igual.
- `data/regras-gt.ts`: entrada de 22/11 "Ex-Presidentes da República", texto "Cargo: Presidente da República Federativa do Brasil no período de AAAA a AAAA, ou em AAAA para um único ano (mesma forma do Congresso, regra de 05/11).", grupo "Ex-Presidentes da República".
- `comparacaoCargoExPresidente` (`lib/regras-cargo.ts`) não muda de lógica: a forma "de AAAA a AAAA" (sem `formaDoPeriodo`) fica no código, sem grupo que a use.

### 2.1 "Ex-Presidente" da composição confirma o cargo (adendo da noite de 22/11)

Depois do recálculo, os quatro ex-presidentes da República casados pela composição via IA continuavam "Cargo diverge": o grupo não tem fonte oficial cadastrada, a IA informa o cargo "Ex-Presidente da República", e a comparação por papel (`situacaoCampo`, `lib/match.ts`) acusa o prefixo "Ex-" presente só de um lado. Decisão do Clovis de 22/11 ("Sim, confirma"): nos grupos com `cargoComPeriodo` em `data/regras-nome.ts` (Ex-Presidentes da República e do Congresso), o "Ex-" do cargo é assunto da regra de escrita do GT (achado `cargo_ex_presidente`), não da comparação com a composição. `ContextoCargo` (`lib/cargo-tribunal.ts`) ganha `exPresidente: boolean`, ligado por `contextoCargoDoGrupo` quando o grupo tem `cargoComPeriodo`; com ele, `situacaoCampo` tira o prefixo "ex" (com ou sem hífen, "Ex-Presidente", "ex presidente", "Ex-Presidenta") dos dois lados antes da régua de papel, gênero e prefixo. "Ex-Presidente da República" (página ou IA) passa a conferir "Presidente da República Federativa do Brasil no período de 2011 a 2016"; "Vice-Presidente do Senado Federal" continua divergindo de "Presidente do Congresso Nacional em 2007" (o "vice" segue negante); fora desses dois grupos nada muda ("Ex-Senador" continua não confirmando "Senador"). O `valorEsperado` segue o cargo da composição. Vale nos quatro caminhos que chamam `situacaoCampo` com o contexto do grupo (página de grupo, IA, individual e lista de cargos). Nenhuma mudança na regra de ouro: a presença continua vindo da composição.

## 3. O que não muda

Prefixo "Presidente" no nome, grupo e precedência de `/repetidos` (o "ex-" é decidido pelo grupo), tratamento e endereçamento, mandatos não consecutivos (ainda a definir; o Fiscal aceita vários períodos).

## 4. Critérios de aceite

- "Presidente da República Federativa do Brasil no período de 2011 a 2016" e "… em 1985" não geram achado no grupo "Ex-Presidentes da República".
- "Presidente da República Federativa do Brasil de 2011 a 2016", "Ex-Presidente da República" e o cargo sem período divergem, com "Presidente da República Federativa do Brasil no período de AAAA a AAAA" como esperado.
- "Ex-Presidente da República" da composição (origem `conhecimento` ou `pagina`) confere com "Presidente da República Federativa do Brasil no período de 2011 a 2016" no grupo "Ex-Presidentes da República"; "Ex-Presidente do Senado Federal" confere com "Presidente do Congresso Nacional no período de 2007 a 2009" no Congresso; "Vice-Presidente do Senado Federal" segue divergente; em "Senadores", "Ex-Senador" segue não confirmando "Senador".
- Quadro "Regras do GT em vigor" com a entrada de 22/11, que diz também que "Ex-Presidente" da composição confirma o cargo.
- Suíte, typecheck e build verdes; coleta nova (ou recálculo do retrato) com os quatro ex-presidentes da República sem o achado.
