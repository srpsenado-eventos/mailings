# Governadores eleitos: sites de campanha como fonte provisória

Data: 2026-10-26. Pedido e respostas do Clovis em 26/10, depois do 2º turno de 25/10. Complementa a spec `2026-10-23-leitura-resiliente-e-revisao-do-catalogo-design.md` (fonte individual provisória) e a `2026-10-15-fontes-individuais-por-contato-design.md` (fonte individual por UF).

## 1. Problema

Os governadores eleitos com mandato novo (Ata 14 do GT: vão para o grupo "Governadores Eleitos") não têm página oficial: o governo do estado ainda é do antecessor. No 2º turno, três UFs elegeram quem não é o governador atual: ES (Lorenzo Pazolini), RN (Cadu de Lula) e TO (Vicentinho Júnior). Hoje o grupo "Governadores Eleitos" não tem fonte no catálogo, e todo contato dele sai vermelho, "cadastrar fonte".

O Clovis forneceu, em 26/10, os sites de campanha dos três. Responderam ao `fetch` simples em 26/10 com o nome do eleito no texto:

| UF | URL | Conferência de 26/10 |
|---|---|---|
| ES | `https://lorenzopazolini10.com.br/` | 200, 9 KB, nome 5 vezes, título "Lorenzo Pazolini \| Governador 10" |
| RN | `https://cadudelula.com.br/` | 200, 31 KB, nome 18 vezes |
| TO | `https://vicentinho45.com.br/` | 200, 88 KB, nome 43 vezes |

AC (Mailza Assis) e DF (Celina Leão) foram reeleitas e ficam em "Governadores" (Ata 14); a página da governadora do AC entrou no catálogo em 26/10 (PR #18). O portal `df.gov.br` não traz o nome da governadora e não entrou.

## 2. Decisões do Clovis (26/10)

1. **Cadastrar** os três sites de campanha como fonte individual **provisória** do grupo "Governadores Eleitos", ligados por UF.
2. **Só o nome.** O site confere o nome do eleito; o cargo fica sem fonte (o site diz "Governador 10", nunca "Governador eleito do Estado de…", e daria divergência falsa).
3. **Texto próprio:** "Fonte provisória: site de campanha", separado do "Fonte provisória: notícia" de PE e DF.
4. **Validade até a posse.** A pergunta ofereceu "até a posse, 1º/01". Pela Emenda Constitucional 111/2021, a posse dos governadores eleitos em 2026 é em **6/1/2027**; vale a posse, que é a intenção da resposta. A fonte vale até 5/1/2027, inclusive, e deixa de ser lida a partir de 6/1/2027.

Regras herdadas: regra de ouro do "possível saída"; URL só por fornecimento do Clovis; sem PII em log.

## 3. Regras

### 3.1 Tipo de fonte provisória

`FonteIndividual.provisoria` deixa de ser `true` e passa a dizer **de que tipo** é: `provisoria?: "noticia" | "campanha"`. PE e DF passam a `"noticia"`. `ResultadoContato.provisoria` leva o mesmo tipo; retrato antigo traz `true`, que a tela e o export leem como `"noticia"`.

Textos (`lib/painel.ts`): `"Fonte provisória: notícia"` e `"Fonte provisória: site de campanha"`. O cabeçalho do grupo mostra um texto por tipo presente entre os contatos do grupo; a linha do contato e o export, o do contato.

### 3.2 Domínio

A regra 1 do checklist do catálogo ganha a segunda exceção: **site de campanha** (domínio que não é oficial) entra **só** como fonte individual `provisoria: "campanha"` do grupo "Governadores Eleitos", com `campos: ["nome"]` e `validaAte`. Em nenhum outro grupo e com nenhum outro tipo um domínio não oficial entra. O teste do catálogo garante isso.

### 3.3 Validade

`FonteIndividual.validaAte?: string` (data `AAAA-MM-DD`, inclusive, no fuso de Brasília). Fonte com `validaAte` anterior ao dia da varredura é ignorada, como se estivesse inativa: o contato volta a "Sem fonte individual cadastrada" (vermelho, "cadastrar fonte"), nunca possível saída. O filtro fica em `lib/analise.ts`, que já tem o relógio (`deps.agora`). Os três sites levam `validaAte: "2027-01-05"`. PE e DF continuam sem `validaAte` (saem à mão, como decidido em 23/10).

### 3.4 O que não muda

- Ligação por UF (`ufDoContato`), leitura por `fetch` (sem navegador), repetição com espera, memória de leitura, `falhas` e as regras de nome valem como em qualquer fonte individual.
- O grupo "Governadores Eleitos" continua sem fonte de grupo; contato de UF sem site sai "cadastrar fonte", como hoje.
- Enquanto o GT não cadastrar os eleitos no Contatos com o rótulo "Governadores Eleitos", o grupo não aparece no retrato e as fontes não são lidas (individual sem contato ligado não é lida).

## 4. Testes

- `catalogo-dados.test.ts`: "Governadores Eleitos" com 3 individuais (ES, RN, TO), todas `provisoria: "campanha"`, `campos: ["nome"]`, `validaAte: "2027-01-05"`; domínio não oficial só nessas três; PE e DF `provisoria: "noticia"`; grupos com individuais passam a ser Governadores, Governadores Eleitos e Ministros de Estado.
- `analise-individual.test.ts`: fonte com `validaAte` vencida não é lida e o contato sai "Sem fonte individual cadastrada", sem possível saída; no último dia ainda é lida; contato com fonte de campanha leva `provisoria: "campanha"`.
- `painel.test.ts` e `export.test.ts`: texto da campanha no cabeçalho, na procedência e no export; `true` de retrato antigo lido como notícia.

## 5. Entrega

Branch `feat/governadores-eleitos-campanha`, implementação por subagente com revisão, `npm test`, `typecheck`, `build`, PR (o Clovis abre e mescla: o token desta máquina não abre PR), deploy automático e a coleta nova.
