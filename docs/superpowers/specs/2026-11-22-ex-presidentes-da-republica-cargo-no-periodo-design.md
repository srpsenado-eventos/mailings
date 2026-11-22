# Ex-Presidentes da República: cargo no formato do Congresso

Data: 2026-11-22. Decisão do Clovis de 22/11, depois da coleta de 21/11: nas divergências de cargo dos Ex-Presidentes da República, considerar a regra que já estava fixada em 05/11 para os ex-presidentes do Congresso (spec 2026-11-05 §7.2). Adendo curto à spec 2026-10-30 §3.5. Tudo o que não está aqui permanece; a regra de ouro do "possível saída" não muda.

## 1. O problema

A regra de 30/10 esperava para a República "Presidente da República Federativa do Brasil de AAAA a AAAA". O Contatos de 21/11 escreve o cargo como o do Congresso, "Presidente da República Federativa do Brasil no período de 2011 a 2016", e a coleta de 21/11 acusou os quatro ex-presidentes com "Cargo de ex-presidente fora do formato do GT".

## 2. O que muda

- `data/regras-nome.ts`: "Ex-Presidentes da República" ganha `formaDoPeriodo: "no_periodo_ou_em_ano"`, como "Ex-Presidentes do Congresso". O cargo aceito passa a ser "Presidente da República Federativa do Brasil no período de AAAA a AAAA" (um ou mais períodos, "… e de AAAA a AAAA") ou "Presidente da República Federativa do Brasil em AAAA" para um único ano. "de AAAA a AAAA" sem "no período" passa a divergir, como já divergia no Congresso desde 05/11; o esperado é "Presidente da República Federativa do Brasil no período de AAAA a AAAA", e a regra do traço (06/11) vale igual.
- `data/regras-gt.ts`: entrada de 22/11 "Ex-Presidentes da República", texto "Cargo: Presidente da República Federativa do Brasil no período de AAAA a AAAA, ou em AAAA para um único ano (mesma forma do Congresso, regra de 05/11).", grupo "Ex-Presidentes da República".
- `comparacaoCargoExPresidente` (`lib/regras-cargo.ts`) não muda de lógica: a forma "de AAAA a AAAA" (sem `formaDoPeriodo`) fica no código, sem grupo que a use.

## 3. O que não muda

Prefixo "Presidente" no nome, grupo e precedência de `/repetidos` (o "ex-" é decidido pelo grupo), tratamento e endereçamento, mandatos não consecutivos (ainda a definir; o Fiscal aceita vários períodos).

## 4. Critérios de aceite

- "Presidente da República Federativa do Brasil no período de 2011 a 2016" e "… em 1985" não geram achado no grupo "Ex-Presidentes da República".
- "Presidente da República Federativa do Brasil de 2011 a 2016", "Ex-Presidente da República" e o cargo sem período divergem, com "Presidente da República Federativa do Brasil no período de AAAA a AAAA" como esperado.
- Quadro "Regras do GT em vigor" com a entrada de 22/11.
- Suíte, typecheck e build verdes; coleta nova (ou recálculo do retrato) com os quatro ex-presidentes da República sem o achado.
