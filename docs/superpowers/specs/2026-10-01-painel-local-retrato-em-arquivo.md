# Painel local com retrato em arquivo — Design

**Status:** Aprovado para plano de implementação
**Data:** 2026-10-01
**Autor:** Clovis Sabino (Senado Federal), com sessão `superpowers:brainstorming`
**Substitui parcialmente:** `2026-09-04-varredura-continua-posse-2027-design.md` (fica o modelo "abrir o app e ver o último retrato, com data"; caem o Vercel Blob, a senha, o cron e a varredura rodando na Vercel) e `2026-06-04-fiscal-de-mailings-design.md` (modelo "resultado só na sessão")
**Complementa:** `2026-10-01-auditoria-de-endereco-camada-d.md` (a seção 6, "Tela e planilha", é implementada aqui), `2026-06-06-upload-no-cliente-e-resiliencia.md` (a leitura das planilhas continua no navegador)
**Mockup aprovado em 2026-09-30:** `https://claude.ai/artifact/6HjpnkA5eS2Wd2DTfqv3u3` (artboards "Resultado — lista com os cinco campos" e "Envio — duas planilhas"; o artboard "Contato aberto", a ficha lateral, fica de fora)

---

## 1. Problema

O spec de 2026-09-04 decidiu que o app abre mostrando o último retrato da varredura, com data, em vez de exigir upload a cada consulta. O plano daquele spec tem dez tarefas e nenhuma foi executada: as sessões seguintes entregaram as camadas de verificação (tratamento, regras de nome, segunda fonte dos senadores, endereço) dentro do modelo antigo de upload. A produção na Vercel, com o PR #2 mesclado em 2026-10-01, mostra a mesma tela de upload de junho, agora com dois arquivos.

Duas medições mudaram o desenho de 04/09:

1. **A Vercel não lê as fontes oficiais** (medido em 2026-09-17): STJ e TSE devolvem HTTP 403 e STM e TST devolvem página ilegível para a faixa de IP de datacenter, enquanto a mesma versão do código lê as quatro de uma conexão comum. Varredura na nuvem, com ou sem Chromium, não resolve bloqueio por IP.
2. **O que o GT precisa ver está no mockup de 30/09**: a linha do contato mostra estados por campo, não valores; os valores ficam no detalhe, cada um dizendo de onde veio; o endereço tem bloco próprio porque é o único campo com duas procedências. A Fase 1 da auditoria de endereço entregou só uma coluna de situação e um contador, e deixou o resto para "plano próprio" que nunca foi escrito.

## 2. Decisões do usuário (2026-10-01)

| Questão | Decisão |
|---|---|
| Onde a varredura roda | **Nesta máquina**, pelo app em `npm run dev`. A Vercel deixa de ser alvo: de lá as fontes não eram lidas. O deploy existente fica como sobra até ser desligado; nada novo depende dele |
| Como o retrato chega ao painel | O servidor local grava o retrato em arquivo, fora do git. O app abre lendo esse arquivo |
| Como as planilhas entram | Como hoje: o usuário escolhe os arquivos no navegador, a leitura é no navegador, só texto vai ao servidor. Mantém o spec de 06/06 e o fluxo "baixo a planilha nova do Sistema Contatos quando quero uma revisão" |
| Detalhe do contato | A linha **expande no lugar** (artboard "Resultado"). A ficha lateral não entra |
| Botões que implicam guardar algo ("Usar o endereço do relatório", "Confirmei por telefone") | **Não entram.** Só "Copiar", nos valores de referência e no endereço do relatório. O que foi confirmado por telefone se registra no Sistema Contatos, não aqui |
| Tela de envio | Entra, com os dois cartões (contatos e endereços, opcional). O cartão dos Correios fica para a Fase 2; o aviso de grupos sem fonte fica no painel, onde já existe |
| Senha, Blob, cron, Chromium, investigação por busca | Fora deste spec. Senha e Blob só fariam sentido com o app na nuvem; cron e investigação são o plano seguinte |

## 3. Visão geral

```
[contatos.xlsx] + [enderecos.xlsx]  --lidos no navegador-->  POST /api/analise
                                                                   │
                     fontes oficiais  <--- esta máquina lê ---      │ analisar()
                                                                   v
                                                       Armazem.gravarRetrato()
                                                                   │
                                                          .fiscal/retrato.json
                                                                   │
                                   /  (painel)  <--- Armazem.lerRetrato() ---┘
```

- **`/nova-varredura`**: os dois cartões do mockup. O usuário escolhe os arquivos, vê nome e contagem antes de varrer, e clica "Varrer N grupos". O servidor roda `analisar` como hoje, grava o retrato e devolve; o navegador vai para `/`.
- **`/` (painel)**: Server Component que lê o retrato pelo `Armazem` e renderiza. Sem retrato, redireciona para `/nova-varredura`.
- **Export**: "Baixar planilha" gera o XLSX a partir do retrato, com as colunas de hoje.

A lógica das camadas (Camada 1, 2, A, B, C e D) não muda. O retrato é o `ResultadoAnalise` de hoje envolto em metadados.

## 4. Armazenamento

`lib/armazem.ts`:

```ts
export interface Armazem {
  lerRetrato(): Promise<Retrato | undefined>;
  gravarRetrato(retrato: Retrato): Promise<void>;
}
export function armazemEmMemoria(inicial?: Retrato): Armazem;
export function armazemEmArquivo(caminho: string): Armazem;
```

- A implementação em arquivo grava `JSON.stringify(retrato)` em `.fiscal/retrato.json` na raiz do projeto, criando a pasta se não existir, com escrita atômica (grava em arquivo temporário ao lado e renomeia). Leitura: arquivo ausente devolve `undefined`; JSON inválido ou sem `geradoEm` lança `RetratoIlegivelError`.
- `.fiscal/` entra no `.gitignore`. O retrato contém nome, telefone, e-mail e endereço das autoridades: **nunca entra no git**, nunca vai para `console.*`.
- A rota recebe o `Armazem` por injeção, como já recebe `raspar` e `extrairComposicao`. Em teste, `armazemEmMemoria`.
- Um retrato só. Não há histórico; "mudou desde a última varredura" é plano seguinte.

## 5. Modelo de dados

Em `lib/types.ts`, ao lado dos tipos existentes:

```ts
export interface Retrato extends ResultadoAnalise {
  /** Hora em que a varredura terminou, ISO 8601. */
  geradoEm: string;
  /** Nome e linhas lidas da planilha de contatos. `arquivoNome` de ResultadoAnalise continua. */
  planilhaContatos: { nome: string; linhas: number };
  /** Presente só quando a planilha de endereços foi enviada. */
  planilhaEnderecos?: { nome: string; linhas: number };
}
```

`ResumoAnalise` ganha dois contadores, porque os seis cartões do mockup não batem um a um com os cinco de hoje:

```ts
  /** Contatos marcados `possivelSaida`. Subconjunto de `vermelho`. */
  possivelSaida: number;
  /** Contatos de grupo sem URL cadastrada. Subconjunto de `vermelho`. */
  contatosSemFonte: number;
```

`vermelho`, `verde`, `amarelo`, `novo` e `indeterminado` continuam como estão, para o export e os testes existentes.

`ResultadoGrupo` ganha `responsavel?: string` (o `responsavel1` do grupo no catálogo), e `FonteResolvida` passa a carregá-lo para o orquestrador preencher. Só o nome; e-mails não saem do catálogo.

`PayloadAnalise` ganha nada: nome e contagem das planilhas já viajam (`arquivoNome`, `arquivoEnderecosNome`, `contatos.length`, `enderecos.length`). A rota monta o retrato.

## 6. Telas

Tudo conforme o mockup. Onde o mockup e o código divergem em rótulo, vale o rótulo que o código já usa (semântica dos vereditos do `CLAUDE.md` e rótulos da Fase 1), para não haver dois nomes para a mesma coisa.

### 6.1 Painel (`/`)

**Cabeçalho.** Título; "Contatos *nome.xlsx* · Endereços *nome.xlsx* · varredura de 01/10, 14h12" (sem o trecho de endereços quando não houve a segunda planilha); botões "Nova varredura" (vai para `/nova-varredura`) e "Baixar planilha" (XLSX, como hoje; o CSV continua disponível ao lado).

**Seis cartões**, nesta ordem, com o número grande e o rótulo embaixo:

| Cartão | Conta |
|---|---|
| Conferem | `resumo.verde` |
| Com divergência | `resumo.amarelo` |
| Possível saída | `resumo.possivelSaida` |
| Não verificados | `resumo.indeterminado + resumo.contatosSemFonte` |
| Propostas de inclusão | `resumo.novo` |
| Endereços a confirmar | `resumo.enderecosAConfirmar` |

**Filtros**, no navegador, sem nova chamada: "Tudo", "Só o que tem ressalva" (tudo que não é verde com endereço completo, a completar ou sem base), "Endereço a confirmar" (`endereco.situacao === "pendente"`), "Possível saída", "Propostas de inclusão" (só os novos). Busca por nome, cargo ou órgão, com `normalizarTexto` dos dois lados. Grupo sem linha depois do filtro some da lista; o cabeçalho do painel diz "N contatos de M" quando há filtro ativo.

**Grupo.** Nome; "N contatos · responsável Fulana"; estado da fonte, com os mesmos quatro casos de hoje e os mesmos textos: link "abrir fonte"; "Fonte inacessível, confira à mão: *motivo*"; "Sem fonte cadastrada (você quis dizer: …)"; "≈ via IA — confira". A ressalva de leitura parcial ("uma fonte não respondeu: *motivo*") continua no cabeçalho do grupo.

**Linha do contato**, quatro colunas:

1. **Contato**: nome, e abaixo, em letra menor, tratamento · endereçamento do cadastro. Quando o contato é possível saída, não verificado ou novo, a linha de baixo traz o motivo: "Não consta na fonte — confirmar se saiu", "Fonte fora do ar — confira à mão", "Sem fonte cadastrada", "Está na fonte, falta no cadastro".
2. **Cargo no cadastro**: `contato.cargo` ou "—".
3. **Campos conferidos**: etiquetas curtas, uma por campo, na ordem nome, cargo, tratamento, endereçamento, endereço. Regras em `lib/painel.ts` (§7).
4. **Situação**: "Tudo confere", "N a revisar", "Possível saída", "Não verificado", "Sem fonte", "Avaliar inclusão".

**Detalhe**: o nome é um `<button aria-expanded>`; clicar expande a linha no lugar, abaixo dela, sem fechar as outras. Conteúdo:

- Um cartão por campo que tem comparação: rótulo do campo e sua etiqueta; "No cadastro" com o valor da planilha; "Site do órgão diz" ou "Tabela de protocolo diz" com o valor esperado, marcado "(via IA — confira)" quando `origemValor === "conhecimento"`. Campo `fonte_nao_informa` sai como "o site não informa"; `sem_regra` como "sem regra de protocolo para este cargo". Achados de coerência (Camadas A e C) saem como linha de texto no cartão do campo, com `textoCoerencia`. Botão **Copiar** ao lado do valor esperado quando ele existe e diverge.
- **Bloco de endereço**, quando `endereco.situacao !== "sem_base"`: "Endereço" e a etiqueta; "No cadastro" com `contato.endereco` (texto livre, ou "(vazio)"); "No relatório de endereços" com os campos estruturados em três linhas (logradouro e número; complemento e bairro; CEP, cidade e UF), ou "sem linha no relatório" quando não há `endereco.endereco`; os achados com `rotuloAchadoEndereco`, um por linha; a linha fixa "Correios: não conferido nesta versão"; botão **Copiar** que copia o texto de `textoEnderecoParaCopiar` (§7), presente só quando há endereço anexado.
- **De onde veio cada resposta**: "Nome e cargo — *URL da fonte*, lido em *hora da varredura*"; "Tratamento e endereçamento — tabela de protocolo (Posse2027_TabelaTratamentos.xlsx)"; "Endereço — *nome da planilha de endereços*" (só com a segunda planilha).

**Novos** (pessoas da fonte sem par na planilha): linha com nome, "—" no cargo do cadastro, etiqueta "Site: *cargo*" (e "via IA" quando for), situação "Avaliar inclusão", motivo "Está na fonte, falta no cadastro". Sem detalhe expansível.

### 6.2 Nova varredura (`/nova-varredura`)

Título "Nova varredura" e a frase do mockup sobre leitura no navegador. Dois cartões:

1. **Contatos e grupos**, obrigatório: seletor de arquivo `.xlsx`/`.csv`; depois de lido, "nome.xlsx · N contatos · M grupos" e botão "Trocar". `ColunaFaltanteError` sai no cartão com a mesma mensagem de hoje.
2. **Relatório de endereços**, opcional, com a etiqueta "opcional" e a frase do mockup; depois de lido, "nome.xlsx · N endereços" e "Trocar".

Botão "Varrer N grupos", habilitado só com o primeiro cartão lido; N é a contagem de rótulos distintos da coluna Grupo. Durante a varredura: "Varrendo…" e botão desabilitado. Resposta `ok: false`: mensagem no lugar do botão, como hoje. Resposta `ok: true`: navega para `/`.

Os dois cartões não disparam nada ao escolher o arquivo; só o botão varre. Isso corrige o fluxo da Fase 1, em que a análise disparava ao escolher os contatos e a planilha de endereços tinha que vir antes.

### 6.3 Aparência

A do mockup: IBM Plex Sans para texto e Newsreader para títulos, carregadas por `next/font/google`; fundo creme `#F7F5F0`, texto `#1A1A17`, cinza `#5B5B54`, azul de ação `#1F5D7A`, verde `#1F6B45`, âmbar `#8A5A00` sobre `#FBEFD6`, vermelho para possível saída. Declaradas como tokens `@theme` em `app/globals.css` (Tailwind v4) e usadas por classe. Sem biblioteca de componentes nova; sem emoji nos contadores (o painel de hoje usa 🟢🟡🔴, isso sai). A página `/grupos` não muda nesta entrega, só herda fonte e fundo.

## 7. Lógica pura do painel

`lib/painel.ts`, sem JSX, testado no Vitest. Os componentes só chamam estas funções e renderizam.

```ts
export type Etiqueta = { campo: "nome" | "cargo" | "tratamento" | "enderecamento" | "endereco" | "fonte"; texto: string; tom: "ok" | "atencao" | "neutro" | "ruim" };
export function etiquetasDoContato(c: ResultadoContato, g: ResultadoGrupo): Etiqueta[];
export function situacaoDoContato(c: ResultadoContato, g: ResultadoGrupo): { texto: string; tom: Etiqueta["tom"] };
export function motivoDoContato(c: ResultadoContato, g: ResultadoGrupo): string | undefined;
export type Filtro = "tudo" | "ressalva" | "endereco" | "saida" | "inclusao";
export function filtrarGrupos(grupos: ResultadoGrupo[], filtro: Filtro, busca: string): ResultadoGrupo[];
export function cartoesDoResumo(r: ResumoAnalise): { rotulo: string; valor: number }[];
export function textoEnderecoParaCopiar(e: EnderecoEstruturado): string;
export function montarRetrato(resultado: ResultadoAnalise, planilhas: { contatos: { nome: string; linhas: number }; enderecos?: { nome: string; linhas: number } }, agora: Date): Retrato;
```

Regras das etiquetas, por campo:

| Campo | Fonte da etiqueta | Textos |
|---|---|---|
| nome, cargo | `comparacoes` do campo | `confere` → "Nome confere"; `divergente` → "Cargo diverge"; `fonte_nao_informa` → omitida; sem comparação por fonte inacessível ou sem fonte → "Nome não verificado" |
| tratamento, endereçamento | `comparacoes` do campo, Camadas A, B e C | `confere` → "Tratamento confere"; `divergente` ou achado de coerência visível → "Tratamento diverge"; `sem_regra` → "Tratamento sem regra" (tom neutro, não é divergência) |
| endereço | `endereco.situacao` | `completo` → "Endereço completo"; `a_completar` → "Endereço a completar" (neutro); `pendente` → "Endereço a confirmar" (atenção); `nao_verificado` → "Endereço não verificado"; `sem_base` → omitida |
| fonte | `possivelSaida` | "Sem par na fonte" (ruim), e as etiquetas de nome e cargo são omitidas, porque não há com o que comparar |

Situação: "Possível saída" se `possivelSaida`; "Sem fonte" se `g.semFonte`; "Não verificado" se `semaforo === "indeterminado"`; "Tudo confere" se nenhuma etiqueta de atenção ou ruim; senão "N a revisar", N = etiquetas de atenção ou ruim. A etiqueta de endereço `a_completar` **não** conta como revisar: é trabalho dos Correios (Fase 2), não do telefone.

`textoEnderecoParaCopiar` monta as mesmas três linhas do bloco, só com os campos presentes, CEP como está no relatório (sem formatar, sem propor zero à esquerda). Não é o `formatado` da Fase 1, que continua existindo só em `completo`.

## 8. Rotas e componentes

| Caminho | Papel |
|---|---|
| `app/page.tsx` | Server Component. Lê o retrato por `armazemEmArquivo(".fiscal/retrato.json")`; sem retrato, `redirect("/nova-varredura")`; retrato ilegível, mensagem e link para nova varredura. Passa o retrato ao painel |
| `components/painel.tsx` | Client Component (filtro, busca e linhas expandidas são estado). Cabeçalho, cartões, filtros, grupos |
| `components/linha-contato.tsx` | Linha e detalhe expansível de um contato; botão Copiar com `navigator.clipboard` |
| `components/etiqueta.tsx` | Uma etiqueta, por `tom` |
| `app/nova-varredura/page.tsx` + `components/nova-varredura-form.tsx` | A tela de envio. Substitui `components/upload-zone.tsx`, que sai |
| `app/api/analise/route.ts` | Como hoje, mais: monta o retrato com `montarRetrato` e grava pelo `Armazem` antes de responder. Resposta passa a `{ ok: true, retrato }`. Falha na gravação: responde `{ ok: true, retrato, aviso: "não foi possível guardar o retrato" }` e loga só o motivo técnico |
| `components/export-buttons.tsx` | Como hoje, recebendo o retrato |
| `components/resultado-tabela.tsx`, `components/semaforo-badge.tsx`, `lib/celula-divergencias.ts` | Saem, substituídos pelos componentes acima e por `lib/painel.ts`. Os testes de `celula-divergencias`, se houver, migram para `painel.test.ts` |

`export const maxDuration = 60` e `runtime = "nodejs"` saem da rota: eram diretivas da Vercel, e a varredura local de 33 grupos pode passar de um minuto.

## 9. Falhas

| Falha | Comportamento |
|---|---|
| Sem retrato | `/` redireciona para `/nova-varredura` |
| Retrato ilegível (JSON corrompido, campo faltando) | `/` mostra "O último retrato não pôde ser lido" e o botão "Nova varredura". Não apaga o arquivo |
| Gravação do retrato falha (disco, permissão) | O resultado aparece no painel desta sessão, com o aviso no cabeçalho; a próxima abertura do app não o terá |
| Fonte inacessível, leitura parcial, sem fonte | Como hoje; os textos de hoje migram para o cabeçalho do grupo e o motivo do contato |
| Planilha sem coluna obrigatória | `ColunaFaltanteError` no cartão, antes de varrer |
| `navigator.clipboard` indisponível | O botão Copiar some; o valor continua selecionável |

## 10. Testes

- `tests/armazem.test.ts`: memória; arquivo em pasta temporária (grava, lê, ausente devolve `undefined`, JSON inválido lança `RetratoIlegivelError`, escrita atômica deixa só o arquivo final).
- `tests/painel.test.ts`: cada regra da tabela de etiquetas; situação com e sem `a_completar`; os cinco filtros e a busca com acento; os seis cartões a partir de um resumo; `textoEnderecoParaCopiar` com campos faltando; `montarRetrato` com e sem planilha de endereços.
- `tests/analise.test.ts`: `resumo.possivelSaida` e `resumo.contatosSemFonte` nos três caminhos; `responsavel` preenchido a partir do catálogo.
- Componentes continuam sem teste automatizado. Conferência manual com as duas planilhas reais de `Bases de comparação -PLANILHAS CONTATOS/`: os seis cartões somam o que o resumo diz, filtros e busca batem, Copiar funciona, o app reaberto mostra a varredura anterior com a hora certa.

## 11. Segurança e PII

- `.fiscal/` fora do git. O retrato é a única persistência e fica só nesta máquina.
- Log do servidor: como hoje, só motivo técnico. `montarRetrato` e o `Armazem` não logam nada.
- A Vercel não recebe nada novo. Como a rota grava em disco, um deploy lá falharia ao gravar e seguiria pelo caminho "não foi possível guardar"; isso é aceitável porque a Vercel deixa de ser alvo e não há dado persistido lá.
- Responsável do grupo: só o nome, que já está em `data/catalogo.ts`. O spec de 04/09 queria tirar os responsáveis do repositório público; continua pendente e fora deste spec.

## 12. Regras do projeto que este spec altera

| Regra atual (`CLAUDE.md`) | Nova regra |
|---|---|
| Não persistir resultados de análise | O último retrato persiste em `.fiscal/retrato.json`, fora do git. Um só; sem histórico. "Sem banco de dados" continua |
| Stack: Vercel | A Vercel sai da stack. O app roda local com `npm run dev`. O deploy existente é sobra até ser desligado |
| UI sem lógica de negócio | Continua. A lógica de apresentação (etiquetas, filtros, cartões) é função pura em `lib/painel.ts` |
| Spec 2026-09-04 "Vigente" | Passa a "Parcialmente substituído por 2026-10-01 (painel local)": fica o modelo de retrato com data; caem Blob, senha, cron e varredura na nuvem |

O `CLAUDE.md` é atualizado na última tarefa do plano, com a linha deste spec na tabela e as regras acima.

## 13. Fora de escopo

- "Mudou desde a última varredura" (dois retratos). Plano seguinte, pequeno, sobre o `Armazem` daqui.
- Investigação por busca, Chromium, fontes propostas (§8 do spec de 04/09).
- Conferência nos Correios (Fase 2 do spec de endereço).
- Ficha lateral do contato; marcar "confirmado por telefone"; "usar o endereço do relatório".
- Redesenho de `/grupos`.
- Senha e multiusuário.
- Tirar os responsáveis do repositório público.

## 14. Riscos e trade-offs aceitos

- **Um retrato só.** Varrer de novo substitui o anterior. Aceito: o GT trabalha a partir do mais recente; o histórico é o plano seguinte.
- **Varredura longa sem progresso.** Local não há teto de 60 s, mas 33 grupos podem levar mais de um minuto e a tela só diz "Varrendo…". Aceito nesta entrega; progresso por grupo exige checkpoint, que é parte do plano seguinte.
- **Componentes sem teste.** Como hoje. A lógica que decide o que aparece está em `lib/painel.ts` e é testada.
- **A Vercel continua no ar com a versão antiga** até ser desligada. Não há PII persistida lá, então o risco é só de confusão.
