# Gabarito de conferência: eleitos, presidentes de tribunal, Presidente da Câmara e indicados

Data: 2026-11-19. Decisões do Clovis de 19/11, depois da conferência do "Gabarito de conferência por grupo · Posse Presidencial 2027" (edição de 11/11/2026, versão 8, revisado pelas conferentes de RP) contra o Fiscal, grupo a grupo. Spec curta: as mudanças são pontuais e não alteram arquitetura. Tudo o que não está aqui permanece como nas specs anteriores; a regra de ouro do "possível saída" não muda.

## 1. Intenção

O gabarito é o que as conferentes usam para conferir nome, cargo, tratamento e endereçamento de cada grupo. O Clovis conferiu as 14 abas contra a tela do Fiscal e concluiu que as regras e os links já batem, com cinco pontos a ajustar no Fiscal para que ele acuse o que o gabarito acusa e aceite o que o gabarito aceita. Mais dois retornos do GT que chegaram em 19/11 (eleitos e ministros indicados). A coleta seguinte, com a base nova do Contatos, já deve sair com essas regras.

## 2. Decisões

### 2.1 Eleitos: tratamento e endereçamento fixos

Grupos do agrupador "Senadores eleitos - Posse Presidencial 2027", "Deputado Federal eleitos - Posse Presidencial 2027" e "Governadores eleitos - Posse Presidencial 2027" (modo `lista`): tratamento **"Senhor" / "Senhora"** e endereçamento **"Ao Senhor" / "À Senhora"** (gabarito, abas dos eleitos; o Contatos já foi ajustado em 19/11). Gênero pelo cadastro (`contatoEhFeminino`). Vale por cima da tabela e dos pares, como os Chefes de Estado (spec 2026-11-13 §3.5): `protocoloFixo` passa a decidir também por esses três rótulos (constantes de `data/grupos-posse.ts`, já importadas em `lib/protocolo-fixo.ts`). `origemValor: "regra_gt"`.

O cargo fica como está no Contatos ("Senador(a) eleito(a)", "Deputado(a) Federal eleito(a)", "Governador(a) eleito(a) do estado de X"): o retrato de 08/11 já o confere nos 30 contatos, pela comparação por papel. Nada muda no cargo.

### 2.2 Presidentes de tribunal: "Excelentíssimo" só no STF

Nos seis grupos de tribunal (`GRUPOS_DE_TRIBUNAL`), o contato cujo cargo começa com "Presidente" (nunca "Vice-") tem protocolo fixo: no STF, tratamento **"Excelentíssimo Senhor" / "Excelentíssima Senhora"**; no STJ, STM, TCU, TSE e TST, **"Senhor" / "Senhora"**; endereçamento **"A Sua Excelência o Senhor" / "A Sua Excelência a Senhora"** nos seis. É o que o gabarito fixa e o que o cadastro de 05 NOV já tem nos seis presidentes.

Substitui a regra de 05/11 ("Excelentíssimo(a) Senhor(a)" e "Senhor(a)" conferem): `tratamentoAceitoDoPresidente` (`lib/cargo-tribunal.ts`) sai do código e a entrada "Presidentes de tribunal" de 05/11 sai de `data/regras-gt.ts`, substituída pela de 19/11. A parte do nome ("Ministro(a)" antes) e do cargo (presidência no cargo) não muda.

### 2.3 Presidente da Câmara: "Deputado Federal" antes do nome

O Contatos já grava o nome do Presidente da Câmara como "Deputado Federal <Nome>" e o gabarito confirma ("o nome será antecedido pela palavra 'Deputado Federal'", exemplos "Deputado Federal Hugo Motta"). Hoje o Fiscal acusa "Nome diverge" (tira "Deputado", deixa "Federal").

`data/regras-nome.ts` ganha `"Presidente da Câmara dos Deputados": { prefixoDoPresidente: "deputado_federal" }`: o contato cujo cargo começa com "Presidente" leva "Deputado Federal " ou "Deputada Federal " antes do nome, no gênero do cadastro, como `"ministro"` nos tribunais. `PREFIXOS_ACEITOS` ganha o prefixo de duas palavras ("deputado federal", "deputada federal"); a separação do prefixo em `lib/tratamento.ts` passa a aceitar prefixo de mais de um token, e "deputado"/"deputada" entram em `TRATAMENTOS_ANTES_DO_PREFIXO` para não empilhar. A comparação com a página (que diz só "Hugo Motta") usa o núcleo sem o prefixo, e o esperado do achado `nome_sem_prefixo` leva o prefixo. Vale nos três caminhos (fonte, IA, sem fonte). O app nunca propõe tirar o prefixo.

Fora do escopo: Presidente do Senado (o gabarito não tem aba dele; a decisão de 30/10 de não levar prefixo continua até o Clovis dizer o contrário).

### 2.4 Ministros de Estado indicados

Grupo neutro do agrupador "Ministros de Estado Indicados - Posse 2027" (ainda sem contatos; a lista depende do retorno do GT). Decisão de 19/11: tratamento **"Senhor" / "Senhora"**; cargo "Ministro indicado da pasta X", escrito como nos ministros atuais, e **as duas formas são aceitas** até a lista chegar: "Ministro(a) indicado(a) de Estado d(a/o/e) <Pasta>" e "Ministro(a) indicado(a) d(a/o/e) <Pasta>".

- Tratamento: protocolo fixo por rótulo do agrupador, "Senhor(a)", `origemValor: "regra_gt"`.
- Endereçamento: **ainda sem decisão do GT**. Sai `sem_regra` com a observação "Endereçamento dos ministros indicados: a definir pelo GT", sem passar pela tabela nem pelos pares (a tabela acharia "Ministro de Estado" por similaridade e cobraria "A Sua Excelência", que ninguém decidiu). `ProtocoloFixo.enderecamento` passa a ser opcional para esse caso.
- Cargo: regra de escrita (Camada C, `lib/regras-cargo.ts`, ao lado de `comparacaoCargoExPresidente`): cargo que não casa nenhuma das duas formas é o achado novo `cargo_indicado`, divergente, com o esperado "Ministro(a) indicado(a) de Estado da [Pasta]" (a pasta copiada do cadastro quando o cargo já a traz depois de "de Estado" ou de "da/do/de"; senão "[Pasta]"). Gênero do esperado pelo cadastro. "Ministro de Estado da Fazenda" (sem "indicado") no grupo de indicados diverge, esperado "Ministro indicado de Estado da Fazenda". Cargo vazio continua sendo "Cargo vazio", não `cargo_indicado`.

### 2.5 STM: links informativos no cabeçalho do grupo

O gabarito cita, além da "Quem é Quem" (fonte de leitura, sem mudança), a "Composição da Corte" (só como referência de gênero) e a página do Manual de Comunicação do Senado sobre forma de tratamento (justifica tirar o Dr./Dra.). Entram no catálogo como **links informativos**, nunca como fonte de leitura (as patentes da Composição da Corte têm outra grafia e o grupo passaria a ter duas composições).

`GrupoCatalogo.linksInformativos?: readonly { titulo: string; url: string }[]`. No STM: `{ titulo: "Composição da Corte (referência de gênero)", url: "https://www.stm.jus.br/institucional/conheca-o-superior-tribunal-militar/composicao-da-corte?view=default" }` e `{ titulo: "Manual de Comunicação do Senado: forma de tratamento", url: "https://www12.senado.leg.br/manualdecomunicacao/estilos/forma-de-tratamento" }`. O cabeçalho do grupo no painel (`components/painel.tsx`, ao lado de "abrir fonte") mostra "Referências: <título> · <título>", cada um link em nova aba, no modo local e no web (o catálogo é código). Esses links não são lidos, não entram em `falhas`, na memória de leitura, na trava de qualidade nem no export. `tests/catalogo-dados.test.ts` exige domínio oficial também neles.

### 2.6 Quadro "Regras do GT em vigor" e documentação

`data/regras-gt.ts` ganha quatro entradas de 2026-11-19: "Eleitos" (grupos dos três eleitos), "Presidentes de tribunal" (substitui a de 05/11, mesmos seis grupos), "Presidente da Câmara: nome" (grupo "Presidente da Câmara dos Deputados") e "Ministros de Estado indicados" (grupo "Ministros de Estado Indicados - Posse 2027"). A entrada de 05/11 "Presidentes de tribunal" sai.

Mesmo PR: a spec e o plano de 13/11 (`docs/superpowers/specs/2026-11-13-…` e `docs/superpowers/plans/2026-11-13-…`), que ficaram fora do PR #40, entram no git; `CLAUDE.md` passa a registrar os PR #40 e #41 em produção, esta spec na tabela e as regras acima nos princípios.

## 3. O que não muda

- Links e fontes de todos os 14 grupos do gabarito: conferidos em 19/11, iguais aos do catálogo (STJ sem `?parametro=1`, STM sem `?view=default` e TST em `/en/` são a mesma página; as quatro URLs do TST respondem 200 em 19/11).
- Agrupador com 29 grupos; modos `fonte`, `lista` e `neutro`.
- Regra de ouro do "possível saída"; Camada D; eleição; repetidos; decisões; bloqueio.
- Tabela de tratamentos v02 (`data/tratamentos.ts`): não é editada; as regras novas vivem em `lib/protocolo-fixo.ts` e `data/regras-nome.ts`, por cima dela.
- DPU e PGR continuam `sem_regra` no protocolo (um contato, sem pares); o cadastro já está como o gabarito.

## 4. Abordagens consideradas

1. **Protocolo fixo por grupo e por cargo** (escolhida): o mecanismo já existe (`lib/protocolo-fixo.ts`, Chefes de Estado e presidentes do Congresso) e é a única camada que vale por cima da tabela e dos pares.
2. Entradas novas na tabela de tratamentos: a tabela é gerada do xlsx do GT e não é nossa para editar; e "Senador eleito" acharia "Senador" por similaridade.
3. Deixar nos pares: foi o que escondeu os 22 endereçamentos fora do gabarito (todos iguais entre si). Descartada.

## 5. Critérios de aceite

- Senador eleito com "A Sua Excelência o Senhor" sai amarelo, esperado "Ao Senhor"; com "Ao Senhor" sai "confere". Mesmo para deputados e governadores eleitos, nos dois gêneros.
- Presidente do STJ com "Excelentíssimo Senhor" sai amarelo, esperado "Senhor"; Presidente do STF com "Senhor" sai amarelo, esperado "Excelentíssimo Senhor". Vice-Presidente não entra.
- Presidente da Câmara cadastrado "Deputado Federal Hugo Motta", página "Hugo Motta": nome confere. Cadastrado "Hugo Motta": `nome_sem_prefixo`, esperado "Deputado Federal Hugo Motta".
- No grupo de indicados: "Ministro indicado de Estado da Fazenda" e "Ministra indicada da Saúde" conferem; "Ministro de Estado da Fazenda" diverge com esperado "Ministro indicado de Estado da Fazenda"; tratamento "Senhor" confere, endereçamento qualquer sai `sem_regra` com a observação.
- Cabeçalho do STM mostra os dois links de referência; `falhas` e `leituras` não os contêm.
- Suíte, typecheck e build verdes.
