# Leitura resiliente e revisão do catálogo — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A leitura das páginas oficiais falha menos (403 vai para o Chrome com janela; 429, 5xx e tempo esgotado são repetidos com espera; cada fonte pode ter URL alternativa), o app avisa quando uma URL está caída há duas coletas ou quando a composição de uma página mudou mais da metade (o que segura a publicação), duas regras de nome novas eliminam saídas falsas (nome mais curto na página individual; nome em que o Contatos prevalece), e o catálogo recebe as fontes da planilha de 23/10 (convocados do TST por marcador e do STJ por PDF, grupo novo Senadores fora de exercício, PGR, Ex-Presidentes do Senado, PE e DF provisórias, cinco URLs alternativas de ministérios).

**Architecture:** `lib/raspagem.ts` ganha o desvio 403→janela dentro de `rasparFonte` e o envoltório puro `comRepeticao`, aplicado pela rota. `lib/analise.ts` lê a URL alternativa quando a principal falha (dentro de `lerHoje`), procura a memória pela principal e pela alternativa, devolve a lista de URLs tentadas para o mapa `falhas` do retrato e detecta mudança de composição comparando a leitura de hoje com a guardada **antes** de qualquer reaproveitamento. `lib/memoria-leitura.ts` ganha as funções puras de `falhas` e de mudança. `lib/match.ts` ganha o nome mais curto em destaque e a exceção `nomesDoContatos`. `lib/scrape.ts` ganha a extração por marcador (HTML e PDF) e a leitura de PDF com `pdf-parse`. Catálogo, tela, export e docs recebem os campos e textos novos.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Vitest, cheerio, puppeteer-core. **Dependência nova: `pdf-parse` 2.4.5** (decisão registrada na spec §5.1; API de classe `PDFParse`, confirmar em `node_modules/pdf-parse/README.md` antes de usar).

**Spec:** `docs/superpowers/specs/2026-10-23-leitura-resiliente-e-revisao-do-catalogo-design.md` (ler antes de qualquer tarefa; "§" abaixo refere-se a ela). A spec da memória, `2026-10-20-memoria-de-leitura-por-pagina-design.md`, é pré-requisito já implementado em `main` (PR #15); "spec 20/10 §n" refere-se a ela.

## Global Constraints

- `lib/*.ts` são funções puras: sem JSX, sem `window`, sem rede fora de `lib/scrape.ts` e `lib/navegador.ts`. Toda função de `lib/` devolve objeto novo; nunca muta a entrada.
- **Sem PII no log nem no prompt.** Nome de contato nunca vai para `console.*`, `erroFonte`, `falhas[url].motivo`, `alternativa.motivoPrincipal` nem para a IA. `falhas` guarda só URL do catálogo, datas e motivo técnico.
- **Regra de ouro:** "possível saída" só com composição real. Nenhum mecanismo deste plano transforma falha de leitura em saída; nome mais curto em destaque é "Nome diverge", nunca saída.
- Esperas: `ESPERAS_REPETICAO_MS = [30_000, 120_000]` (§3.2); só falhas transitórias (HTTP 429, HTTP 5xx, tempo esgotado, falha de rede/TLS); 403, 401, 404 e página sem conteúdo nunca são repetidos. Fonte `navegador: "janela"` não é repetida pelo envoltório (a sessão já repete 429 após 60 s).
- 403 ou 401 ao `fetch` → mesma varredura, pela sessão com janela (§3.1); se a janela também falha, vale o erro do `fetch`.
- URL alternativa só é lida quando a principal **falha** no sentido de quem chama (`serviu` falsa); `ResultadoGrupo.fonteUrl` continua a principal; `ResultadoContato.fonteUrl` e `ConteudoFonte.url` são a URL lida de fato (§3.3).
- Aviso de URL caída: `coletas >= 2` (`MIN_COLETAS_URL_CAIDA = 2`). Mudança de composição: fração `> 0.5` (`FRACAO_MINIMA_TROCADA = 0.5`) em grupo com `MIN_CONTATOS_LEITURA_PARCIAL` (2) ou mais contatos; a leitura com mudança **não** entra na memória e **segura a publicação** (§3.4, §7).
- Nome mais curto em destaque: 2 ou mais partes significativas (sem "de", "da", "do", "dos", "das", "e"), todas no nome do Contatos, na mesma ordem, e menos partes que ele (§4.1). Nome de uma parte nunca reconhece.
- Nenhum teste lê disco fora de `tests/fixtures/` nem acessa a rede; espera, relógio, memória, raspadores e leitor de PDF são injetados.
- Catálogo: toda URL nova vem da spec §5 (planilha do Clovis, conferida com `fetch` em 23/10); nenhuma entra por descoberta. Alternativas e provisórias obedecem ao checklist do CLAUDE.md, com a exceção registrada na spec §5 (notícia de órgão oficial só como `provisoria: true`).
- Comentários, nomes, textos de UI e mensagens de commit em português, no padrão do código. Commits `<tipo>: <descrição>` terminados com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Nunca `git add -A`: só os arquivos da tarefa.
- Antes de cada commit: testes do(s) arquivo(s) tocado(s) verdes; ao fim de cada tarefa, `npm test` inteiro verde e `npm run typecheck` limpo.

## Decisões do plano (a registrar na spec depois da revisão do Clovis)

1. **Mudança de composição é medida pelos nomes NOVOS de hoje, não pelos guardados que sumiram.** A spec §3.4 define `fracaoTrocada = 1 - (hoje ∩ guardada) / guardados`. Com esse denominador, uma página que carregou pela metade (2 de 10 nomes, todos guardados) daria 0,8 e sairia "composição mudou" em vez de reaproveitada pela leitura parcial. O plano usa `trocados / total` com **total = nomes distintos de hoje** e **trocados = os que não estão na guardada**: página truncada dá 0 (segue para a leitura parcial, spec 20/10 §5.1); virada real (10 nomes novos) dá 1. O cabeçalho diz "Composição mudou: 7 de 10 nomes não estavam na leitura de 16/10; confira". Campos `mudouFormato: { lidaEm, trocados, total }` mantidos.
2. **A mudança é detectada ANTES do reaproveitamento por leitura parcial, e o impede.** Resolve o primeiro problema anotado em 24/10 (virada real de composição na Posse lida como "parcial" e escondida por até 7 dias): com mais da metade dos nomes novos, a leitura de hoje vale, o grupo sai lido com `mudouFormato`, as saídas aparecem e a publicação fica segurada até o fiscal olhar. Se a leitura de hoje não casa ninguém, continua caindo na leitura suspeita (inacessível), como hoje.
3. **O motivo da individual reaproveitada vem de `falhas[url]`.** Resolve o segundo problema anotado em 24/10 (spec 20/10 §8 pede motivo da página individual reaproveitada e o retrato só guarda `leituraDe`): toda URL que falhou hoje, inclusive a que saiu pela memória, entra em `falhas` com o motivo de hoje; o relatório e a procedência leem de lá. Nenhum campo novo no contato para isso.
4. `falhas` fica em `ResultadoAnalise.falhas?` (o `Retrato` herda) e **vai para a web**: só URLs do catálogo, datas e motivos técnicos, e o cabeçalho na web precisa do aviso. Entrada de URL não visitada nesta varredura (grupo ausente da planilha) é mantida como está. URL tentada mais de uma vez na mesma varredura (três grupos de Senadores leem a mesma página): um sucesso apaga a entrada.
5. **`marcador` é `{ textos: readonly string[] }`**, não `{ texto: string }`: o TST tem dois marcadores ("(convocado)", "(convocada)").
6. **Janela que responde ao 403 sem conteúdo legível conta como falha da janela**: `rasparFonte` só aceita o conteúdo da janela quando `paginaComConteudo` é verdadeira ou há pessoas; senão lança o erro original do `fetch` ("HTTP 403"), para o motivo da tela continuar sendo o bloqueio, não "não trouxe ninguém".
7. **Grupo novo "Senadores fora de exercício" propõe inclusão** (`propoeInclusao: true`, como a antiga segunda fonte dos Senadores): afastado que ainda não foi movido pelo GT aparece como proposta de inclusão nele e como possível saída em "Senadores", que é o sinal para mover.
8. **Fonte provisória marca o contato** (`ResultadoContato.provisoria: true`) e o grupo conta (`individuais.provisorias`): é o que a tela e o export precisam para "Fonte provisória: notícia" na procedência e no cabeçalho.
9. **`nomesDoContatos` vale para o grupo**: a lista é a união das listas das fontes ativas do grupo, aplicada a todo contato que casou alguém da composição. Com uma fonte por grupo (o caso de hoje) é o mesmo que "por fonte", e a composição unida não guarda de qual fonte veio cada pessoa depois da alternativa.
10. **Títulos (`h1`–`h3`) entram em `destaques`** de `extrairConteudo`, filtrados por `ehNome` como os `strong`: é a única forma de o nome mais curto "em título" chegar a `nomeNaPagina` sem campo novo em `ConteudoFonte`.
11. A memória de uma leitura pela alternativa é guardada sob a URL da alternativa (§3.3): `guardar` usa `l.alternativa?.url ?? l.fonte.url`. A procura da guardada tenta a principal e depois a alternativa.
12. Sem responsáveis para o grupo novo: a planilha de 23/10 não os traz; o Clovis preenche quando o GT definir.

## Review Focus

1. **Página que respondeu 200 com "pessoas" de menu e memória boa** (TCU sem a lista): hoje seria reaproveitada por leitura parcial; com a mudança medida antes, nenhum contato casa, cai na leitura suspeita e o grupo sai inacessível, nunca saída em massa nem "composição mudou" silenciosa. Teste na Task 4 ("mudança que não casa ninguém continua leitura suspeita").
2. **403 ao `fetch` cuja janela devolve CAPTCHA** (sem erro, sem conteúdo): o conteúdo vazio da janela não pode virar "não trouxe ninguém"; o motivo tem de continuar "HTTP 403". Teste na Task 2 ("janela sem conteúdo legível devolve o erro do fetch").
3. **Principal e alternativa falham, e só a alternativa tem leitura guardada válida**: o grupo sai reaproveitado, com `reaproveitada.url` igual à principal e a memória sob a alternativa. Teste na Task 3 ("memória da alternativa serve quando as duas falham").
4. **Fonte `navegador: "janela"` com HTTP 429**: o envoltório não repete por cima da sessão (que já esperou 60 s). Teste na Task 2 ("fonte janela não é repetida").
5. **URL compartilhada por três grupos com resultados diferentes na mesma varredura** (uma leitura falhou na repetição, outra respondeu): `atualizarFalhas` deixa o sucesso vencer; a URL não entra como caída. Teste na Task 1 ("sucesso na mesma varredura apaga a falha da URL").

---

### Task 1: Tipos, `lib/memoria-leitura.ts` (falhas e mudança) e resumos dos testes

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/memoria-leitura.ts`
- Modify: todo teste com literal de `ResumoAnalise` (`grep -rn "gruposReaproveitados:" tests`): `tests/armazem.test.ts`, `tests/eleitos.test.ts`, `tests/export.test.ts`, `tests/painel.test.ts` e os que mais houver
- Test: `tests/memoria-leitura.test.ts`

**Interfaces:**
- Produces (tipos): `FalhaDeUrl`, `FalhasPorUrl`, `TentativaDeUrl`, `LeituraAlternativa`, `MudancaDeComposicao`; campos `FonteCatalogo.urlAlternativa?`, `FonteCatalogo.nomesDoContatos?`, `FonteCatalogo.tipo?`, `FonteCatalogo.marcador?`, `FonteIndividual.urlAlternativa?`, `FonteIndividual.provisoria?`, `FonteLegivel` ampliado, `ResultadoGrupo.alternativa?`, `ResultadoGrupo.mudouFormato?`, `ResultadoGrupo.individuais.provisorias?`, `ResultadoContato.alternativa?`, `ResultadoContato.provisoria?`, `ResumoAnalise.urlsCaidasRepetidas`, `ResumoAnalise.gruposComMudanca`, `ResultadoAnalise.falhas?`.
- Produces (funções): `MIN_COLETAS_URL_CAIDA`, `FRACAO_MINIMA_TROCADA`, `atualizarFalhas(anteriores, tentadas, agora)`, `contarUrlsCaidas(falhas)`, `falhasDoRetrato(retrato)`, `nomesNovos(hoje, guardada)`, `ehMudancaDeComposicao(m, totalContatos)`.

- [ ] **Step 1: Tipos em `lib/types.ts`**

Depois de `Reaproveitamento`:

```ts
/** URL do catálogo que falhou em coletas seguidas (spec 2026-10-23 §3.4). Sem PII: só URL, datas e motivo técnico. */
export interface FalhaDeUrl {
  /** Primeira coleta em que a URL falhou, ISO 8601. Mantida enquanto a URL continuar falhando. */
  desde: string;
  /** Coletas seguidas em que a URL falhou (a de hoje inclusa). */
  coletas: number;
  /** Motivo técnico da falha de hoje ("HTTP 404"). */
  motivo: string;
}
/** Chave: a URL do catálogo. */
export type FalhasPorUrl = Record<string, FalhaDeUrl>;
/** Uma URL que esta varredura tentou ler: `erro` ausente é sucesso. */
export interface TentativaDeUrl { url: string; erro?: string }
/** A URL principal falhou e a alternativa cadastrada respondeu (spec 2026-10-23 §3.3). */
export interface LeituraAlternativa { url: string; motivoPrincipal: string }
/** A página de hoje trouxe mais da metade de nomes que não estavam na leitura guardada (spec 2026-10-23 §3.4). */
export interface MudancaDeComposicao { lidaEm: string; trocados: number; total: number }
```

Em `FonteCatalogo`, depois de `casamento?`:

```ts
  /** Lida só quando a principal falha; o que casar é comparado contra ela (spec 2026-10-23 §3.3). Mesmo domínio oficial. */
  urlAlternativa?: string;
  /** Nomes, como estão no Contatos, em que o Contatos prevalece sobre a grafia da página (spec 2026-10-23 §4.2). */
  nomesDoContatos?: readonly string[];
  /** Ausente = HTML. "pdf": o corpo é lido por `extrairConteudoPdf` (spec 2026-10-23 §5.1). */
  tipo?: "html" | "pdf";
  /** Extração por marcador: só as pessoas cujo nome é seguido de um destes textos (spec 2026-10-23 §5.2). */
  marcador?: { textos: readonly string[] };
```

Em `FonteIndividual`, depois de `navegador?`:

```ts
  urlAlternativa?: string;
  /** Notícia de órgão oficial no lugar de página institucional, até a posse de 2027 (spec 2026-10-23 §5). */
  provisoria?: true;
```

`FonteLegivel` passa a `Pick<FonteCatalogo, "url" | "tabela" | "navegador" | "urlAlternativa" | "tipo" | "marcador">`.

Em `ResultadoGrupo`, depois de `reaproveitada?`:

```ts
  /** A primária do grupo foi lida pela URL alternativa (spec 2026-10-23 §3.3). */
  alternativa?: LeituraAlternativa;
  /** A composição de hoje trocou mais da metade dos nomes em relação à guardada (spec 2026-10-23 §3.4). Segura a publicação. */
  mudouFormato?: MudancaDeComposicao;
```

Em `ResultadoGrupo.individuais`: `{ lidas: number; caidas: number; reaproveitadas?: number; provisorias?: number }` (comentário: `provisorias` conta contatos ligados a fonte provisória; só aparece quando maior que zero).

Em `ResultadoContato`, depois de `leituraDe?`:

```ts
  /** A página individual do contato foi lida pela URL alternativa (spec 2026-10-23 §3.3). */
  alternativa?: LeituraAlternativa;
  /** A fonte individual do contato é provisória (notícia) (spec 2026-10-23 §5). */
  provisoria?: true;
```

Em `ResumoAnalise`, depois de `gruposReaproveitados`:

```ts
  /** URLs do catálogo caídas há `MIN_COLETAS_URL_CAIDA` ou mais coletas seguidas (spec 2026-10-23 §3.4). */
  urlsCaidasRepetidas: number;
  /** Grupos com `mudouFormato`. */
  gruposComMudanca: number;
```

Em `ResultadoAnalise`, depois de `leituras?`:

```ts
  /** URLs do catálogo que falharam em coletas seguidas (spec 2026-10-23 §3.4). Vai para a web: não tem PII. */
  falhas?: FalhasPorUrl;
```

- [ ] **Step 2: Campos novos nos resumos fixos dos testes**

Toda literal de `ResumoAnalise` em `tests/` que termina em `gruposReaproveitados: 0` passa a `gruposReaproveitados: 0, urlsCaidasRepetidas: 0, gruposComMudanca: 0`. Conferir com `grep -rn "gruposReaproveitados:" tests` que nenhuma ficou sem os dois campos. Rodar `npm run typecheck` e deixar limpo antes de seguir.

- [ ] **Step 3: Testes de `falhas` em `tests/memoria-leitura.test.ts`**

```ts
import { atualizarFalhas, contarUrlsCaidas, falhasDoRetrato, MIN_COLETAS_URL_CAIDA } from "@/lib/memoria-leitura";

describe("falhas por URL (spec 2026-10-23 §3.4)", () => {
  const D19 = "2026-10-19T12:00:00.000Z";
  const hoje = new Date("2026-10-21T12:00:00.000Z");
  test("URL que falha pela primeira vez entra com coletas 1 e desde = agora", () => {
    const f = atualizarFalhas({}, [{ url: "https://a.gov.br", erro: "HTTP 404" }], hoje);
    expect(f).toEqual({ "https://a.gov.br": { desde: hoje.toISOString(), coletas: 1, motivo: "HTTP 404" } });
  });
  test("URL que falha de novo soma coletas, mantém desde e troca o motivo pelo de hoje", () => {
    const f = atualizarFalhas({ "https://a.gov.br": { desde: D19, coletas: 1, motivo: "HTTP 404" } }, [{ url: "https://a.gov.br", erro: "tempo esgotado" }], hoje);
    expect(f["https://a.gov.br"]).toEqual({ desde: D19, coletas: 2, motivo: "tempo esgotado" });
  });
  test("URL lida hoje sai do mapa; URL não tentada fica como está", () => {
    const antes = { "https://a.gov.br": { desde: D19, coletas: 1, motivo: "HTTP 404" }, "https://b.gov.br": { desde: D19, coletas: 3, motivo: "HTTP 500" } };
    const f = atualizarFalhas(antes, [{ url: "https://a.gov.br" }], hoje);
    expect(f).toEqual({ "https://b.gov.br": antes["https://b.gov.br"] });
    expect(antes["https://a.gov.br"]).toBeDefined(); // não muta a entrada
  });
  test("sucesso na mesma varredura apaga a falha da URL, em qualquer ordem", () => {
    const f = atualizarFalhas({}, [{ url: "https://a.gov.br", erro: "HTTP 429 (3 tentativas)" }, { url: "https://a.gov.br" }], hoje);
    expect(f).toEqual({});
  });
  test("contarUrlsCaidas conta só coletas >= MIN_COLETAS_URL_CAIDA", () => {
    expect(MIN_COLETAS_URL_CAIDA).toBe(2);
    expect(contarUrlsCaidas({ a: { desde: D19, coletas: 1, motivo: "x" }, b: { desde: D19, coletas: 2, motivo: "x" }, c: { desde: D19, coletas: 5, motivo: "x" } })).toBe(2);
  });
  test("falhasDoRetrato devolve o mapa do retrato e descarta entrada com forma errada; retrato sem o campo ou ausente dá vazio", () => {
    const boa = { desde: D19, coletas: 2, motivo: "HTTP 404" };
    expect(falhasDoRetrato({ falhas: { "https://a.gov.br": boa, "https://b.gov.br": { coletas: "2" } } } as never)).toEqual({ "https://a.gov.br": boa });
    expect(falhasDoRetrato({} as never)).toEqual({});
    expect(falhasDoRetrato(undefined)).toEqual({});
  });
});
```

- [ ] **Step 4: Testes de mudança de composição em `tests/memoria-leitura.test.ts`**

```ts
import { ehMudancaDeComposicao, FRACAO_MINIMA_TROCADA, nomesNovos } from "@/lib/memoria-leitura";

describe("mudança de composição (spec 2026-10-23 §3.4; decisão 1 do plano)", () => {
  const p = (...nomes: string[]) => nomes.map((nome) => ({ nome }));
  test("conta os nomes distintos de hoje e quantos não estão na guardada (igualdade após normalizarNome)", () => {
    expect(nomesNovos(p("Ana Silva", "ANA SILVA", "Beto Souza", "Carla Lima"), p("Ana Silva", "Beto Souza"))).toEqual({ trocados: 1, total: 3 });
  });
  test("página truncada (todos os nomes de hoje estão na guardada) não tem nomes novos", () => {
    expect(nomesNovos(p("Ana Silva", "Beto Souza"), p("Ana Silva", "Beto Souza", "Carla Lima", "Dora Reis"))).toEqual({ trocados: 0, total: 2 });
  });
  test("é mudança com mais da metade de nomes novos em grupo com 2+ contatos", () => {
    expect(FRACAO_MINIMA_TROCADA).toBe(0.5);
    expect(ehMudancaDeComposicao({ trocados: 7, total: 10 }, 10)).toBe(true);
    expect(ehMudancaDeComposicao({ trocados: 5, total: 10 }, 10)).toBe(false);
    expect(ehMudancaDeComposicao({ trocados: 3, total: 10 }, 10)).toBe(false);
  });
  test("grupo de um contato e página sem nomes nunca são mudança", () => {
    expect(ehMudancaDeComposicao({ trocados: 1, total: 1 }, 1)).toBe(false);
    expect(ehMudancaDeComposicao({ trocados: 0, total: 0 }, 5)).toBe(false);
  });
});
```

- [ ] **Step 5: Rodar os testes novos e ver falhar**

Run: `npx vitest run tests/memoria-leitura.test.ts`
Expected: FAIL (funções não exportadas).

- [ ] **Step 6: Implementar em `lib/memoria-leitura.ts`**

```ts
export const MIN_COLETAS_URL_CAIDA = 2;
export const FRACAO_MINIMA_TROCADA = 0.5;
export function atualizarFalhas(anteriores: FalhasPorUrl, tentadas: readonly TentativaDeUrl[], agora: Date): FalhasPorUrl;
export function contarUrlsCaidas(falhas: FalhasPorUrl): number;
/** `retrato.falhas` com forma válida (desde string, coletas número, motivo string); senão `{}`. Retrato ausente ou sem o campo: `{}`. */
export function falhasDoRetrato(retrato: Pick<Retrato, "falhas"> | undefined): FalhasPorUrl;
export function nomesNovos(hoje: readonly PessoaSite[], guardada: readonly PessoaSite[]): { trocados: number; total: number };
export function ehMudancaDeComposicao(m: { trocados: number; total: number }, totalContatos: number): boolean;
```

`atualizarFalhas`: URLs com sucesso em `tentadas` formam um conjunto; para cada URL com erro **fora** desse conjunto, entrada nova `{ desde: anteriores[url]?.desde ?? agora.toISOString(), coletas: (anteriores[url]?.coletas ?? 0) + 1, motivo }` (a última tentativa com erro da URL dá o motivo); URLs com sucesso ficam fora; entradas de `anteriores` não tentadas são copiadas. `ehMudancaDeComposicao`: `totalContatos >= MIN_CONTATOS_LEITURA_PARCIAL && m.total > 0 && m.trocados / m.total > FRACAO_MINIMA_TROCADA`.

- [ ] **Step 7: Rodar e ver passar; typecheck**

Run: `npx vitest run tests/memoria-leitura.test.ts && npm run typecheck`
Expected: PASS, typecheck limpo.

- [ ] **Step 8: Commit**

```bash
git add lib/types.ts lib/memoria-leitura.ts tests/memoria-leitura.test.ts tests/armazem.test.ts tests/eleitos.test.ts tests/export.test.ts tests/painel.test.ts
git commit -m "feat: tipos da leitura resiliente, falhas por URL e mudança de composição"
```

(Acrescentar ao `git add` os outros arquivos de teste tocados no Step 2.)

---

### Task 2: `lib/raspagem.ts`: 403 → janela e `comRepeticao`

**Files:**
- Modify: `lib/raspagem.ts`
- Test: `tests/raspagem.test.ts`

**Interfaces:**
- Consumes: `paginaComConteudo(c)` de `lib/match.ts`; `ScrapeError` de `lib/scrape.ts`; `Raspadores` existente.
- Produces: `rasparFonte(fonte, raspadores)` com o desvio 403/401; `MOTIVOS_BLOQUEIO_FETCH`; `ESPERAS_REPETICAO_MS`; `ehFalhaTransitoria(motivo)`; `comRepeticao(raspar, opcoes?)`; `Raspadores.porFetch` recebe também `marcador` e `tipo` em `opcoes` (os campos chegam na Task 6; aqui só passam adiante).

- [ ] **Step 1: Testes do desvio 403 → janela em `tests/raspagem.test.ts`**

```ts
import { ScrapeError } from "@/lib/scrape";
import { MIN_TEXTO_PAGINA_INDIVIDUAL } from "@/lib/match";

const comConteudo = (url: string): ConteudoFonte => ({ url, textoLimpo: "x".repeat(MIN_TEXTO_PAGINA_INDIVIDUAL), destaques: [], pessoas: [{ nome: "Ana Maria Política Completa" }] });

describe("HTTP 403 ao fetch vai para a janela (spec 2026-10-23 §3.1)", () => {
  test("fetch 403 → a mesma URL é lida pela janela e o conteúdo da janela vale", async () => {
    const r = raspadoresFalsos();
    r.porFetch.mockRejectedValue(new ScrapeError("https://portal.stf.jus.br/x", "HTTP 403"));
    r.porJanela.mockResolvedValue(comConteudo("https://portal.stf.jus.br/x"));
    const c = await rasparFonte({ url: "https://portal.stf.jus.br/x", tabela: { colunas: { nome: 0 } } }, r);
    expect(c.pessoas).toHaveLength(1);
    expect(r.porJanela).toHaveBeenCalledWith("https://portal.stf.jus.br/x", { tabela: { colunas: { nome: 0 } } });
  });
  test("fetch 401 também vai para a janela; 404 e 500 não", async () => {
    for (const [motivo, vaiParaJanela] of [["HTTP 401", true], ["HTTP 404", false], ["HTTP 500", false]] as const) {
      const r = raspadoresFalsos();
      r.porFetch.mockRejectedValue(new ScrapeError("https://a.gov.br", motivo));
      r.porJanela.mockResolvedValue(comConteudo("https://a.gov.br"));
      await rasparFonte({ url: "https://a.gov.br" }, r).catch(() => undefined);
      expect(r.porJanela.mock.calls.length > 0).toBe(vaiParaJanela);
    }
  });
  test("janela que também falha → vale o erro do fetch (HTTP 403), não o da janela", async () => {
    const r = raspadoresFalsos();
    r.porFetch.mockRejectedValue(new ScrapeError("https://a.gov.br", "HTTP 403"));
    r.porJanela.mockRejectedValue(new ScrapeError("https://a.gov.br", MOTIVO_SESSAO_AUSENTE));
    await expect(rasparFonte({ url: "https://a.gov.br" }, r)).rejects.toMatchObject({ motivo: "HTTP 403" });
  });
  test("janela sem conteúdo legível (CAPTCHA) devolve o erro do fetch", async () => {
    const r = raspadoresFalsos();
    r.porFetch.mockRejectedValue(new ScrapeError("https://a.gov.br", "HTTP 403"));
    r.porJanela.mockResolvedValue({ url: "https://a.gov.br", textoLimpo: "What code is in the image?", destaques: [], pessoas: [] });
    await expect(rasparFonte({ url: "https://a.gov.br" }, r)).rejects.toMatchObject({ motivo: "HTTP 403" });
  });
  test("fonte com navegador (headless) nunca passa pela janela", async () => {
    const r = raspadoresFalsos();
    r.porNavegador.mockRejectedValue(new ScrapeError("https://portal.tcu.gov.br/autoridades", "HTTP 403"));
    await expect(rasparFonte({ url: "https://portal.tcu.gov.br/autoridades", navegador: true }, r)).rejects.toMatchObject({ motivo: "HTTP 403" });
    expect(r.porJanela).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Testes de `comRepeticao` em `tests/raspagem.test.ts`**

```ts
import { comRepeticao, ehFalhaTransitoria, ESPERAS_REPETICAO_MS } from "@/lib/raspagem";

describe("comRepeticao (spec 2026-10-23 §3.2)", () => {
  const esperas: number[] = [];
  const esperar = async (ms: number) => { esperas.push(ms); };
  beforeEach(() => { esperas.length = 0; });
  const fonte = { url: "https://a.gov.br" };

  test("esperas são 30 s e 120 s", () => {
    expect(ESPERAS_REPETICAO_MS).toEqual([30_000, 120_000]);
  });
  test("429 duas vezes e sucesso na terceira: devolve o conteúdo, esperando 30 s e depois 120 s", async () => {
    const raspar = vi.fn()
      .mockRejectedValueOnce(new ScrapeError(fonte.url, "HTTP 429"))
      .mockRejectedValueOnce(new ScrapeError(fonte.url, "HTTP 429"))
      .mockResolvedValueOnce(vazio(fonte.url));
    const c = await comRepeticao(raspar, { esperar })(fonte);
    expect(c.url).toBe(fonte.url);
    expect(raspar).toHaveBeenCalledTimes(3);
    expect(esperas).toEqual([30_000, 120_000]);
  });
  test("três falhas transitórias: o motivo é o da última tentativa com o sufixo (3 tentativas)", async () => {
    const raspar = vi.fn()
      .mockRejectedValueOnce(new ScrapeError(fonte.url, "HTTP 503"))
      .mockRejectedValueOnce(new ScrapeError(fonte.url, "HTTP 503"))
      .mockRejectedValueOnce(new ScrapeError(fonte.url, "navegador: tempo esgotado"));
    await expect(comRepeticao(raspar, { esperar })(fonte)).rejects.toMatchObject({ motivo: "navegador: tempo esgotado (3 tentativas)" });
  });
  test("404, 403, HTML vazio e navegador ausente não são repetidos: uma tentativa, sem sufixo", async () => {
    for (const motivo of ["HTTP 404", "HTTP 403", "HTML vazio", "navegador não encontrado", "página individual sem conteúdo legível (CAPTCHA ou só menu)"]) {
      const raspar = vi.fn().mockRejectedValue(new ScrapeError(fonte.url, motivo));
      await expect(comRepeticao(raspar, { esperar })(fonte)).rejects.toMatchObject({ motivo });
      expect(raspar).toHaveBeenCalledTimes(1);
    }
    expect(esperas).toEqual([]);
  });
  test("falha não transitória na segunda tentativa interrompe, com o sufixo (2 tentativas)", async () => {
    const raspar = vi.fn()
      .mockRejectedValueOnce(new ScrapeError(fonte.url, "HTTP 429"))
      .mockRejectedValueOnce(new ScrapeError(fonte.url, "HTTP 404"));
    await expect(comRepeticao(raspar, { esperar })(fonte)).rejects.toMatchObject({ motivo: "HTTP 404 (2 tentativas)" });
    expect(esperas).toEqual([30_000]);
  });
  test("fonte 'janela' não é repetida pelo envoltório", async () => {
    const raspar = vi.fn().mockRejectedValue(new ScrapeError(fonte.url, "HTTP 429"));
    await expect(comRepeticao(raspar, { esperar })({ ...fonte, navegador: "janela" })).rejects.toMatchObject({ motivo: "HTTP 429" });
    expect(raspar).toHaveBeenCalledTimes(1);
  });
  test("erro que não é ScrapeError sobe sem repetição", async () => {
    const raspar = vi.fn().mockRejectedValue(new TypeError("boom"));
    await expect(comRepeticao(raspar, { esperar })(fonte)).rejects.toBeInstanceOf(TypeError);
    expect(raspar).toHaveBeenCalledTimes(1);
  });
  test("ehFalhaTransitoria", () => {
    for (const m of ["HTTP 429", "HTTP 500", "HTTP 503", "navegador: tempo esgotado", "This operation was aborted", "fetch failed", "ECONNRESET", "HTTP 429 (3 tentativas)"]) expect(ehFalhaTransitoria(m)).toBe(true);
    for (const m of ["HTTP 403", "HTTP 401", "HTTP 404", "HTML vazio", "navegador não encontrado", "sessão do navegador com janela não aberta"]) expect(ehFalhaTransitoria(m)).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/raspagem.test.ts`
Expected: FAIL (exports ausentes; 403 sobe direto).

- [ ] **Step 4: Implementar em `lib/raspagem.ts`**

```ts
export const MOTIVOS_BLOQUEIO_FETCH: readonly string[] = ["HTTP 403", "HTTP 401"];
export const ESPERAS_REPETICAO_MS: readonly number[] = [30_000, 120_000];
export function ehFalhaTransitoria(motivo: string): boolean;
export interface OpcoesRepeticao { esperar?: (ms: number) => Promise<void>; esperas?: readonly number[] }
export function comRepeticao(raspar: (fonte: FonteLegivel) => Promise<ConteudoFonte>, opcoes?: OpcoesRepeticao): (fonte: FonteLegivel) => Promise<ConteudoFonte>;
```

`rasparFonte`: fonte `janela` e `navegador: true` como hoje; fonte comum: `porFetch`; em `ScrapeError` cujo `motivo` está em `MOTIVOS_BLOQUEIO_FETCH`, tenta `porJanela(url, opcoes)`; aceita o conteúdo da janela quando `paginaComConteudo(c) || c.pessoas.length > 0`; em qualquer outro caso (janela lançou, ou devolveu sem conteúdo legível) relança o erro do `fetch`. `opcoes` passa a `{ tabela?, marcador?, tipo? }` montado da fonte (campos ausentes não entram, para os testes existentes com `{}` continuarem valendo).

`ehFalhaTransitoria`: `/^HTTP (429|5\d\d)\b/` ou `/tempo esgotado|aborted|timeout|fetch failed|ECONN|ETIMEDOUT|EAI_AGAIN|socket hang up/i`.

`comRepeticao`: fonte `navegador === "janela"` passa direto. Senão, até `esperas.length + 1` tentativas; em `ScrapeError` transitória com espera restante, `esperar(esperas[i])` e repete; em `ScrapeError` não transitória, ou esgotadas as esperas, lança `new ScrapeError(url, n > 1 ? `${motivo} (${n} tentativas)` : motivo)` com `n` = tentativas feitas; erro que não é `ScrapeError` sobe como veio. `esperar` padrão: `setTimeout`.

- [ ] **Step 5: Rodar e ver passar; typecheck**

Run: `npx vitest run tests/raspagem.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/raspagem.ts tests/raspagem.test.ts
git commit -m "feat: 403 ao fetch vai para o Chrome com janela; repetição com espera para falhas transitórias"
```

---

### Task 3: `lib/analise.ts`: URL alternativa, memória pelas duas URLs e `falhas`

**Files:**
- Modify: `lib/analise.ts`
- Modify: `lib/match.ts` (`EntradaIndividual.lida` ganha `alternativa?`; `compararContatoIndividual` usa a URL lida)
- Test: `tests/analise.test.ts`, `tests/analise-individual.test.ts`, `tests/match-individual.test.ts`

**Interfaces:**
- Consumes: `atualizarFalhas`, `contarUrlsCaidas` (Task 1); `LeituraAlternativa`, `TentativaDeUrl`, `FalhasPorUrl`.
- Produces: `Dependencias.falhasAnteriores?: FalhasPorUrl`; `ResultadoAnalise.falhas` sempre presente na saída de `analisar`; `ResultadoGrupo.alternativa`, `ResultadoContato.alternativa`; `resumo.urlsCaidasRepetidas`; `EntradaIndividual.lida: { conteudo?; erro?; alternativa?: LeituraAlternativa }`.

- [ ] **Step 1: Testes da alternativa em grupo comum, em `tests/analise.test.ts`**

Com os `contatos`, a `fonte` e os `deps` do topo do arquivo, e um raspador por URL como `rasparDe` de `tests/analise-individual.test.ts` (copiar a função para este arquivo):

```ts
describe("URL alternativa (spec 2026-10-23 §3.3)", () => {
  const ALT = "https://orgao.gov.br/alternativa";
  const depsAlt = (mapa: Record<string, ConteudoFonte | string>, extra: Partial<Dependencias> = {}): Dependencias => ({
    ...deps,
    resolverFonte: () => ({ grupoCanonico: "ORG", fontes: [{ url: "https://orgao.gov.br", ativo: true, urlAlternativa: ALT }], fontesIndividuais: [], sugestoes: [] }),
    raspar: rasparDe(mapa),
    ...extra,
  });
  test("principal com erro e alternativa boa: grupo lido pela alternativa, fonteUrl do grupo é a principal, do contato é a alternativa", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], depsAlt({ "https://orgao.gov.br": "HTTP 404", [ALT]: { ...fonte, url: ALT } }));
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBeUndefined();
    expect(g.fonteUrl).toBe("https://orgao.gov.br");
    expect(g.alternativa).toEqual({ url: ALT, motivoPrincipal: "HTTP 404" });
    expect(g.contatos[0].semaforo).toBe("verde");
    expect(g.contatos[0].fonteUrl).toBe(ALT);
  });
  test("principal sem ninguém também abre a alternativa, com o motivo 'não trouxe ninguém'", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], depsAlt({ "https://orgao.gov.br": { ...fonte, pessoas: [] }, [ALT]: { ...fonte, url: ALT } }));
    expect(r.grupos[0].alternativa?.motivoPrincipal).toBe(MOTIVO_SEM_NINGUEM);
  });
  test("principal boa: a alternativa não é lida", async () => {
    const raspar = vi.fn(rasparDe({ "https://orgao.gov.br": fonte, [ALT]: { ...fonte, url: ALT } }));
    await analisar("c.xlsx", [contatos[0]], depsAlt({}, { raspar }));
    expect(raspar.mock.calls.map((c) => c[0].url)).toEqual(["https://orgao.gov.br"]);
  });
  test("as duas falham: inacessível, com os dois motivos", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], depsAlt({ "https://orgao.gov.br": "HTTP 404", [ALT]: "HTTP 500 (3 tentativas)" }));
    expect(r.grupos[0].fonteInacessivel).toBe(true);
    expect(r.grupos[0].erroFonte).toBe("HTTP 404 · URL alternativa: HTTP 500 (3 tentativas)");
  });
  test("memória da alternativa serve quando as duas falham: reaproveitada com url = principal, leitura guardada sob a alternativa", async () => {
    const guardada: LeituraGuardada = { url: ALT, lidaEm: "2026-10-19T12:00:00.000Z", conteudo: { ...fonte, url: ALT } };
    const r = await analisar("c.xlsx", [contatos[0]], depsAlt({ "https://orgao.gov.br": "HTTP 404", [ALT]: "HTTP 500" }, { leiturasAnteriores: { [ALT]: guardada }, agora: () => new Date("2026-10-21T12:00:00.000Z") }));
    const g = r.grupos[0];
    expect(g.reaproveitada).toEqual({ url: "https://orgao.gov.br", lidaEm: guardada.lidaEm, motivo: "HTTP 404 · URL alternativa: HTTP 500" });
    expect(r.leituras?.[ALT]?.lidaEm).toBe(guardada.lidaEm);
  });
  test("leitura boa pela alternativa entra na memória sob a URL da alternativa", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], depsAlt({ "https://orgao.gov.br": "HTTP 404", [ALT]: { ...fonte, url: ALT } }));
    expect(Object.keys(r.leituras ?? {})).toEqual([ALT]);
  });
});
```

- [ ] **Step 2: Testes de `falhas` em `tests/analise.test.ts`**

```ts
describe("falhas por URL em coletas seguidas (spec 2026-10-23 §3.4)", () => {
  const agora = () => new Date("2026-10-21T12:00:00.000Z");
  test("URL que falhou entra em falhas com coletas 1; o resumo não conta antes de 2", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], { ...deps, raspar: async () => { throw new ScrapeError("https://orgao.gov.br", "HTTP 404"); }, agora });
    expect(r.falhas).toEqual({ "https://orgao.gov.br": { desde: agora().toISOString(), coletas: 1, motivo: "HTTP 404" } });
    expect(r.resumo.urlsCaidasRepetidas).toBe(0);
  });
  test("segunda coleta seguida: coletas 2, desde mantido, resumo conta 1; grupo reaproveitado pela memória também conta", async () => {
    const desde = "2026-10-19T12:00:00.000Z";
    const guardada: LeituraGuardada = { url: "https://orgao.gov.br", lidaEm: desde, conteudo: fonte };
    const r = await analisar("c.xlsx", [contatos[0]], {
      ...deps,
      raspar: async () => { throw new ScrapeError("https://orgao.gov.br", "HTTP 404"); },
      agora,
      falhasAnteriores: { "https://orgao.gov.br": { desde, coletas: 1, motivo: "HTTP 404" } },
      leiturasAnteriores: { "https://orgao.gov.br": guardada },
    });
    expect(r.grupos[0].reaproveitada).toBeDefined();
    expect(r.falhas?.["https://orgao.gov.br"]).toEqual({ desde, coletas: 2, motivo: "HTTP 404" });
    expect(r.resumo.urlsCaidasRepetidas).toBe(1);
  });
  test("URL lida hoje sai de falhas; sem falhasAnteriores o mapa começa vazio", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], { ...deps, agora, falhasAnteriores: { "https://orgao.gov.br": { desde: "2026-10-19T12:00:00.000Z", coletas: 3, motivo: "HTTP 404" } } });
    expect(r.falhas).toEqual({});
  });
  test("primária sem ninguém (grupo de fonte) conta como falha da URL; secundária sem ninguém não", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], {
      ...deps,
      resolverFonte: () => ({ grupoCanonico: "ORG", fontes: [{ url: "https://orgao.gov.br", ativo: true }, { url: "https://orgao.gov.br/fora", ativo: true, rotulo: "fora" }], fontesIndividuais: [], sugestoes: [] }),
      raspar: async (f) => (f.url === "https://orgao.gov.br" ? fonte : { ...fonte, url: f.url, pessoas: [] }),
      agora,
    });
    expect(r.falhas).toEqual({});
    const r2 = await analisar("c.xlsx", [contatos[0]], { ...deps, raspar: async () => ({ ...fonte, pessoas: [] }), agora });
    expect(r2.falhas?.["https://orgao.gov.br"]?.motivo).toBe(MOTIVO_SEM_NINGUEM);
  });
});
```

- [ ] **Step 3: Testes das individuais em `tests/analise-individual.test.ts`**

```ts
describe("alternativa e falhas nas páginas individuais (spec 2026-10-23 §3.3, §3.4)", () => {
  const ALT_GO = "https://go.gov.br/governador-alternativa";
  const individuaisAlt: FonteIndividual[] = [{ ...individuaisGov[0], urlAlternativa: ALT_GO }, individuaisGov[1]];
  const resolvida: FonteResolvida = { ...RESOLVIDA_GOV, fontesIndividuais: individuaisAlt };
  test("individual principal caída e alternativa com conteúdo: contato verificado, alternativa no contato, fonteUrl é a lida", async () => {
    const r = await analisar("c.xlsx", [govGo, govRs], { resolverFonte: resolver(RESOLVIDA_MIN, resolvida), raspar: rasparDe({ [URL_GO]: "HTTP 404", [ALT_GO]: { ...paginaGo, url: ALT_GO }, [URL_RS]: paginaRs }), extrairComposicao: async () => [] });
    const c = r.grupos[0].contatos.find((x) => x.contato.nome === govGo.nome)!;
    expect(c.semaforo).toBe("verde");
    expect(c.fonteUrl).toBe(ALT_GO);
    expect(c.alternativa).toEqual({ url: ALT_GO, motivoPrincipal: "HTTP 404" });
    expect(c.comparacoes.find((x) => x.campo === "nome")?.fonteUrl).toBe(ALT_GO);
    expect(r.grupos[0].individuais).toEqual({ lidas: 2, caidas: 0 });
    expect(r.falhas).toEqual({ [URL_GO]: expect.objectContaining({ coletas: 1, motivo: "HTTP 404" }) });
  });
  test("individual sem conteúdo legível conta como falha da URL em falhas", async () => {
    const r = await analisar("c.xlsx", [govRs], { resolverFonte: resolver(RESOLVIDA_MIN, RESOLVIDA_GOV), raspar: rasparDe({ [URL_RS]: { ...paginaRs, textoLimpo: "menu" } }), extrairComposicao: async () => [] });
    expect(r.falhas?.[URL_RS]?.motivo).toBe(MOTIVO_PAGINA_INDIVIDUAL_SEM_CONTEUDO);
  });
});
```

- [ ] **Step 4: Teste da URL lida em `tests/match-individual.test.ts`**

```ts
test("lida pela alternativa: as comparações e o fonteUrl apontam para a URL lida", () => {
  const alt = "https://www.exemplar.gov.br/governo-alternativa";
  const v = compararContatoIndividual({ contato: governador, fonte: indNomeCargo, lida: { conteudo: { ...estado, url: alt }, alternativa: { url: alt, motivoPrincipal: "HTTP 404" } } });
  expect(v.resultado.fonteUrl).toBe(alt);
  expect(v.resultado.comparacoes.find((c) => c.campo === "nome")?.fonteUrl).toBe(alt);
  expect(v.resultado.alternativa).toEqual({ url: alt, motivoPrincipal: "HTTP 404" });
});
```

- [ ] **Step 5: Rodar e ver falhar**

Run: `npx vitest run tests/analise.test.ts tests/analise-individual.test.ts tests/match-individual.test.ts`
Expected: FAIL nos testes novos.

- [ ] **Step 6: Implementar em `lib/analise.ts` e `lib/match.ts`**

`lib/match.ts`: `EntradaIndividual.lida: { conteudo?: ConteudoFonte; erro?: string; alternativa?: LeituraAlternativa }`; em `compararContatoIndividual`, `const url = lida.alternativa?.url ?? fonte.url;` e o resultado leva `...(lida.alternativa ? { alternativa: lida.alternativa } : {})` nos dois caminhos com conteúdo (casou e não consta).

`lib/analise.ts`:

- `Dependencias.falhasAnteriores?: FalhasPorUrl`.
- `interface Leitura<F>` ganha `alternativa?: LeituraAlternativa` e `tentadas: TentativaDeUrl[]`.
- `lerHoje<F>(fonte, deps, serviu, motivoPadrao)`: lê a principal; se `serviu` ou sem `urlAlternativa`, devolve com `tentadas: [{ url, erro? }]` (erro = `l.erro ?? motivoPadrao` quando não serviu); senão lê `{ ...fonte, url: fonte.urlAlternativa }` com o mesmo `deps.raspar`; se serviu, devolve `{ fonte, conteudo, alternativa: { url, motivoPrincipal }, tentadas: [principal com erro, alternativa sem erro] }`; senão `{ fonte, erro: `${motivoPrincipal} · URL alternativa: ${erroAlt}`, tentadas: [as duas com erro] }`.
- `guardadaValida(fonte, deps, agora)` recebe a fonte e tenta `fonte.url` e depois `fonte.urlAlternativa`.
- `lerFonte` passa `serviu` e `motivoPadrao` a `lerHoje`; reaproveitada mantém `tentadas` da leitura de hoje (a URL falhou hoje mesmo que a memória a tenha coberto: decisão 3).
- `guardar(l, agora)`: `url: l.alternativa?.url ?? l.fonte.url` e `conteudo` como está.
- `marcarProveniencia(pessoas, fonte, urlLida)`: `fonteUrl: urlLida`; chamadas passam `l.alternativa?.url ?? l.fonte.url`.
- `AnaliseDoGrupo` ganha `tentadas: TentativaDeUrl[]`; cada caminho de `analisarGrupo` e `analisarGrupoIndividual` devolve as `tentadas` de todas as leituras (grupo sem fonte: `[]`).
- Grupo comum: `...(lidas[0]?.alternativa ? { alternativa: lidas[0].alternativa } : {})` no resultado lido; secundária lida pela alternativa vira anotação em `erroFonte`: `"<fonte>: lida pela URL alternativa (<motivoPrincipal>)"`.
- Individuais: `lida.alternativa` já chega ao veredito pela `EntradaIndividual`; o contato sai com `alternativa`.
- `analisar`: `falhas = atualizarFalhas(deps.falhasAnteriores ?? {}, analisados.flatMap((a) => a.tentadas), agora)`; devolve `{ ..., falhas }`; `resumir(grupos, falhas)` preenche `urlsCaidasRepetidas: contarUrlsCaidas(falhas)` e `gruposComMudanca: 0` (preenchido na Task 4).

- [ ] **Step 7: Rodar e ver passar; suíte inteira; typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS. Se algum teste antigo de memória quebrar por causa de `guardar` (chave da leitura), é sinal de que a chave mudou fora do caso com alternativa: corrigir a implementação, não o teste.

- [ ] **Step 8: Commit**

```bash
git add lib/analise.ts lib/match.ts tests/analise.test.ts tests/analise-individual.test.ts tests/match-individual.test.ts
git commit -m "feat: URL alternativa por fonte, memória pelas duas URLs e falhas por URL em coletas seguidas"
```

---

### Task 4: `lib/analise.ts`: mudança de composição, `nomesDoContatos` e fonte provisória

**Files:**
- Modify: `lib/analise.ts`
- Modify: `lib/match.ts` (`aplicarNomesDoContatos`)
- Test: `tests/analise.test.ts`, `tests/analise-individual.test.ts`, `tests/match.test.ts`

**Interfaces:**
- Consumes: `nomesNovos`, `ehMudancaDeComposicao` (Task 1); `guardadaValida` (Task 3).
- Produces: `ResultadoGrupo.mudouFormato`; `resumo.gruposComMudanca`; `aplicarNomesDoContatos(grupo: ResultadoGrupo, nomes: readonly string[]): ResultadoGrupo` em `lib/match.ts`; `ResultadoContato.provisoria`, `individuais.provisorias`.

- [ ] **Step 1: Testes da mudança em `tests/analise.test.ts`**

```ts
describe("mudança de composição (spec 2026-10-23 §3.4; decisões 1 e 2 do plano)", () => {
  const agora = () => new Date("2026-10-21T12:00:00.000Z");
  // Nomes fictícios sem token em comum entre si (pontuarPessoa casa por token; um sobrenome repetido casaria a pessoa errada).
  const dez = ["Aline Borges Teixeira", "Bruno Cardoso Mendes", "Cláudia Ferraz Nogueira", "Diego Pacheco Ramos", "Elisa Quintela Sá", "Fábio Guimarães Lopes", "Gisele Vasconcelos Dutra", "Hugo Barbosa Peixoto", "Irene Castelo Branco", "Jorge Linhares Moura"];
  const novos = ["Karen Oliveira Prado", "Leonardo Siqueira Fontes", "Marina Dantas Rezende", "Nelson Figueira Cunha", "Olívia Monteiro Tavares", "Paulo Zanetti Correia", "Quitéria Amaral Xavier"];
  const menu = Array.from({ length: 10 }, (_, i) => `Item Menu ${i + 1}`);
  const contatosDez: ContatoPlanilha[] = dez.map((nome) => ({ nome, grupo: "ORG", ...CADASTRO_OK }));
  const conteudo = (lista: string[]): ConteudoFonte => ({ url: "https://orgao.gov.br", textoLimpo: lista.join("\n"), destaques: [], pessoas: lista.map((nome) => ({ nome, cargo: "Ministro" })) });
  const guardada: LeituraGuardada = { url: "https://orgao.gov.br", lidaEm: "2026-10-16T12:00:00.000Z", conteudo: conteudo(dez) };
  const depsCom = (hoje: ConteudoFonte): Dependencias => ({ ...deps, raspar: async () => hoje, leiturasAnteriores: { "https://orgao.gov.br": guardada }, agora });

  test("7 de 10 nomes novos: grupo lido com mudouFormato, saídas aparecem, leitura de hoje não entra na memória, resumo conta", async () => {
    const hoje = conteudo([...dez.slice(0, 3), ...novos]);
    const r = await analisar("c.xlsx", contatosDez, depsCom(hoje));
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBeUndefined();
    expect(g.reaproveitada).toBeUndefined();
    expect(g.mudouFormato).toEqual({ lidaEm: guardada.lidaEm, trocados: 7, total: 10 });
    expect(g.contatos.filter((c) => c.possivelSaida)).toHaveLength(7);
    expect(r.leituras?.["https://orgao.gov.br"]?.lidaEm).toBe(guardada.lidaEm);
    expect(r.resumo.gruposComMudanca).toBe(1);
  });
  test("3 de 10 novos não é mudança: leitura de hoje vale e entra na memória", async () => {
    const hoje = conteudo([...dez.slice(0, 7), ...novos.slice(0, 3)]);
    const r = await analisar("c.xlsx", contatosDez, depsCom(hoje));
    expect(r.grupos[0].mudouFormato).toBeUndefined();
    expect(r.leituras?.["https://orgao.gov.br"]?.lidaEm).toBe(agora().toISOString());
  });
  test("página truncada (2 de 10, todos guardados) continua leitura parcial reaproveitada, não mudança", async () => {
    const r = await analisar("c.xlsx", contatosDez, depsCom(conteudo(dez.slice(0, 2))));
    expect(r.grupos[0].mudouFormato).toBeUndefined();
    expect(r.grupos[0].reaproveitada?.motivo).toBe("página casou 2 de 10 contatos");
  });
  test("mudança que não casa ninguém continua leitura suspeita (inacessível), sem mudouFormato", async () => {
    const r = await analisar("c.xlsx", contatosDez, depsCom(conteudo(menu)));
    expect(r.grupos[0].fonteInacessivel).toBe(true);
    expect(r.grupos[0].erroFonte).toBe(MOTIVO_LEITURA_SUSPEITA);
    expect(r.grupos[0].mudouFormato).toBeUndefined();
    expect(r.resumo.gruposComMudanca).toBe(0);
  });
  test("grupo de um contato nunca tem mudança", async () => {
    const r = await analisar("c.xlsx", [contatosDez[0]], depsCom(conteudo(novos.slice(0, 5))));
    expect(r.grupos[0].mudouFormato).toBeUndefined();
  });
  test("sem memória válida não há com o que comparar: sem mudança", async () => {
    const hoje = conteudo([...novos, ...dez.slice(0, 3)]);
    const r = await analisar("c.xlsx", contatosDez, { ...deps, raspar: async () => hoje, agora });
    expect(r.grupos[0].mudouFormato).toBeUndefined();
  });
});
```

- [ ] **Step 2: Testes de `aplicarNomesDoContatos` em `tests/match.test.ts` e de ponta a ponta em `tests/analise.test.ts`**

```ts
// tests/match.test.ts
import { aplicarNomesDoContatos, compararGrupo } from "@/lib/match";
describe("aplicarNomesDoContatos (spec 2026-10-23 §4.2)", () => {
  const contatos = [{ nome: "Garibaldi Alves Filho", grupo: "G", tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" }, { nome: "Outra Pessoa Qualquer", grupo: "G", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" }];
  const fonte = { url: "https://x.leg.br", textoLimpo: "", destaques: [], pessoas: [{ nome: "Garibaldi Alves" }, { nome: "Outra Pessoa" }] };
  test("nome da lista que casou sai confere com o nome do Contatos; os demais não mudam", () => {
    const g = aplicarNomesDoContatos(compararGrupo("G", contatos, fonte), ["Garibaldi Alves Filho"]);
    const [gar, outra] = g.contatos;
    expect(gar.comparacoes.find((c) => c.campo === "nome")).toMatchObject({ situacao: "confere", valorEsperado: "Garibaldi Alves Filho" });
    expect(gar.semaforo).toBe("verde");
    expect(gar.camposDivergentes.some((d) => d.campo === "nome")).toBe(false);
    expect(outra.comparacoes.find((c) => c.campo === "nome")?.situacao).toBe("divergente");
  });
  test("nome da lista que não casou ninguém continua possível saída", () => {
    const g = aplicarNomesDoContatos(compararGrupo("G", contatos, { ...fonte, pessoas: [{ nome: "Ninguém Conhecido" }] }), ["Garibaldi Alves Filho"]);
    expect(g.contatos[0].possivelSaida).toBe(true);
  });
  test("lista vazia devolve o grupo igual", () => {
    const antes = compararGrupo("G", contatos, fonte);
    expect(aplicarNomesDoContatos(antes, [])).toEqual(antes);
  });
});

// tests/analise.test.ts
test("nomesDoContatos da fonte do grupo faz o nome conferir (spec 2026-10-23 §4.2)", async () => {
  const r = await analisar("c.xlsx", [{ nome: "Garibaldi Alves Filho", grupo: "ORG", ...CADASTRO_OK }], {
    ...deps,
    resolverFonte: () => ({ grupoCanonico: "ORG", fontes: [{ url: "https://orgao.gov.br", ativo: true, nomesDoContatos: ["Garibaldi Alves Filho"] }], fontesIndividuais: [], sugestoes: [] }),
    raspar: async () => ({ ...fonte, pessoas: [{ nome: "Garibaldi Alves" }] }),
  });
  expect(r.grupos[0].contatos[0].semaforo).toBe("verde");
});
```

- [ ] **Step 3: Testes de fonte provisória em `tests/analise-individual.test.ts`**

```ts
test("fonte individual provisória marca o contato e conta no grupo (spec 2026-10-23 §5)", async () => {
  const provisoria: FonteIndividual = { ...individuaisGov[0], provisoria: true };
  const r = await analisar("c.xlsx", [govGo, govRs], { resolverFonte: resolver(RESOLVIDA_MIN, { ...RESOLVIDA_GOV, fontesIndividuais: [provisoria, individuaisGov[1]] }), raspar: rasparDe({ [URL_GO]: paginaGo, [URL_RS]: paginaRs }), extrairComposicao: async () => [] });
  const g = r.grupos[0];
  expect(g.contatos.find((c) => c.contato.nome === govGo.nome)?.provisoria).toBe(true);
  expect(g.contatos.find((c) => c.contato.nome === govRs.nome)?.provisoria).toBeUndefined();
  expect(g.individuais).toEqual({ lidas: 2, caidas: 0, provisorias: 1 });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run tests/analise.test.ts tests/analise-individual.test.ts tests/match.test.ts`
Expected: FAIL nos testes novos.

- [ ] **Step 5: Implementar**

`lib/match.ts`: `export function aplicarNomesDoContatos(grupo: ResultadoGrupo, nomes: readonly string[]): ResultadoGrupo` — conjunto de `normalizarNome(nomes)`; para cada contato com nome no conjunto, sem `possivelSaida` e com comparação `nome` que tem `valorEsperado`: comparação de nome vira `{ ...comp, valorEsperado: contato.nome, situacao: "confere" }`, `camposDivergentes = divergenciasDe(comparacoes)` e `semaforo` recalculado (`amarelo` se houver divergente, senão `verde`), só quando o semáforo era `verde` ou `amarelo`. Lista vazia devolve a entrada.

`lib/analise.ts`, em `analisarGrupo`, logo depois de `lidasHoje`:

```ts
// Decisão 2: a mudança é medida com a leitura de hoje, ANTES do reaproveitamento parcial, e o impede.
const mudanca = detectarMudanca(lidasHoje[0], contatos, deps, agora);
const { lidas, primariaParcial } = mudanca ? { lidas: lidasHoje, primariaParcial: true } : reaproveitarParcial(lidasHoje, contatos, deps, agora);
```

`detectarMudanca(primaria: FonteLida | undefined, contatos, deps, agora): MudancaDeComposicao | undefined`: só quando a primária foi lida hoje (`!reaproveitada`), `contribuiu`, `casamento !== "cargo"` e há `guardadaValida(primaria.fonte, ...)`; `m = nomesNovos(primaria.conteudo.pessoas, guardada.conteudo.pessoas)`; devolve `{ lidaEm: guardada.lidaEm, ...m }` quando `ehMudancaDeComposicao(m, contatos.length)`. No resultado lido: `...(mudanca ? { mudouFormato: mudanca } : {})`. (`primariaParcial: true` reaproveita o mecanismo que já exclui a primária de `leiturasBoas`.) Nos caminhos inacessível e leitura suspeita, nada de `mudouFormato`.

Depois de `compararGrupo`: `const r = aplicarNomesDoContatos(compararGrupo(...), resolvida.fontes.flatMap((f) => f.nomesDoContatos ?? []));`.

`resumir`: `if (g.mudouFormato) resumo.gruposComMudanca += 1`.

`analisarGrupoIndividual`: veredito de contato ligado a fonte com `provisoria` leva `provisoria: true` no `resultado`; `individuais` ganha `provisorias` (contatos com fonte provisória) só quando maior que zero.

- [ ] **Step 6: Rodar e ver passar; suíte inteira; typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/analise.ts lib/match.ts tests/analise.test.ts tests/analise-individual.test.ts tests/match.test.ts
git commit -m "feat: mudança de composição antes do reaproveitamento, nomes em que o Contatos prevalece e fonte provisória"
```

---

### Task 5: Nome mais curto em destaque (`nomeNaPagina`) e títulos em `destaques`

**Files:**
- Modify: `lib/match.ts` (`nomeNaPagina`)
- Modify: `lib/scrape.ts` (`extrairConteudo`: títulos em `destaques`)
- Test: `tests/match-individual.test.ts`, `tests/scrape.test.ts`

**Interfaces:**
- Produces: `nomeNaPagina` reconhece nome mais curto em destaque com `exato: false`; `extrairConteudo` inclui `h1`–`h3` filtrados por `ehNome` em `destaques`.

- [ ] **Step 1: Testes em `tests/match-individual.test.ts`**

```ts
describe("nome mais curto em destaque (spec 2026-10-23 §4.1)", () => {
  const pagina = (destaques: string[], pessoas: { nome: string; cargo?: string }[] = []): ConteudoFonte => ({ url: "https://www.gov.br/x", textoLimpo: "Gabinete do ministro. ".repeat(20), destaques, pessoas });
  test("'Waldez Góes' em destaque reconhece 'Antônio Waldez Góes da Silva' e sai divergente com o nome da página", () => {
    const a = nomeNaPagina("Antônio Waldez Góes da Silva", pagina(["Waldez Góes"]));
    expect(a).toEqual({ nomeNaPagina: "Waldez Góes", exato: false });
  });
  test("pessoa estruturada mais curta reconhece e traz o cargo", () => {
    const a = nomeNaPagina("Antonio Vladimir Moura Lima", pagina([], [{ nome: "Vladimir Lima", cargo: "Ministro de Estado das Cidades" }]));
    expect(a?.pessoa?.cargo).toBe("Ministro de Estado das Cidades");
    expect(a?.exato).toBe(false);
  });
  test("uma parte só não reconhece", () => {
    expect(nomeNaPagina("Antônio Waldez Góes da Silva", pagina(["Waldez"]))).toBeUndefined();
  });
  test("partes fora de ordem não reconhecem", () => {
    expect(nomeNaPagina("Antônio Waldez Góes da Silva", pagina(["Góes Waldez"]))).toBeUndefined();
  });
  test("parte que não está no nome do Contatos não reconhece", () => {
    expect(nomeNaPagina("Antônio Waldez Góes da Silva", pagina(["Waldez Pereira"]))).toBeUndefined();
  });
  test("conectivos não contam como parte: 'Góes da Silva' tem duas partes e reconhece", () => {
    expect(nomeNaPagina("Antônio Waldez Góes da Silva", pagina(["Góes da Silva"]))?.exato).toBe(false);
  });
  test("o veredito do contato é amarelo, nome divergente com o nome da página, nunca saída", () => {
    const v = compararContatoIndividual({ contato: contato({ nome: "Antônio Waldez Góes da Silva" }), fonte: indNome, lida: { conteudo: pagina(["Waldez Góes"]) } });
    expect(v.resultado.semaforo).toBe("amarelo");
    expect(v.resultado.possivelSaida).toBeUndefined();
    expect(v.resultado.comparacoes.find((c) => c.campo === "nome")).toMatchObject({ situacao: "divergente", valorEsperado: "Waldez Góes" });
    expect(v.nomeConfirmado).toBe(true);
  });
});
```

Em `tests/scrape.test.ts`:

```ts
test("títulos h1–h3 que parecem nome entram em destaques (spec 2026-10-23 §4.1)", () => {
  const c = extrairConteudo("<main><h1>Waldez Góes</h1><h2>Composição</h2><p>Ministro de Estado da Integração.</p><strong>Currículo</strong></main>", "https://www.gov.br/x");
  expect(c.destaques).toContain("Waldez Góes");
  expect(c.destaques).not.toContain("Composição");
  expect(c.destaques).not.toContain("Currículo");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/match-individual.test.ts tests/scrape.test.ts`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implementar**

`lib/scrape.ts`, em `extrairConteudo`: além de `strong, b`, coletar o texto de `h1, h2, h3` em `destaquesBrutos` (antes de mutar o DOM); o filtro `ehNome` e o `Set` já existentes valem para eles.

`lib/match.ts`, em `nomeNaPagina`, depois da janela do nome mais longo e antes de `return undefined`:

```ts
const curto = nomeCurtoEmDestaque(tokens, c);
if (curto) return curto;
```

`function nomeCurtoEmDestaque(alvo: readonly string[], c: ConteudoFonte): NomeAchado | undefined`: candidatos = `c.pessoas` (com a pessoa) e depois `c.destaques` (sem pessoa); para cada candidato, `partes = normalizarNome(candidato)` em tokens sem `CONECTIVOS_NOME`; reconhece quando `partes.length >= 2`, `partes.length < alvo.length` e `partes` é subsequência ordenada de `alvo`; devolve `{ pessoa?, nomeNaPagina: <texto original do candidato>, exato: false }`. Uma função `ehSubsequencia(partes, alvo)`.

- [ ] **Step 4: Rodar e ver passar; suíte inteira; typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS (as fixtures existentes não mudam de veredito; se alguma mudar, a causa está no filtro `ehNome` dos títulos e precisa ser olhada, não silenciada).

- [ ] **Step 5: Commit**

```bash
git add lib/match.ts lib/scrape.ts tests/match-individual.test.ts tests/scrape.test.ts
git commit -m "feat: nome mais curto em destaque reconhece o contato e sai Nome diverge"
```

---

### Task 6: Extração por marcador e leitura de PDF (`lib/scrape.ts`, `pdf-parse`)

**Files:**
- Modify: `package.json`, `package-lock.json` (`npm install pdf-parse@2.4.5`)
- Modify: `next.config.ts` (`serverExternalPackages` ganha `"pdf-parse"`)
- Modify: `lib/scrape.ts`
- Modify: `lib/raspagem.ts` (passa `marcador` e `tipo` em `opcoes` de `porFetch`)
- Create: `tests/fixtures/tst-orgaos.html` (recorte anonimizável da página `/orgaos`: estrutura real, nomes trocados por fictícios, mantendo 6 ocorrências de "(convocado)"/"(convocada)" e a palavra de cargo que antecede cada nome)
- Create: `tests/fixtures/stj-composicao.txt` (texto do PDF como `pdf-parse` o devolve, anonimizado, com a linha "Composição – DD/MM/AAAA" e 2 nomes seguidos de `**`)
- Create: `tests/fixtures/pdf-minimo.pdf` (PDF mínimo válido, escrito à mão, com o texto "Fulano De Teste **")
- Test: `tests/scrape.test.ts`, `tests/scrape-pdf.test.ts` (novo)

**Interfaces:**
- Produces: `extrairPorMarcador(texto: string, textos: readonly string[]): PessoaSite[]`; `extrairConteudo(html, url, opcoes?: { marcador?: readonly string[] })`; `OpcoesRaspagem` ganha `marcador?: readonly string[]` e `tipo?: "html" | "pdf"`; `extrairConteudoPdf(bytes: Uint8Array, url: string, opcoes?: { marcador?: readonly string[] }, lerPdf?: LeitorPdf): Promise<ConteudoFonte>`; `type LeitorPdf = (bytes: Uint8Array) => Promise<string>`; `lerTextoPdf: LeitorPdf` (pdf-parse real); `raspar` com `tipo: "pdf"` baixa os bytes e chama `extrairConteudoPdf`.

- [ ] **Step 1: Instalar a dependência e registrar no Next**

Run: `npm install pdf-parse@2.4.5`
`next.config.ts`: `serverExternalPackages: ["jsdom", "puppeteer-core", "pdf-parse"]`. Conferir a API em `node_modules/pdf-parse/README.md` (classe `PDFParse`, `new PDFParse({ data })`, `getText()`, `destroy()`); se a API divergir do esperado, seguir o README.

- [ ] **Step 2: Testes de `extrairPorMarcador` e do HTML do TST em `tests/scrape.test.ts`**

```ts
import { extrairPorMarcador } from "@/lib/scrape";
describe("extração por marcador (spec 2026-10-23 §5.2)", () => {
  test("pessoas cujo nome é seguido do marcador, com cargo = palavra de cargo que antecede + marcador sem parênteses", () => {
    const texto = "Presidente: Ministra Ana Maria Política Completa\nDesembargador Carlos Alberto Exemplo Souza (convocado)\nDesembargadora Dora Exemplo Reis (convocada)\nSecretaria-Geral";
    expect(extrairPorMarcador(texto, ["(convocado)", "(convocada)"])).toEqual([
      { nome: "Carlos Alberto Exemplo Souza", cargo: "Desembargador convocado", origem: "pagina" },
      { nome: "Dora Exemplo Reis", cargo: "Desembargadora convocada", origem: "pagina" },
    ]);
  });
  test("marcador ** sem palavra de cargo antes: pessoa sem cargo", () => {
    expect(extrairPorMarcador("Ana Maria Política Completa **\nBeto Souza", ["**"])).toEqual([{ nome: "Ana Maria Política Completa", origem: "pagina" }]);
  });
  test("nome de uma palavra antes do marcador não vira pessoa", () => {
    expect(extrairPorMarcador("Fulano (convocado)", ["(convocado)"])).toEqual([]);
  });
  test("fixture do TST /orgaos: só os 6 convocados, com cargo", () => {
    const c = extrairConteudo(readFileSync(resolve(__dirname, "fixtures/tst-orgaos.html"), "utf-8"), "https://www.tst.jus.br/orgaos", { marcador: ["(convocado)", "(convocada)"] });
    expect(c.pessoas).toHaveLength(6);
    expect(c.pessoas.every((p) => /^Desembargador(a)? convocad[oa]$/.test(p.cargo ?? ""))).toBe(true);
  });
  test("sem marcador, a mesma fixture segue a extração padrão (dezenas de pessoas)", () => {
    const c = extrairConteudo(readFileSync(resolve(__dirname, "fixtures/tst-orgaos.html"), "utf-8"), "https://www.tst.jus.br/orgaos");
    expect(c.pessoas.length).toBeGreaterThan(6);
  });
});
```

- [ ] **Step 3: Testes de PDF em `tests/scrape-pdf.test.ts`**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { extrairConteudoPdf, lerTextoPdf, raspar } from "@/lib/scrape";

const textoStj = readFileSync(resolve(__dirname, "fixtures/stj-composicao.txt"), "utf-8");
const URL = "https://www.stj.jus.br/x/Composicao-do-STJ.pdf";

describe("leitura de PDF (spec 2026-10-23 §5.1)", () => {
  test("texto do PDF do STJ: os 2 convocados (nomes seguidos de **), com a data da composição no contexto", async () => {
    const c = await extrairConteudoPdf(new Uint8Array(), URL, { marcador: ["**"] }, async () => textoStj);
    expect(c.url).toBe(URL);
    expect(c.pessoas).toHaveLength(2);
    expect(c.pessoas.every((p) => /^Composição – \d{2}\/\d{2}\/\d{4}$/.test(p.contexto ?? ""))).toBe(true);
    expect(c.textoLimpo).toBe(textoStj);
  });
  test("sem marcador, PDF dá texto e nenhuma pessoa", async () => {
    const c = await extrairConteudoPdf(new Uint8Array(), URL, {}, async () => textoStj);
    expect(c.pessoas).toEqual([]);
  });
  test("pdf-parse real lê o PDF mínimo da fixture", async () => {
    const texto = await lerTextoPdf(new Uint8Array(readFileSync(resolve(__dirname, "fixtures/pdf-minimo.pdf"))));
    expect(texto).toContain("Fulano De Teste");
  });
  test("raspar com tipo pdf baixa os bytes e extrai pelo marcador", async () => {
    const bytes = readFileSync(resolve(__dirname, "fixtures/pdf-minimo.pdf"));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => "application/pdf" }, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })));
    const c = await raspar(URL, { tipo: "pdf", marcador: ["**"] });
    expect(c.pessoas.map((p) => p.nome)).toEqual(["Fulano De Teste"]);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run tests/scrape.test.ts tests/scrape-pdf.test.ts`
Expected: FAIL (exports ausentes; fixtures faltando dão erro de leitura: criar as fixtures neste passo, antes de implementar).

- [ ] **Step 5: Implementar em `lib/scrape.ts` e `lib/raspagem.ts`**

`extrairPorMarcador(texto, textos)`: para cada linha e cada ocorrência de um marcador, o trecho anterior na mesma linha até o separador mais próximo (início, `·`, `,`, `;`, `:`, `(`, `|`); nome = sequência final de palavras capitalizadas, conectivos minúsculos permitidos no meio, com 2 ou mais partes significativas; cargo = quando a palavra imediatamente anterior ao nome é token de cargo (`ehTokenDeCargo`), `${palavra} ${marcador sem parênteses e sem asteriscos}` aparado (marcador `**` não gera sufixo); `origem: "pagina"`; sem repetir nome (igualdade após `normalizarNome`).

`extrairConteudo(html, url, opcoes = {})`: com `opcoes.marcador`, `pessoas = extrairPorMarcador(linhas.join("\n"), opcoes.marcador)` no lugar de `segmentarPessoas`.

`extrairConteudoPdf(bytes, url, opcoes = {}, lerPdf = lerTextoPdf)`: `texto = await lerPdf(bytes)`; `pessoas = opcoes.marcador ? extrairPorMarcador(texto, opcoes.marcador) : []`; `contexto` = primeira ocorrência de `/Composição\s*[–-]\s*(\d{2}\/\d{2}\/\d{4})/` no texto, aplicada a cada pessoa como `Composição – DD/MM/AAAA`; devolve `{ url, textoLimpo: texto, destaques: [], pessoas }`. `lerTextoPdf` usa `pdf-parse` e sempre chama `destroy()`.

`raspar(url, opcoes)`: `tipo === "pdf"` → `requisitarBytes` (mesmos headers, mesmo retry TLS, sem decodificar) → `extrairConteudoPdf(bytes, url, { marcador })`; HTML → `extrairConteudo(html, url, { marcador })` quando há marcador. Erros como hoje (`ScrapeError`).

`lib/raspagem.ts`: `opcoes` de `rasparFonte` inclui `marcador: fonte.marcador.textos` e `tipo` quando presentes.

- [ ] **Step 6: Rodar e ver passar; suíte; typecheck; build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS, build verde (se o build reclamar de `pdf-parse`, a causa é o empacotamento e a saída é `serverExternalPackages`, já feita; nunca importar `pdf-parse` fora de `lib/scrape.ts`).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json next.config.ts lib/scrape.ts lib/raspagem.ts tests/scrape.test.ts tests/scrape-pdf.test.ts tests/fixtures/tst-orgaos.html tests/fixtures/stj-composicao.txt tests/fixtures/pdf-minimo.pdf
git commit -m "feat: extração por marcador (TST, STJ) e leitura de PDF com pdf-parse"
```

---

### Task 7: Fixtures e extrator para PGR e Senadores fora de exercício (`/por-tipo`)

**Files:**
- Create: `tests/fixtures/mpf-pgr.html` (recorte anonimizável de `#content-core > .mpf-tailwind` com a moldura da página: nome em `strong`, cargo no parágrafo seguinte)
- Create: `tests/fixtures/senado-por-tipo.html` (recorte com as duas tabelas de mesmo cabeçalho, nomes fictícios; a dos titulares com 3 linhas, a outra com 2)
- Modify: `lib/scrape.ts` (só o que a fixture do PGR exigir)
- Test: `tests/scrape.test.ts`, `tests/scrape-tabela.test.ts`

- [ ] **Step 1: Testes**

```ts
// tests/scrape.test.ts
test("PGR (Plone, nome em strong e cargo no parágrafo seguinte): uma pessoa com nome e cargo (spec 2026-10-23 §5)", () => {
  const c = extrairConteudo(readFileSync(resolve(__dirname, "fixtures/mpf-pgr.html"), "utf-8"), "https://www.mpf.mp.br/o-mpf/o-mpf/membros/procurador-geral-da-republica");
  expect(c.pessoas).toContainEqual(expect.objectContaining({ nome: "Fulano Exemplo Procurador", cargo: expect.stringMatching(/Procurador-Geral da República/) }));
  expect(c.textoLimpo.length).toBeGreaterThan(300);
});

// tests/scrape-tabela.test.ts
test("fora de exercício por tipo: a tabela dos titulares pelo índice cadastrado, com UF e motivo; a outra tabela fica fora (spec 2026-10-23 §5)", () => {
  const html = readFileSync(resolve(__dirname, "fixtures/senado-por-tipo.html"), "utf-8");
  const c = extrairTabela(html, "https://www25.senado.leg.br/web/senadores/fora-de-exercicio/-/f/por-tipo", { indice: INDICE_TITULARES, colunas: { nome: 0, uf: 2, motivo: 3 } });
  expect(c.pessoas).toHaveLength(3);
  expect(c.pessoas[0]).toMatchObject({ uf: expect.stringMatching(/^[A-Z]{2}$/), contexto: expect.any(String) });
});
```

`INDICE_TITULARES` é o índice (0 ou 1) da tabela dos titulares, decidido pela fixture e escrito como literal no teste, com comentário; a Task 8 cadastra o mesmo valor no catálogo e o seu teste repete o literal.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/scrape.test.ts tests/scrape-tabela.test.ts`
Expected: FAIL no PGR (hoje 0 pessoas); o teste do por-tipo deve passar sem mudança de código se a fixture estiver certa (então ele é o registro do índice, não um teste vermelho).

- [ ] **Step 3: Ajustar `extrairConteudo` para o PGR**

Diagnosticar com a fixture: a página real rendeu 112 caracteres de 227 KB, o que aponta para `removerMoldura` (fração de moldura acima de `MAX_FRACAO_MOLDURA`) ou para o miolo fora de `main`. O ajuste é o menor que faça o teste passar sem mudar o veredito das outras fixtures (`npm test` inteiro). Comentar a causa no código.

- [ ] **Step 4: Rodar e ver passar; suíte; typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/scrape.ts tests/scrape.test.ts tests/scrape-tabela.test.ts tests/fixtures/mpf-pgr.html tests/fixtures/senado-por-tipo.html
git commit -m "feat: extrator lê a página do PGR; fixture da lista por tipo dos senadores fora de exercício"
```

---

### Task 8: Catálogo (`data/catalogo.ts`) e `tests/catalogo-dados.test.ts`

**Files:**
- Modify: `data/catalogo.ts`
- Test: `tests/catalogo-dados.test.ts`

**Interfaces:**
- Consumes: campos novos de `FonteCatalogo` e `FonteIndividual` (Task 1); `INDICE_TITULARES` (Task 7).

- [ ] **Step 1: Atualizar os testes do catálogo**

Em `tests/catalogo-dados.test.ts`:
- grupos: `35` (34 + "Senadores fora de exercício");
- fontes: `26` (24 − 3 de fora de exercício nos Senadores + 1 grupo novo + 1 TST `/orgaos` + 1 STJ PDF + 1 PGR + 1 Ex-Presidentes do Senado);
- Senadores (3 faixas): `fontes.map(url)` igual a `["https://www25.senado.leg.br/web/senadores/em-exercicio"]`; o teste "só a fonte de fora de exercício propõe inclusão" sai;
- Governadores: `24` individuais, UFs com `DF` e `PE`; `provisoria: true` **só** em PE e DF, e as duas com `campos: ["nome", "cargo"]`;
- testes novos:

```ts
test("Senadores fora de exercício: grupo novo, tabela por tipo, propõe inclusão", () => {
  const g = CATALOGO.find((x) => x.nome === "Senadores fora de exercício")!;
  expect(g.fontes).toEqual([{ url: "https://www25.senado.leg.br/web/senadores/fora-de-exercicio/-/f/por-tipo", ativo: true, propoeInclusao: true, tabela: { indice: INDICE_TITULARES, colunas: { nome: 0, uf: 2, motivo: 3 } } }]);
});
test("TST: /ministros primária e /orgaos por marcador propondo convocados", () => {
  const tst = CATALOGO.find((g) => g.nome === "Ministros do TST")!;
  expect(tst.fontes.map((f) => f.url)).toEqual(["https://www.tst.jus.br/ministros", "https://www.tst.jus.br/orgaos"]);
  expect(tst.fontes[1]).toMatchObject({ ativo: true, rotulo: "convocado", propoeInclusao: true, marcador: { textos: ["(convocado)", "(convocada)"] } });
});
test("STJ: segunda fonte é o PDF da composição, por marcador **", () => {
  const stj = CATALOGO.find((g) => g.nome === "Ministros do STJ")!;
  expect(stj.fontes[1]).toMatchObject({ url: "https://www.stj.jus.br/sites/portalp/SiteAssets/Paginas/Institucional/Composicao/Composicao-do-STJ.pdf", ativo: true, tipo: "pdf", rotulo: "convocado", propoeInclusao: true, marcador: { textos: ["**"] } });
});
test("PGR e Ex-Presidentes do Senado ganharam fonte; Garibaldi é exceção de nome", () => {
  expect(CATALOGO.find((g) => g.nome === "Procurador-Geral da República")?.fontes).toEqual([{ url: "https://www.mpf.mp.br/o-mpf/o-mpf/membros/procurador-geral-da-republica", ativo: true }]);
  expect(CATALOGO.find((g) => g.nome === "Ex-Presidentes do Senado")?.fontes).toEqual([{ url: "https://www25.senado.leg.br/web/senadores/nova-republica", ativo: true, nomesDoContatos: ["Garibaldi Alves Filho"] }]);
});
test("tipo pdf, marcador, nomesDoContatos e urlAlternativa só onde a spec manda; alternativas em domínio oficial", () => {
  const fontes = CATALOGO.flatMap((g) => g.fontes);
  expect(fontes.filter((f) => f.tipo === "pdf")).toHaveLength(1);
  expect(fontes.filter((f) => f.marcador)).toHaveLength(2);
  expect(fontes.filter((f) => f.nomesDoContatos)).toHaveLength(1);
  const alternativas = CATALOGO.flatMap((g) => [...g.fontes, ...(g.fontesIndividuais ?? [])]).flatMap((f) => (f.urlAlternativa ? [f.urlAlternativa] : []));
  expect(alternativas).toHaveLength(5);
  expect(alternativas.every((u) => u.startsWith("https://www.gov.br/"))).toBe(true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/catalogo-dados.test.ts`
Expected: FAIL.

- [ ] **Step 3: Editar `data/catalogo.ts`**

Cada entrada com comentário curto (data, origem "planilha de 23/10", conferência):
- Senadores (3 faixas): remover a segunda fonte (`fora-de-exercicio`) e o comentário dela.
- Grupo novo, em ordem alfabética entre os grupos de Senadores e "Vice-Presidente da República": `{ nome: "Senadores fora de exercício", fontes: [{ url: ".../fora-de-exercicio/-/f/por-tipo", ativo: true, propoeInclusao: true, tabela: { indice: <INDICE_TITULARES>, colunas: { nome: 0, uf: 2, motivo: 3 } } }] }` (sem responsáveis: decisão 12).
- TST: segunda fonte `/orgaos` (Step 1).
- STJ: segunda fonte PDF (Step 1).
- PGR, Ex-Presidentes do Senado (Step 1).
- Governadores: `{ url: "https://www.tse.jus.br/comunicacao/noticias/2026/Outubro/raquel-lyra-psd-e-reeleita-governadora-de-pernambuco", ativo: true, chave: { uf: "PE" }, campos: ["nome", "cargo"], provisoria: true }` e `{ url: "https://www.cl.df.gov.br/-/celina-leao-toma-posse-como-governadora-do-distrito-federal", ativo: true, chave: { uf: "DF" }, campos: ["nome", "cargo"], provisoria: true }`; atualizar o comentário do bloco (PE e DF provisórias por notícia; MT, MG e SC conferência manual pelo Diário Oficial; RO, TO e ES a rever após 25/10).
- Ministros de Estado, `urlAlternativa` em: Casa Civil `https://www.gov.br/casacivil/pt-br/composicao/gabinete-do-ministro/quem-e-quem-1`; Cultura `https://www.gov.br/cultura/pt-br/composicao/gabinete-da-ministra/margareth-menezes-1`; Defesa `https://www.gov.br/defesa/pt-br/composicao/gabinete-do-ministro/jose-mucio-monteiro-filho`; Igualdade Racial `https://www.gov.br/igualdaderacial/pt-br/composicao/gabinete-da-ministra/rachel-barros-de-oliveira`; Secom `https://www.gov.br/secom/pt-br/composicao/ministro-e-assistencia-direta/sidonio-cardoso-palmeira`.
- Ex-Presidentes da República: continua sem fonte, com comentário "biblioteca2.presidencia.gov.br/acervo/ candidata; respondeu vazio em 23/10".

- [ ] **Step 4: Rodar e ver passar; suíte; typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS (inclusive `tests/catalogo.test.ts` e `tests/catalogo-responsavel.test.ts`; se um deles contar fontes dos Senadores, ajustar o número).

- [ ] **Step 5: Commit**

```bash
git add data/catalogo.ts tests/catalogo-dados.test.ts
git commit -m "feat: catálogo da planilha de 23/10 (convocados TST e STJ, fora de exercício, PGR, Ex-Presidentes do Senado, PE e DF provisórias, alternativas)"
```

---

### Task 9: Tela e export (§6)

**Files:**
- Modify: `lib/painel.ts`
- Modify: `lib/export.ts`
- Modify: `components/painel.tsx` (`EstadoDaFonte` recebe `falhas`), `components/linha-contato.tsx` (procedência)
- Test: `tests/painel.test.ts`, `tests/export.test.ts`

**Interfaces:**
- Produces: `textoAlternativa(a)`, `textoUrlCaida(f)`, `textoMudanca(m)`, `TEXTO_FONTE_PROVISORIA`, `avisoUrlCaida(falhas, url)`; `textoIndividuais` com `provisorias`; `textoSituacaoDosGrupos` com mudança e URLs caídas; `procedenciaDoContato(c, g, falhas?)` com `alternativa?`, `provisoria?`, `caida?` em `LinhaProcedencia`; `resultadoParaLinhas` com as ressalvas novas.

- [ ] **Step 1: Testes em `tests/painel.test.ts`**

```ts
import { avisoUrlCaida, TEXTO_FONTE_PROVISORIA, textoAlternativa, textoMudanca, textoUrlCaida } from "@/lib/painel";
describe("textos da leitura resiliente (spec 2026-10-23 §6)", () => {
  test("cabeçalhos", () => {
    expect(textoAlternativa({ url: "https://x", motivoPrincipal: "HTTP 404" })).toBe("Lida pela URL alternativa; a principal não respondeu (HTTP 404)");
    expect(textoUrlCaida({ desde: "2026-10-19T12:00:00.000Z", coletas: 2, motivo: "HTTP 404" })).toBe("Fonte caída há 2 coletas, desde 19/10: conferir se o endereço mudou");
    expect(textoMudanca({ lidaEm: "2026-10-16T12:00:00.000Z", trocados: 7, total: 10 })).toBe("Composição mudou: 7 de 10 nomes não estavam na leitura de 16/10; confira");
    expect(TEXTO_FONTE_PROVISORIA).toBe("Fonte provisória: notícia");
  });
  test("avisoUrlCaida só com coletas >= 2 e URL presente", () => {
    const falhas = { "https://a": { desde: "2026-10-19T12:00:00.000Z", coletas: 2, motivo: "x" }, "https://b": { desde: "2026-10-19T12:00:00.000Z", coletas: 1, motivo: "x" } };
    expect(avisoUrlCaida(falhas, "https://a")).toMatch(/^Fonte caída há 2 coletas/);
    expect(avisoUrlCaida(falhas, "https://b")).toBeUndefined();
    expect(avisoUrlCaida(undefined, "https://a")).toBeUndefined();
    expect(avisoUrlCaida(falhas, undefined)).toBeUndefined();
  });
  test("textoIndividuais com provisórias", () => {
    expect(textoIndividuais({ lidas: 24, caidas: 1, provisorias: 2 })).toBe("24 páginas individuais lidas · 2 provisórias (notícia) · 1 inacessível");
  });
  test("textoSituacaoDosGrupos com mudança e URLs caídas", () => {
    expect(textoSituacaoDosGrupos({ gruposSemFonte: 3, gruposComMudanca: 1, urlsCaidasRepetidas: 2 })).toBe("3 grupos sem fonte · 1 com mudança de composição · 2 URLs caídas há 2 coletas");
    expect(textoSituacaoDosGrupos({ urlsCaidasRepetidas: 1 })).toBe("1 URL caída há 2 coletas");
  });
  test("procedência do contato: alternativa, provisória e URL caída", () => {
    // montar um ResultadoGrupo com individuais e um contato com `alternativa`, `provisoria` e comparação de nome com fonteUrl; `falhas` com a URL do nome em coletas 2
    const linhas = procedenciaDoContato(c, g, falhas);
    expect(linhas[0]).toMatchObject({ rotulo: "Nome", alternativa: true, provisoria: true, caida: expect.stringMatching(/^Fonte caída há 2 coletas/) });
  });
});
```

(O teste de procedência usa os construtores de grupo e contato já existentes no arquivo.)

- [ ] **Step 2: Testes em `tests/export.test.ts`**

```ts
test("ressalvas da leitura resiliente na coluna Observacao (spec 2026-10-23 §6)", () => {
  // grupo lido com alternativa e mudouFormato, falhas com a fonteUrl do grupo em coletas 2; um contato com alternativa e provisoria
  const linhas = resultadoParaLinhas(analise);
  expect(linhas[0].Observacao).toContain("Lida pela URL alternativa; a principal não respondeu (HTTP 404)");
  expect(linhas[0].Observacao).toContain("Composição mudou: ");
  expect(linhas[0].Observacao).toContain("Fonte caída há 2 coletas");
  expect(linhas[0].Observacao).toContain("Fonte provisória: notícia");
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/painel.test.ts tests/export.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar**

`lib/painel.ts`:
```ts
export function textoAlternativa(a: LeituraAlternativa): string;   // "Lida pela URL alternativa; a principal não respondeu (<motivo>)"
export function textoUrlCaida(f: FalhaDeUrl): string;              // "Fonte caída há N coletas, desde DD/MM: conferir se o endereço mudou"
export function textoMudanca(m: MudancaDeComposicao): string;      // "Composição mudou: X de Y nomes não estavam na leitura de DD/MM; confira"
export const TEXTO_FONTE_PROVISORIA = "Fonte provisória: notícia";
export function avisoUrlCaida(falhas: FalhasPorUrl | undefined, url: string | undefined): string | undefined; // texto quando coletas >= MIN_COLETAS_URL_CAIDA
```
`textoIndividuais`: parte "N provisória(s) (notícia)" entre as reaproveitadas e as inacessíveis. `textoSituacaoDosGrupos`: item de grupo `{ gruposComMudanca, "com mudança de composição" }` depois das reaproveitadas; as URLs caídas são anexadas ao fim com o próprio substantivo ("1 URL caída há 2 coletas" / "N URLs caídas há 2 coletas"), sem o prefixo "grupos". `LinhaProcedencia` ganha `alternativa?: true; provisoria?: true; caida?: string`; `procedenciaDoContato(c, g, falhas?)` preenche: `alternativa` quando `c.alternativa` e a URL da linha é a lida; `provisoria` quando `c.provisoria` (linha do nome); `caida: avisoUrlCaida(falhas, url)`. Para grupo comum, a linha "Nome e cargo" leva `alternativa` quando `g.alternativa`, e `caida` pela `g.fonteUrl`.

`components/painel.tsx`: `EstadoDaFonte` recebe `falhas={retrato.falhas}`; no grupo lido, antes de `reaproveitada`: `g.mudouFormato` → `textoMudanca` em `text-atencao`; `g.alternativa` → `textoAlternativa` em `text-atencao`; `avisoUrlCaida(falhas, g.fonteUrl)` em `text-atencao` (também no ramo inacessível); `(g.individuais?.provisorias ?? 0) > 0` → `TEXTO_FONTE_PROVISORIA`. `components/linha-contato.tsx`: passa `retrato.falhas` à procedência e acrescenta na linha ", pela URL alternativa", ", fonte provisória: notícia" e ", <caida>" quando presentes.

`lib/export.ts`: `ressalvasDoGrupo(g, falhas)` acrescenta `textoAlternativa`, `textoMudanca`, `avisoUrlCaida(falhas, g.fonteUrl)` e `TEXTO_FONTE_PROVISORIA` (quando `individuais.provisorias`); por contato: `c.alternativa` → `Lida pela URL alternativa (<motivo>)`, `c.provisoria` → `TEXTO_FONTE_PROVISORIA`, `avisoUrlCaida(falhas, c.fonteUrl)` em grupo com individuais. Os componentes continuam sem lógica: só chamam as funções.

- [ ] **Step 5: Rodar e ver passar; suíte; typecheck; build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/painel.ts lib/export.ts components/painel.tsx components/linha-contato.tsx tests/painel.test.ts tests/export.test.ts
git commit -m "feat: avisos de URL alternativa, URL caída, mudança de composição e fonte provisória na tela e no export"
```

---

### Task 10: Rota, documentação e verificação final

**Files:**
- Modify: `app/api/analise/route.ts`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-10-23-leitura-resiliente-e-revisao-do-catalogo-design.md` (seção "Ajustes do plano (2026-10-26)" com as decisões 1 a 12 deste plano, em uma linha cada)

- [ ] **Step 1: Rota**

Em `app/api/analise/route.ts`: `const anterior = await lerRetratoAnterior(armazem);` uma vez; `leiturasAnteriores = memoriaDoRetrato(anterior, agora)`; `falhasAnteriores = falhasDoRetrato(anterior)`; `raspar: comRepeticao((fonte) => rasparFonte(fonte, { ...RASPADORES_PADRAO, porJanela: (url, opcoes) => sessao.raspar(url, opcoes) }))`; `falhasAnteriores` em `deps`. `montarRetrato` já espalha `resultado` (`falhas` vai junto); a resposta ao navegador mantém `falhas` (não tem PII). Conferir que `lib/publicar.ts` não precisa mudar (`falhas` vai para a web, decisão 4).

- [ ] **Step 2: CLAUDE.md**

- Tabela de specs: linha de 2026-10-23 passa a "Vigente; implementado (plano de 2026-10-26)".
- "Estado do projeto": contagens da suíte atualizadas (`npm test` diz quantos arquivos e testes), catálogo com 35 grupos, 26 fontes de grupo, 62 fontes individuais (24 Governadores, 38 Ministros), grupos sem fonte recontados (PGR e Ex-Presidentes do Senado saem da lista; "Senadores fora de exercício" existe no catálogo e só aparece com o rótulo na base).
- "Princípios de implementação": parágrafo novo **Leitura resiliente (spec 2026-10-23)** com: 403/401 → janela; repetição 30 s/120 s só para transitórias, nunca para janela; URL alternativa só na falha, `fonteUrl` do grupo é a principal; `falhas` por URL e aviso com 2 coletas; mudança de composição medida pelos nomes novos de hoje, antes do reaproveitamento parcial, não entra na memória e segura a publicação; nome mais curto em destaque é "Nome diverge"; `nomesDoContatos`; fonte provisória; PDF só em `lib/scrape.ts`.
- "Rotina", passo 5 (trava): acrescentar o §7 da spec: segura por `mudouFormato` (tratar como inacessível, rodar de novo, mostrar ao Clovis); não segura mas vai ao relatório: alternativa usada, fonte provisória, URL caída há 2 ou mais coletas (pedir ao Clovis que confira o endereço). Passo 9 (relatório): colunas "alternativa", "caídas repetidas", "mudança".
- Stack: `pdf-parse` (só em `lib/scrape.ts`, `serverExternalPackages`).
- Catálogo, checklist: item 1 ganha a exceção da notícia provisória; item 5 ganha `urlAlternativa` e `provisoria`.
- Fontes citadas no e-mail "ainda não no catálogo": remover senadores fora de exercício, PGR e convocados do TST (entraram); manter deputados em exercício e a OAB.

- [ ] **Step 3: Verificação final**

Run: `npm test && npm run typecheck && npm run build`
Expected: tudo verde. Anotar no commit a contagem de arquivos e testes.

- [ ] **Step 4: Commit**

```bash
git add app/api/analise/route.ts CLAUDE.md docs/superpowers/specs/2026-10-23-leitura-resiliente-e-revisao-do-catalogo-design.md
git commit -m "feat: rota com repetição e falhas por URL; docs da leitura resiliente"
```

---

## Depois do plano (rotina do CLAUDE.md, fora das tarefas)

Push de `feat/leitura-resiliente`, PR para `main` com resumo e plano de teste, merge pelo Clovis, deploy automático conferido, coleta nova pela tela (a base de contatos precisa trazer o rótulo `Senadores fora de exercício` para o grupo novo aparecer), trava do §7, publicação, PRODASEN, relatório com as colunas novas.
