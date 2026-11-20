# Onda de correção da revisão final (v2 do gabarito, 19/11)

## Por achado
- Importante 1: `trocarCampos` (lib/analise-complementar.ts) troca só comparações sem `achado`; as de coerência do grupo ficam. Teste: "achado de coerência do grupo no mesmo campo não é trocado nem duplicado pela página complementar" (tests/analise-complementar.test.ts). RED antes da correção (`npx vitest run tests/analise-complementar.test.ts`): `expected [...] to have a length of 1 but got 2`; GREEN depois (11 testes).
- Importante 2: parágrafo "Resultado da conferência de leitura (19/11)" no fim do §2.2 da spec e critério do §4 ajustado (PB/RO principal; SP/TO/DF só alternativa; AC fora; CE https).
- Menor, DF: comentário de data/catalogo.ts atualizado (medição de 19/11 acha o nome; a extração não rende pessoa com cargo).
- Menor, ligação: `aplicarComplementares` liga por `fonteIndividualDe(resultado.contato, ...)`; parâmetro `contatos` e a guarda de tamanho removidos (chamada em lib/analise.ts ajustada).
- Menor, regras por grupo: `regrasDoGrupo` só soma o canônico quando `modoDoGrupo === "fonte"` (lib/agrupador não importa regras-gt nem catalogo: sem ciclo). Teste de tests/regras-gt.test.ts ajustado (indicados: só "Ministros de Estado indicados"; "Ministros de Estado" mantém a regra da CGU).
- Menor, /grupos: `GrupoCadastro.paginasComplementares`; `fontesIndividuais` conta só as comuns; a tela mostra "1 página complementar" / "N páginas complementares". Teste em tests/catalogo.test.ts.
- Menor, tests/regras-cargo.test.ts: caso "Governador ELEITO DO ESTADO DO PARÁ" -> "Governador ELEITO DO estado DO PARÁ".
- CLAUDE.md: contagem da suíte, frase dos Ministros de Estado, passo 5 do catálogo (complementar) e trava de qualidade (complementar caída não trava).

## Verificação
`npm run typecheck`: limpo. `npm test`: 87 arquivos, 2282 testes, verde.
