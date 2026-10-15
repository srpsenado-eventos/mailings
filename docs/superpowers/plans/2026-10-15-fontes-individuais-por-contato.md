# Fontes individuais por contato — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Governadores e Ministros de Estado passam a ser auditados por uma página oficial individual por contato (UF ou nome), com a página geral do Planalto reduzida a lista de denominações de cargo e o gov.br lido numa janela do Chrome local.

**Architecture:** O catálogo ganha `fontesIndividuais` por grupo e `campos`/`casamento` por fonte. O orquestrador `lib/analise.ts` ganha um segundo caminho, por contato, só para grupos que têm individuais; os outros 15 grupos seguem pelo caminho atual, intocado. O veredito por campo cabe nas estruturas que já existem (`comparacoes`, `fonteUrl`), com a situação nova `nao_verificado`. As páginas marcadas `navegador: "janela"` passam por uma sessão única do Chrome com janela, aberta pela rota e injetada em `Dependencias`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Vitest, cheerio (`extrairConteudo`), puppeteer-core (Chrome local), SheetJS (export). Sem dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-15-fontes-individuais-por-contato-design.md` (ler antes de qualquer tarefa; os números de seção abaixo, "§", referem-se a ela).

## Global Constraints

- `lib/*.ts` são funções puras: sem JSX, sem `window`, sem leitura de rede fora de `lib/scrape.ts` e `lib/navegador.ts`. Toda função de `lib/` devolve objeto novo; nunca muta a entrada.
- **Sem PII no log nem no prompt.** Nome de contato nunca vai para `console.*`, para `erroFonte`, para `observacao` de grupo nem para a IA. Fonte é identificada pela URL.
- **Regra de ouro:** "possível saída" só com página lida **com conteúdo** (`textoLimpo` com 300 caracteres ou mais, `MIN_TEXTO_PAGINA_INDIVIDUAL`). Página vazia, CAPTCHA ou erro de rede é `erro` da fonte: contato indeterminado, nunca saída.
- A régua de nome contato ↔ chave e contato ↔ página é **igualdade após `normalizarNome`** (`lib/normalize.ts`). Não usar `pontuarPessoa` para isso.
- `nao_verificado` e `fonte_nao_informa` **não** são divergência: não pintam amarelo nem entram em `camposDivergentes`.
- Nenhum teste abre navegador nem acessa a rede: lançador e raspadores são injetados.
- Nenhuma URL fora do catálogo chega ao navegador. Nenhuma dependência nova no `package.json`. Gerenciador é **npm**.
- Comentários, nomes de função, textos de UI e mensagens de commit em português, no padrão do código existente. Commits no formato `<tipo>: <descrição>` (feat, fix, test, docs), terminados com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Antes de cada commit: `npm test` verde no(s) arquivo(s) tocado(s); ao fim de cada tarefa, a suíte inteira verde (`npm test`) e `npm run typecheck` limpo.

## Review Focus

1. **Página individual que carrega só o menu** (texto curto, sem CAPTCHA): precisa sair `erro` da fonte e contato indeterminado, nunca "possível saída". Teste em Task 5 ("página com texto abaixo do mínimo é inacessível, não ausência").
2. **Contato com cargo vazio** num grupo com individuais: não pode haver comparação de cargo nem exceção; a etiqueta "Cargo vazio" do painel continua. Teste em Task 5 ("contato sem cargo não ganha comparação de cargo").
3. **Dois contatos ligados à mesma página individual** (dois contatos com o mesmo nome no Contatos, ou duas UFs iguais): a página é lida uma vez e cada contato recebe seu veredito. Teste em Task 6 ("duas ligações à mesma URL leem a página uma vez").
4. **Ministro cujo cargo não compartilha token nenhum com a lista** (pasta renomeada): cargo `fonte_nao_informa`, não divergente, não exceção. Teste em Task 5 ("sem token em comum, fonte não informa").
5. **Chrome ausente na máquina** com fontes "janela": cada fonte "janela" sai `ScrapeError(MOTIVO_NAVEGADOR_AUSENTE)`, as de `fetch` seguem, nada trava e `fechar()` não lança. Teste em Task 3 ("sem Chrome, cada raspar falha com navegador ausente e fechar não lança").

---

### Task 1: Tipos do catálogo, invariantes e cadastro das 60 fontes

**Files:**
- Modify: `lib/types.ts:244-286` (`FonteCatalogo`, `GrupoCatalogo`)
- Modify: `data/catalogo.ts` (entradas "Governadores" e "Ministros de Estado", linhas ~177-212)
- Modify: `tests/catalogo-dados.test.ts`

**Interfaces:**
- Produces: `CampoFonte`, `ChaveFonteIndividual`, `FonteIndividual`, `FonteCatalogo.campos`, `FonteCatalogo.casamento`, `FonteCatalogo.navegador: true | "janela"`, `GrupoCatalogo.fontesIndividuais` (em `lib/types.ts`), usados por todas as tarefas seguintes.

- [ ] **Step 1: Escrever os testes de invariante (falham: tipos e dados não existem)**

Acrescentar ao fim de `tests/catalogo-dados.test.ts`, dentro do `describe("catálogo real (data/catalogo.ts)")`, e **trocar** o teste "só a fonte do TCU é lida por navegador" pelo primeiro bloco abaixo:

```ts
  test("navegador headless só no TCU; 'janela' só em páginas do gov.br federal", () => {
    const headless = CATALOGO.flatMap((g) => g.fontes.filter((f) => f.navegador === true).map((f) => f.url));
    expect(headless).toEqual(["https://portal.tcu.gov.br/autoridades"]);
    const janela = CATALOGO.flatMap((g) => [
      ...g.fontes.filter((f) => f.navegador === "janela").map((f) => f.url),
      ...(g.fontesIndividuais ?? []).filter((f) => f.navegador === "janela").map((f) => f.url),
    ]);
    expect(janela.length).toBe(39);
    expect(janela.every((u) => u.startsWith("https://www.gov.br/"))).toBe(true);
  });

  describe("fontes individuais (spec 2026-10-15)", () => {
    const DOMINIO_OFICIAL = /^https:\/\/[a-z0-9.-]+\.(gov|jus|leg|mp|def)\.br(\/|$)/i;
    const comIndividuais = CATALOGO.filter((g) => (g.fontesIndividuais ?? []).length > 0);

    test("só Governadores e Ministros de Estado têm fontes individuais", () => {
      expect(comIndividuais.map((g) => g.nome).sort()).toEqual(["Governadores", "Ministros de Estado"]);
    });

    test("Governadores: 22 individuais ativas, por UF, nome e cargo, sem fonte de grupo", () => {
      const g = CATALOGO.find((x) => x.nome === "Governadores")!;
      expect(g.fontes).toEqual([]);
      const ind = g.fontesIndividuais ?? [];
      expect(ind).toHaveLength(22);
      expect(ind.every((f) => f.ativo && "uf" in f.chave && f.campos.length === 2)).toBe(true);
      const ufs = ind.map((f) => ("uf" in f.chave ? f.chave.uf : "")).sort();
      expect(ufs).toEqual(["AC","AL","AM","AP","BA","CE","ES","GO","MA","MS","PA","PB","PI","PR","RJ","RN","RO","RR","RS","SE","SP","TO"]);
    });

    test("Ministros de Estado: geral é lista de cargos com janela; 38 individuais por nome; AGU e CGU cobrem cargo", () => {
      const g = CATALOGO.find((x) => x.nome === "Ministros de Estado")!;
      expect(g.fontes).toHaveLength(1);
      expect(g.fontes[0]).toMatchObject({ ativo: true, casamento: "cargo", campos: ["cargo"], navegador: "janela" });
      const ind = g.fontesIndividuais ?? [];
      expect(ind).toHaveLength(38);
      expect(ind.every((f) => f.ativo && "nome" in f.chave && f.navegador === "janela")).toBe(true);
      const cobremCargo = ind.filter((f) => f.campos.includes("cargo")).map((f) => f.url).sort();
      expect(cobremCargo).toEqual([
        "https://www.gov.br/agu/pt-br/acesso-a-informacao/institucional/quem",
        "https://www.gov.br/cgu/pt-br/composicao/ministro",
      ]);
    });

    test("toda individual é de domínio oficial, tem campos com 'nome' e chave única no grupo", () => {
      for (const g of comIndividuais) {
        const ind = g.fontesIndividuais ?? [];
        expect(ind.filter((f) => !DOMINIO_OFICIAL.test(f.url)).map((f) => f.url)).toEqual([]);
        expect(ind.filter((f) => f.campos.length === 0 || !f.campos.includes("nome")).map((f) => f.url)).toEqual([]);
        const chaves = ind.map((f) => ("uf" in f.chave ? `uf:${f.chave.uf}` : `nome:${normalizarNome(f.chave.nome)}`));
        expect(new Set(chaves).size).toBe(chaves.length);
      }
    });

    test("fonte 'casamento: cargo' só existe em grupo com individual ativa, e cobre só cargo", () => {
      for (const g of CATALOGO) {
        for (const f of g.fontes.filter((x) => x.casamento === "cargo")) {
          expect(f.campos).toEqual(["cargo"]);
          expect((g.fontesIndividuais ?? []).some((i) => i.ativo)).toBe(true);
        }
      }
    });
  });
```

E acrescentar no topo do arquivo: `import { normalizarNome } from "@/lib/normalize";`

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/catalogo-dados.test.ts`
Expected: FAIL (erros de tipo em `fontesIndividuais`/`casamento` e contagens zeradas).

- [ ] **Step 3: Tipos em `lib/types.ts`**

Substituir o bloco `export interface FonteCatalogo { ... }` (linhas 244-264) por:

```ts
/** Campos de que uma fonte é referência (spec 2026-10-15 §3.1). */
export type CampoFonte = "nome" | "cargo";

export interface FonteCatalogo {
  url: string;
  ativo: boolean;
  /**
   * Nota curta mostrada no veredito de quem casar por esta fonte ("fora de exercício").
   * Ausente na fonte principal: casar por ela é o caso normal e não merece nota.
   */
  rotulo?: string;
  /** A página publica a lista como tabela; sem isto vale a extração de texto padrão. */
  tabela?: ExtracaoTabela;
  /**
   * Pessoas desta fonte sem par na planilha viram "novo". Padrão `false`: uma fonte só
   * compõe o grupo; propor inclusão é decisão de cadastro.
   */
  propoeInclusao?: boolean;
  /**
   * `true`: a página monta a lista por JavaScript e é lida pelo Chrome local sem janela
   * (`lib/navegador.ts`, caso TCU). `"janela"`: lida pelo Chrome com janela visível, numa
   * sessão só por varredura — o gov.br responde CAPTCHA ao `fetch` e ao headless (spec
   * 2026-10-15 §2.9). Só em modo local; sem Chrome a fonte sai inacessível.
   */
  navegador?: true | "janela";
  /** De quais campos esta fonte é referência. Ausente: nome e cargo (composição do grupo, regra atual). */
  campos?: readonly CampoFonte[];
  /**
   * Ausente ou "pessoa": compõe o grupo com pessoas (regra atual). "cargo": a página é só
   * uma lista de denominações de cargo — não casa ninguém pelo nome, não gera possível
   * saída nem proposta de inclusão (spec 2026-10-15 §5.3).
   */
  casamento?: "pessoa" | "cargo";
}

/** Chave que liga uma fonte individual ao contato: a UF do cargo, ou o nome como está no Contatos. */
export type ChaveFonteIndividual = { uf: string } | { nome: string };

/**
 * Página oficial de UM contato (spec 2026-10-15 §3). A ligação é pela chave, comparada com
 * `ufDoContato` ou com `normalizarNome`; a página é a referência dos `campos` declarados.
 */
export interface FonteIndividual {
  url: string;
  ativo: boolean;
  chave: ChaveFonteIndividual;
  /** Obrigatório e sempre com "nome": `["nome", "cargo"]` ou `["nome"]`. */
  campos: readonly CampoFonte[];
  navegador?: true | "janela";
}

/** Uma fonte que o raspador sabe ler: o que `FonteCatalogo` e `FonteIndividual` têm em comum. */
export type FonteLegivel = Pick<FonteCatalogo, "url" | "tabela" | "navegador">;
```

E em `GrupoCatalogo` (linhas 271-286) acrescentar, depois de `fontes: FonteCatalogo[];`:

```ts
  /** Páginas individuais, uma por contato, ligadas por UF ou por nome (spec 2026-10-15). */
  fontesIndividuais?: readonly FonteIndividual[];
```

- [ ] **Step 4: Cadastro em `data/catalogo.ts`**

Na entrada `nome: "Governadores"`, trocar `fontes: [],` por:

```ts
    fontes: [],
    // Spec 2026-10-15 §3.2: uma página oficial por UF, transcrita da planilha de conferência
    // do GT (Referencia 2/Conferencia contatos 06_10.xlsx, aba "Sites Governo Estados").
    // Ficam fora, por decisão do Clovis: MT e MG (Diário Oficial), SC (PDF do Diário
    // Oficial), PE (notícia do TSE) e DF (página da vice). Esses cinco saem "cadastrar fonte".
    // MS: a URL tem fragmento "#/QuemEQuem" (página montada por JavaScript); se o fetch
    // não trouxer o nome, trocar para `navegador: true` e registrar aqui.
    fontesIndividuais: [
      { url: "https://estado.ac.gov.br/orgao-entidades/", ativo: true, chave: { uf: "AC" }, campos: ["nome", "cargo"] },
      { url: "https://amapa.gov.br/gestores", ativo: true, chave: { uf: "AP" }, campos: ["nome", "cargo"] },
      { url: "https://www.transparencia.am.gov.br/estrutura-organizacional/", ativo: true, chave: { uf: "AM" }, campos: ["nome", "cargo"] },
      { url: "https://www.pa.gov.br/orgao?id_orgao=2", ativo: true, chave: { uf: "PA" }, campos: ["nome", "cargo"] },
      { url: "https://rondonia.ro.gov.br/?page_id=1207", ativo: true, chave: { uf: "RO" }, campos: ["nome", "cargo"] },
      { url: "https://transparencia.rr.gov.br/principaiscargos", ativo: true, chave: { uf: "RR" }, campos: ["nome", "cargo"] },
      { url: "https://www.to.gov.br/governo", ativo: true, chave: { uf: "TO" }, campos: ["nome", "cargo"] },
      { url: "https://alagoas.al.gov.br/governo/governador-de-alagoas", ativo: true, chave: { uf: "AL" }, campos: ["nome", "cargo"] },
      { url: "https://www.ba.gov.br/comunicacao/equipe-de-governo", ativo: true, chave: { uf: "BA" }, campos: ["nome", "cargo"] },
      { url: "https://www.ce.gov.br/o-governo/", ativo: true, chave: { uf: "CE" }, campos: ["nome", "cargo"] },
      { url: "https://egma.ma.gov.br/integrantes-do-governo", ativo: true, chave: { uf: "MA" }, campos: ["nome", "cargo"] },
      { url: "https://paraiba.pb.gov.br/governadoria/governador-1", ativo: true, chave: { uf: "PB" }, campos: ["nome", "cargo"] },
      { url: "https://www.pi.gov.br/governador/", ativo: true, chave: { uf: "PI" }, campos: ["nome", "cargo"] },
      { url: "https://www.rn.gov.br/postagem/governadora/", ativo: true, chave: { uf: "RN" }, campos: ["nome", "cargo"] },
      { url: "https://www.se.gov.br/agencia/governo", ativo: true, chave: { uf: "SE" }, campos: ["nome", "cargo"] },
      { url: "https://goias.gov.br/administracao-direta/", ativo: true, chave: { uf: "GO" }, campos: ["nome", "cargo"] },
      { url: "https://www.transparencia.ms.gov.br/#/QuemEQuem", ativo: true, chave: { uf: "MS" }, campos: ["nome", "cargo"] },
      { url: "https://www.es.gov.br/governo/governador", ativo: true, chave: { uf: "ES" }, campos: ["nome", "cargo"] },
      { url: "https://www.rj.gov.br/pagina/sobre-o-governo9806", ativo: true, chave: { uf: "RJ" }, campos: ["nome", "cargo"] },
      { url: "https://www.sp.gov.br/sp/institucional/estrutura/!ut/p/z1/04_Sj9CPykssy0xPLMnMz0vMAfIjo8ziDSzMTIyM3Q2MPYyDnQ3MXB3DzJ2NQg0M_Y31wyEKcABHA_0oovTjVhCF3_hw_ShUKwKCg4Am-BpaOvtauhk7-pvhV-DpbAxTgNuSgtzQCINMT0UAo-8oDA!!/", ativo: true, chave: { uf: "SP" }, campos: ["nome", "cargo"] },
      { url: "https://www.parana.pr.gov.br/Pagina/Quemequem", ativo: true, chave: { uf: "PR" }, campos: ["nome", "cargo"] },
      { url: "https://www.estado.rs.gov.br/governadoria", ativo: true, chave: { uf: "RS" }, campos: ["nome", "cargo"] },
    ],
```

Na entrada `nome: "Ministros de Estado"`, substituir o bloco `fontes: [ ... ]` inteiro (o comentário de 2026-09-15 e a entrada do Planalto) por:

```ts
    fontes: [
      // Autorizada pelo Clovis em 2026-09-15 (trocou https://www.gov.br/pt-br/orgaos-do-governo,
      // que lista MINISTÉRIOS sem nomes). Desde o spec 2026-10-15 é só a LISTA DE DENOMINAÇÕES
      // DE CARGO (`casamento: "cargo"`): o nome e a permanência de cada ministro saem da página
      // individual abaixo. A página responde CAPTCHA ao fetch do Node e ao Chrome headless,
      // e vem inteira no Chrome com janela (medido em 2026-10-15): `navegador: "janela"`.
      // Layout cargo numa linha e nome na seguinte, coberto por tests/fixtures/ministros-estado.html.
      { url: "https://www.gov.br/planalto/pt-br/conheca-a-presidencia/ministros-e-ministras", ativo: true, campos: ["cargo"], casamento: "cargo", navegador: "janela" },
    ],
    // Spec 2026-10-15 §3.2: página de cada ministério, transcrita da planilha de conferência
    // do GT (Referencia 2/Conferencia contatos 06_10.xlsx, aba "Sites Governo Estados",
    // colunas F a H). A chave é o nome COMO ESTÁ NO CONTATOS (decisão do Clovis em
    // 2026-10-15: 15 nomes da planilha eram mais curtos que o do Contatos e não casariam
    // pela régua de igualdade normalizada). O comentário de cada linha é o cargo da planilha,
    // só para localizar a linha. AGU e CGU cobrem nome E cargo; as demais, só nome.
    fontesIndividuais: [
      // Ministra de Estado da Casa Civil da Presidência da República
      { url: "https://www.gov.br/casacivil/pt-br/composicao/ministra", ativo: true, chave: { nome: "Miriam Belchior" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Secretaria-Geral da Presidência da República
      { url: "https://www.gov.br/secretariageral/pt-br/composicao/ministro", ativo: true, chave: { nome: "Guilherme Boulos" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Secretaria de Relações Institucionais da Presidência da República
      { url: "https://www.gov.br/sri/pt-br/composicao/ministra-1", ativo: true, chave: { nome: "José Guimarães" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Secretaria de Comunicação Social da Presidência da República
      { url: "https://www.gov.br/secom/pt-br/acesso-a-informacao/institucional/quem-e-quem", ativo: true, chave: { nome: "Sidônio Palmeira" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado Chefe do Gabinete de Segurança Institucional da Presidência da República
      { url: "https://www.gov.br/gsi/pt-br/composicao/gabinete/ministro", ativo: true, chave: { nome: "Marcos Antonio Amaro Dos Santos" }, campos: ["nome"], navegador: "janela" },
      // Advogado-Geral da União
      { url: "https://www.gov.br/agu/pt-br/acesso-a-informacao/institucional/quem", ativo: true, chave: { nome: "Jorge Messias" }, campos: ["nome", "cargo"], navegador: "janela" },
      // Ministro da Controladoria-Geral da União
      { url: "https://www.gov.br/cgu/pt-br/composicao/ministro", ativo: true, chave: { nome: "Vinicius de Carvalho" }, campos: ["nome", "cargo"], navegador: "janela" },
      // Ministro de Estado da Agricultura e Pecuária
      { url: "https://www.gov.br/agricultura/pt-br/composicao/ministro-e-staff/andre-carlos-alves-de-paula-filho", ativo: true, chave: { nome: "André de Paula" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado das Cidades
      { url: "https://www.gov.br/cidades/pt-br/composicao/ministro-das-cidades", ativo: true, chave: { nome: "Antonio Vladimir Moura Lima" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado da Ciência, Tecnologia e Inovação
      { url: "https://www.gov.br/mcti/pt-br/acesso-a-informacao/institucional/quem-e-quem", ativo: true, chave: { nome: "Luciana Santos" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado das Comunicações
      { url: "https://www.gov.br/mcom/pt-br/composicao/ministro", ativo: true, chave: { nome: "Frederico de Siqueira Filho" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado da Cultura
      { url: "https://www.gov.br/cultura/pt-br/composicao/gabinete-da-ministra", ativo: true, chave: { nome: "Margareth Menezes" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Defesa
      { url: "https://www.gov.br/defesa/pt-br/composicao/quem-e-quem", ativo: true, chave: { nome: "José Mucio" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado do Desenvolvimento Agrário e Agricultura Familiar
      { url: "https://www.gov.br/mda/pt-br/acesso-a-informacao/institucional/quem-e-quem/gabinete-da-ministra", ativo: true, chave: { nome: "Fernanda Machiaveli" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Desenvolvimento e Assistência Social, Família e Combate à Fome
      { url: "https://www.gov.br/mds/pt-br/composicao/ministro", ativo: true, chave: { nome: "Wellington Dias" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Desenvolvimento, Indústria, Comércio e Serviços
      { url: "https://www.gov.br/mdic/pt-br/composicao/ministro/marcio-fernando-elias-rosa", ativo: true, chave: { nome: "Márcio Elias Rosa" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado dos Direitos Humanos e da Cidadania
      { url: "https://www.gov.br/mdh/pt-br/composicao/quem-e-quem", ativo: true, chave: { nome: "JANINE MELLO DOS SANTOS" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Educação
      { url: "https://www.gov.br/mec/pt-br/composicao/gabinete-do-ministro/leonardo-osvaldo-barchini-rosa", ativo: true, chave: { nome: "Leonardo Barchini" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Empreendedorismo, da Microempresa e da Empresa de Pequeno Porte
      { url: "https://www.gov.br/memp/pt-br/composicao/ministro/marcio-franca?activeAccordion=accordion-panel-1", ativo: true, chave: { nome: "Paulo Henrique Pereira" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Esporte
      { url: "https://www.gov.br/esporte/pt-br/composicao/Gabinete-do-Ministro/paulo-henrique-perna-cordeiro", ativo: true, chave: { nome: "Paulo Henrique Perna Cordeiro" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Fazenda
      { url: "https://www.gov.br/fazenda/pt-br/composicao/ministro/dario-carnevalli-durigan", ativo: true, chave: { nome: "Dario Carnevalli Durigan" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado da Gestão e da Inovação em Serviços Públicos
      { url: "https://www.gov.br/gestao/pt-br/composicao/quem-e-quem/ministra-e-orgaos-de-assistencia-direta", ativo: true, chave: { nome: "Esther Dweck" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado da Igualdade Racial
      { url: "https://www.gov.br/igualdaderacial/pt-br/composicao/quem-e-quem", ativo: true, chave: { nome: "Rachel Barros" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Integração e do Desenvolvimento Regional
      { url: "https://www.gov.br/mdr/pt-br/composicao/ministro-e-secretarios", ativo: true, chave: { nome: "Antônio Waldez Góes da Silva" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Justiça e Segurança Pública
      { url: "https://www.gov.br/mj/pt-br/acesso-a-informacao/institucional/sumario/quemequem/gabinete-do-ministro-1", ativo: true, chave: { nome: "Wellington César Lima e Silva" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Meio Ambiente e Mudança do Clima
      { url: "https://www.gov.br/mma/pt-br/composicao/gm/quem-e-quem", ativo: true, chave: { nome: "João Paulo Ribeiro Capobianco" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado de Minas e Energia
      { url: "https://www.gov.br/mme/pt-br/composicao/gabinete-do-ministro/alexandre-silveira", ativo: true, chave: { nome: "Alexandre Silveira de Oliveira" }, campos: ["nome"], navegador: "janela" },
      // Ministra de Estado das Mulheres
      { url: "https://www.gov.br/mulheres/pt-br/composicao/ministra/marcia-lopes", ativo: true, chave: { nome: "Márcia Helena Carvalho Lopes" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Pesca e Aquicultura
      { url: "https://www.gov.br/mpa/pt-br/acesso-a-informacao/institucional/quem-e-quem-3/gabinete-do-ministro/ministro", ativo: true, chave: { nome: "Rivetla Edipo Araujo Cruz" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Planejamento e Orçamento
      { url: "https://www.gov.br/planejamento/pt-br/composicao/gabinete-do-ministro/simone-nassar-tebet", ativo: true, chave: { nome: "Bruno Moretti" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado de Portos e Aeroportos
      { url: "https://www.gov.br/portos-e-aeroportos/pt-br/composicao/autoridades-1/tome-monteiro-da-franca?activeAccordion=accordion-panel-1", ativo: true, chave: { nome: "Tomé Monteiro da Franca" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado dos Povos Indígenas
      { url: "https://www.gov.br/povosindigenas/pt-br/composicao/ministro-e-orgaos-de-assistencia-direta/ministro", ativo: true, chave: { nome: "Luiz Henrique Eloy Amado" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Previdência Social
      { url: "https://www.gov.br/previdencia/pt-br/composicao/ministro-e-secretarios", ativo: true, chave: { nome: "Wolney Queiroz" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado das Relações Exteriores
      { url: "https://www.gov.br/mre/pt-br/composicao/gabinete-do-ministro-das-relacoes-exteriores/embaixador-mauro-luiz-iecker-vieira", ativo: true, chave: { nome: "Embaixador Mauro Vieira" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado da Saúde
      { url: "https://www.gov.br/saude/pt-br/composicao/ministro", ativo: true, chave: { nome: "Alexandre Rocha Santos Padilha" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Trabalho e Emprego
      { url: "https://www.gov.br/trabalho-e-emprego/pt-br/composicao/quem-e-quem", ativo: true, chave: { nome: "Luiz Marinho" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado dos Transportes
      { url: "https://www.gov.br/transportes/pt-br/composicao/quem-e-quem", ativo: true, chave: { nome: "GEORGE SANTORO" }, campos: ["nome"], navegador: "janela" },
      // Ministro de Estado do Turismo
      { url: "https://www.gov.br/turismo/pt-br/composicao/gabinete-do-ministro/gustavo-costa-feliciano?activeAccordion=", ativo: true, chave: { nome: "Gustavo Costa Feliciano" }, campos: ["nome"], navegador: "janela" },
    ],
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/catalogo-dados.test.ts && npm run typecheck`
Expected: PASS; typecheck limpo (o resto do código ainda não usa os campos novos, só os tipos).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts data/catalogo.ts tests/catalogo-dados.test.ts
git commit -m "feat: fontes individuais no catálogo (Governadores por UF, Ministros por nome)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Resolução contato→fonte individual

**Files:**
- Modify: `lib/uf.ts` (função `ufDoContato`)
- Modify: `lib/catalogo.ts` (`fonteIndividualDe`, `FonteResolvida.fontesIndividuais`, dono do grupo, `GrupoCadastro`)
- Modify: `lib/types.ts:212-223` (`GrupoCadastro`)
- Test: `tests/catalogo.test.ts`, `tests/uf.test.ts`

**Interfaces:**
- Consumes: `FonteIndividual`, `GrupoCatalogo.fontesIndividuais` (Task 1); `siglaDaUf`, `ufNoTexto` (`lib/uf.ts`); `normalizarNome`.
- Produces: `ufDoContato(contato: Pick<ContatoPlanilha, "departamento" | "cargo" | "orgao">): string | undefined` em `lib/uf.ts`; `fonteIndividualDe(contato: ContatoPlanilha, fontes: readonly FonteIndividual[]): FonteIndividual | undefined` e `FonteResolvida.fontesIndividuais: readonly FonteIndividual[]` em `lib/catalogo.ts`; `GrupoCadastro.fontesIndividuais: number` e `GrupoCadastro.camposFontePrimaria?: readonly CampoFonte[]`.

- [ ] **Step 1: Testes (falham)**

Em `tests/uf.test.ts`, acrescentar:

```ts
describe("ufDoContato", () => {
  test("Departamento por extenso vence; depois o Cargo; depois o Órgão", () => {
    expect(ufDoContato({ departamento: "GOIÁS", cargo: "Governador do Estado de Minas Gerais" })).toBe("GO");
    expect(ufDoContato({ departamento: "", cargo: "Governador do Estado de Minas Gerais" })).toBe("MG");
    expect(ufDoContato({ departamento: "", cargo: "Governador em Exercício", orgao: "Governo do Estado do Rio de Janeiro" })).toBe("RJ");
    expect(ufDoContato({ departamento: "", cargo: "Ministro de Estado da Fazenda" })).toBeUndefined();
  });
});
```

(importar `ufDoContato` de `@/lib/uf` no topo).

Em `tests/catalogo.test.ts`, acrescentar ao fim:

```ts
describe("fonteIndividualDe", () => {
  const porUf: FonteIndividual[] = [
    { url: "https://go.gov.br/governador", ativo: true, chave: { uf: "GO" }, campos: ["nome", "cargo"] },
    { url: "https://mg.gov.br/governador", ativo: false, chave: { uf: "MG" }, campos: ["nome", "cargo"] },
  ];
  const porNome: FonteIndividual[] = [
    { url: "https://www.gov.br/x/ministra", ativo: true, chave: { nome: "Ana Maria Política Completa" }, campos: ["nome"], navegador: "janela" },
  ];

  test("governador casa pela UF lida do Cargo quando o Departamento está vazio", () => {
    const f = fonteIndividualDe({ nome: "Fulano", grupo: "Governadores", departamento: "", cargo: "Governador do Estado de Goiás" }, porUf);
    expect(f?.url).toBe("https://go.gov.br/governador");
  });

  test("fonte inativa não casa, e UF não reconhecida não casa", () => {
    expect(fonteIndividualDe({ nome: "F", grupo: "G", cargo: "Governador do Estado de Minas Gerais" }, porUf)).toBeUndefined();
    expect(fonteIndividualDe({ nome: "F", grupo: "G", cargo: "Governador" }, porUf)).toBeUndefined();
  });

  test("ministro casa pelo nome com igualdade normalizada: acento, caixa e tratamento não importam", () => {
    expect(fonteIndividualDe({ nome: "Ministra ANA MARIA POLITICA COMPLETA", grupo: "M" }, porNome)?.url).toBe("https://www.gov.br/x/ministra");
  });

  test("nome parcial ou diferente não casa (régua da comparação do campo Nome)", () => {
    expect(fonteIndividualDe({ nome: "Ana Maria Completa", grupo: "M" }, porNome)).toBeUndefined();
    expect(fonteIndividualDe({ nome: "Ana Maria Política Completa Souza", grupo: "M" }, porNome)).toBeUndefined();
  });
});

describe("resolverGrupoEFonte com fontes individuais", () => {
  const governadores: GrupoCatalogo = {
    nome: "Governadores",
    fontes: [],
    fontesIndividuais: [{ url: "https://go.gov.br/governador", ativo: true, chave: { uf: "GO" }, campos: ["nome", "cargo"] }],
  };

  test("grupo só com individuais ativas é o dono, e devolve as individuais ativas", () => {
    const r = resolverGrupoEFonte("Governadores", [governadores]);
    expect(r.grupoCanonico).toBe("Governadores");
    expect(r.fontes).toEqual([]);
    expect(r.fontesIndividuais.map((f) => f.url)).toEqual(["https://go.gov.br/governador"]);
  });

  test("grupo sem individuais devolve lista vazia (nunca undefined)", () => {
    expect(resolverGrupoEFonte("STF", [grupoComFonte("STF", "https://a.gov.br")]).fontesIndividuais).toEqual([]);
  });

  test("listarGruposComFonte conta grupo só com individuais como 'com fonte' e expõe os campos da primária", () => {
    const ministros: GrupoCatalogo = {
      nome: "Ministros",
      fontes: [{ url: "https://www.gov.br/planalto/lista", ativo: true, campos: ["cargo"], casamento: "cargo", navegador: "janela" }],
      fontesIndividuais: [{ url: "https://www.gov.br/x/ministra", ativo: true, chave: { nome: "A" }, campos: ["nome"] }],
    };
    const lista = listarGruposComFonte([governadores, ministros]);
    expect(lista.find((g) => g.nome === "Governadores")).toMatchObject({ temFonte: true, fonteUrl: undefined, fontesIndividuais: 1 });
    expect(lista.find((g) => g.nome === "Ministros")).toMatchObject({ temFonte: true, fontesIndividuais: 1, camposFontePrimaria: ["cargo"] });
  });
});
```

(acrescentar `fonteIndividualDe` ao import de `@/lib/catalogo` e `FonteIndividual` ao import de tipos).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/catalogo.test.ts tests/uf.test.ts`
Expected: FAIL ("fonteIndividualDe is not exported", "ufDoContato is not exported").

- [ ] **Step 3: Implementar**

Em `lib/uf.ts`, ao fim:

```ts
/**
 * UF de um contato: o Departamento por extenso (como o Contatos grava nos senadores), senão
 * a UF no fim do Cargo ("Governador do Estado de Goiás"), senão no Órgão. É a mesma ordem
 * que o eixo da eleição usa para governadores (`lib/eleitos-governo.ts`).
 */
export function ufDoContato(contato: { departamento?: string; cargo?: string; orgao?: string }): string | undefined {
  return siglaDaUf(contato.departamento) ?? ufNoTexto(contato.cargo) ?? ufNoTexto(contato.orgao);
}
```

Em `lib/catalogo.ts`:

1. Imports: trocar a linha de tipos por `import type { ContatoPlanilha, FonteCatalogo, FonteIndividual, GrupoCadastro, GrupoCatalogo } from "@/lib/types";`, trocar `import { normalizarTexto }` por `import { normalizarNome, normalizarTexto } from "@/lib/normalize";` e acrescentar `import { ufDoContato } from "@/lib/uf";`.

2. Em `FonteResolvida`, depois de `fontes: FonteCatalogo[];`:

```ts
  /** Fontes individuais ativas do grupo dono, na ordem do catálogo. Vazio quando o grupo não tem. */
  fontesIndividuais: readonly FonteIndividual[];
```

3. Em `resolverGrupoEFonte`: os dois `return` sem grupo passam a `{ fontes: [], fontesIndividuais: [], sugestoes: ... }`; a escolha do dono vira

```ts
  const temFonteAtiva = (g: GrupoCatalogo) =>
    g.fontes.some((f) => f.ativo) || (g.fontesIndividuais ?? []).some((f) => f.ativo);
  const dono = casados.find(temFonteAtiva);
```

e o objeto devolvido ganha `fontesIndividuais: (grupo.fontesIndividuais ?? []).filter((f) => f.ativo),` logo depois de `fontes,`.

4. Função nova, exportada, antes de `mapearGrupo`:

```ts
/**
 * A fonte individual de UM contato (spec 2026-10-15 §4.1). Chave por UF: a UF do contato
 * (`ufDoContato`). Chave por nome: igualdade após `normalizarNome`, a mesma régua da
 * comparação do campo Nome — nome parcial não casa, e o remédio é alinhar o Contatos ou a
 * chave. Só fontes ativas; a chave é única por grupo, então a primeira que casa é a única.
 */
export function fonteIndividualDe(
  contato: ContatoPlanilha,
  fontes: readonly FonteIndividual[],
): FonteIndividual | undefined {
  const uf = ufDoContato(contato);
  const nome = normalizarNome(contato.nome);
  return fontes.find((f) => {
    if (!f.ativo) return false;
    if ("uf" in f.chave) return uf !== undefined && f.chave.uf === uf;
    return nome.length > 0 && normalizarNome(f.chave.nome) === nome;
  });
}
```

5. `mapearGrupo`:

```ts
function mapearGrupo(grupo: GrupoCatalogo): GrupoCadastro {
  const fonteAtiva = grupo.fontes.find((f) => f.ativo);
  const individuais = (grupo.fontesIndividuais ?? []).filter((f) => f.ativo).length;
  return {
    nome: grupo.nome,
    responsavel1: grupo.responsavel1,
    responsavel2: grupo.responsavel2,
    backup: grupo.backup,
    emailResp1: grupo.emailResp1,
    emailResp2: grupo.emailResp2,
    emailBackup: grupo.emailBackup,
    fonteUrl: fonteAtiva?.url,
    temFonte: fonteAtiva !== undefined || individuais > 0,
    fontesIndividuais: individuais,
    ...(fonteAtiva?.campos ? { camposFontePrimaria: fonteAtiva.campos } : {}),
  };
}
```

Em `lib/types.ts`, `GrupoCadastro` ganha, depois de `temFonte: boolean;`:

```ts
  /** Quantidade de fontes individuais ativas (spec 2026-10-15). */
  fontesIndividuais: number;
  /** Campos que a fonte primária cobre, quando ela declara (`["cargo"]` na lista do Planalto). */
  camposFontePrimaria?: readonly CampoFonte[];
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/catalogo.test.ts tests/uf.test.ts tests/catalogo-responsavel.test.ts && npm run typecheck`
Expected: PASS. Se `tests/catalogo-responsavel.test.ts` ou outro comparar `GrupoCadastro` com `toEqual`, acrescentar `fontesIndividuais: 0` ao esperado.

- [ ] **Step 5: Commit**

```bash
git add lib/uf.ts lib/catalogo.ts lib/types.ts tests/catalogo.test.ts tests/uf.test.ts tests/catalogo-responsavel.test.ts
git commit -m "feat: resolução do contato para a fonte individual (UF ou nome)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Sessão do Chrome com janela

**Files:**
- Modify: `lib/navegador.ts`
- Test: `tests/navegador.test.ts`

**Interfaces:**
- Consumes: `localizarChrome`, `comTeto`, `TETO_NAVEGADOR_MS`, `MOTIVO_NAVEGADOR_AUSENTE`, `MOTIVO_NAVEGADOR_TEMPO`, `extrairConteudo`, `extrairTabela`, `ScrapeError`.
- Produces: `type ModoLancamento = { janela?: boolean }`; `Lancador = (caminhoChrome: string, modo?: ModoLancamento) => Promise<PaginaNavegador>`; `interface SessaoNavegador { raspar(url: string, opcoes?: { tabela?: ExtracaoTabela }): Promise<ConteudoFonte>; fechar(): Promise<void> }`; `abrirSessao(opcoes?: OpcoesSessao): SessaoNavegador` com `OpcoesSessao = { timeoutMs?; env?; existe?; lancar? }`.

- [ ] **Step 1: Testes (falham)**

Acrescentar a `tests/navegador.test.ts` (imports: `abrirSessao`, `type ModoLancamento` de `@/lib/navegador`):

```ts
/** Lançador falso de sessão: anota o modo, as URLs na ordem e se fechou; devolve o HTML por URL. */
function lancadorDeSessao(htmlPorUrl: Record<string, string | (() => Promise<string>)>) {
  const estado = { lancamentos: 0, modo: undefined as ModoLancamento | undefined, urls: [] as string[], fechado: false, emAndamento: 0, maxEmAndamento: 0 };
  const lancar: Lancador = async (_caminho, modo) => {
    estado.lancamentos += 1;
    estado.modo = modo;
    return {
      async conteudo(url) {
        estado.urls.push(url);
        estado.emAndamento += 1;
        estado.maxEmAndamento = Math.max(estado.maxEmAndamento, estado.emAndamento);
        try {
          const h = htmlPorUrl[url];
          if (h === undefined) throw new Error("net::ERR_FAILED");
          return typeof h === "function" ? await h() : h;
        } finally {
          estado.emAndamento -= 1;
        }
      },
      async fechar() { estado.fechado = true; },
    };
  };
  return { lancar, estado };
}

describe("abrirSessao (Chrome com janela, spec 2026-10-15 §4.2)", () => {
  test("lança o Chrome uma vez, com janela, só no primeiro raspar, e lê as páginas uma por vez na ordem", async () => {
    const lento = () => new Promise<string>((r) => setTimeout(() => r(HTML), 20));
    const { lancar, estado } = lancadorDeSessao({ "https://www.gov.br/a": lento, "https://www.gov.br/b": HTML });
    const sessao = abrirSessao({ env: envCom("D:/chrome.exe"), existe: existeSempre, lancar });
    expect(estado.lancamentos).toBe(0);
    const [a, b] = await Promise.all([sessao.raspar("https://www.gov.br/a"), sessao.raspar("https://www.gov.br/b")]);
    expect(estado.lancamentos).toBe(1);
    expect(estado.modo).toEqual({ janela: true });
    expect(estado.urls).toEqual(["https://www.gov.br/a", "https://www.gov.br/b"]);
    expect(estado.maxEmAndamento).toBe(1);
    expect(a.pessoas.length).toBeGreaterThan(0);
    expect(b.url).toBe("https://www.gov.br/b");
    await sessao.fechar();
    expect(estado.fechado).toBe(true);
  });

  test("falha de uma página vira ScrapeError com o motivo e não derruba a seguinte", async () => {
    const { lancar } = lancadorDeSessao({ "https://www.gov.br/ok": HTML });
    const sessao = abrirSessao({ env: envCom("D:/chrome.exe"), existe: existeSempre, lancar });
    await expect(sessao.raspar("https://www.gov.br/falha")).rejects.toMatchObject({ motivo: "net::ERR_FAILED" });
    const ok = await sessao.raspar("https://www.gov.br/ok");
    expect(ok.pessoas.length).toBeGreaterThan(0);
    await sessao.fechar();
  });

  test("página que estoura o teto sai 'navegador: tempo esgotado' e a sessão continua", async () => {
    const eterna = () => new Promise<string>(() => undefined);
    const { lancar } = lancadorDeSessao({ "https://www.gov.br/lenta": eterna, "https://www.gov.br/ok": HTML });
    const sessao = abrirSessao({ env: envCom("D:/chrome.exe"), existe: existeSempre, lancar, timeoutMs: 30 });
    await expect(sessao.raspar("https://www.gov.br/lenta")).rejects.toMatchObject({ motivo: MOTIVO_NAVEGADOR_TEMPO });
    expect((await sessao.raspar("https://www.gov.br/ok")).pessoas.length).toBeGreaterThan(0);
    await sessao.fechar();
  });

  test("HTML vazio é ScrapeError('HTML vazio')", async () => {
    const { lancar } = lancadorDeSessao({ "https://www.gov.br/vazia": "   " });
    const sessao = abrirSessao({ env: envCom("D:/chrome.exe"), existe: existeSempre, lancar });
    await expect(sessao.raspar("https://www.gov.br/vazia")).rejects.toMatchObject({ motivo: "HTML vazio" });
    await sessao.fechar();
  });

  test("sem Chrome, cada raspar falha com navegador ausente, nada é lançado e fechar não lança", async () => {
    const { lancar, estado } = lancadorDeSessao({ "https://www.gov.br/a": HTML });
    const sessao = abrirSessao({ env: ENV_VAZIO, existe: () => false, lancar });
    await expect(sessao.raspar("https://www.gov.br/a")).rejects.toMatchObject({ motivo: MOTIVO_NAVEGADOR_AUSENTE });
    await expect(sessao.raspar("https://www.gov.br/a")).rejects.toMatchObject({ motivo: MOTIVO_NAVEGADOR_AUSENTE });
    expect(estado.lancamentos).toBe(0);
    await expect(sessao.fechar()).resolves.toBeUndefined();
  });

  test("Chrome que não sobe: cada raspar falha com a mensagem do lançamento, fechar não lança", async () => {
    const lancar: Lancador = async () => { throw new Error("spawn EACCES"); };
    const sessao = abrirSessao({ env: envCom("D:/chrome.exe"), existe: existeSempre, lancar });
    await expect(sessao.raspar("https://www.gov.br/a")).rejects.toMatchObject({ motivo: "spawn EACCES" });
    await expect(sessao.fechar()).resolves.toBeUndefined();
  });

  test("fechar sem nenhum raspar não lança e não lança o Chrome", async () => {
    const { lancar, estado } = lancadorDeSessao({});
    const sessao = abrirSessao({ env: envCom("D:/chrome.exe"), existe: existeSempre, lancar });
    await sessao.fechar();
    expect(estado.lancamentos).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/navegador.test.ts`
Expected: FAIL ("abrirSessao is not exported").

- [ ] **Step 3: Implementar em `lib/navegador.ts`**

1. Trocar o tipo do lançador e o lançador real:

```ts
/** Como lançar: com janela visível (gov.br responde CAPTCHA ao headless) ou sem (padrão, caso TCU). */
export interface ModoLancamento {
  janela?: boolean;
}

export type Lancador = (caminhoChrome: string, modo?: ModoLancamento) => Promise<PaginaNavegador>;
```

```ts
/** Lançador real via puppeteer-core. Não coberto por teste (abre navegador). */
export const lancarChrome: Lancador = async (caminhoChrome, modo = {}) => {
  const browser = await puppeteer.launch({
    executablePath: caminhoChrome,
    headless: !modo.janela,
    ...(modo.janela ? { args: ["--window-size=1200,900"] } : {}),
  });
  // Uma aba só, reaproveitada: a sessão com janela lê dezenas de páginas em sequência, e
  // uma aba por página deixaria o Chrome com dezenas de abas abertas até o fim da varredura.
  let page: Awaited<ReturnType<typeof browser.newPage>> | undefined;
  return {
    async conteudo(url, timeoutMs) {
      page ??= await browser.newPage();
      // Mesmo valor do teto de `comTeto`, cujo timer é armado antes e dispara primeiro: o motivo fica exato.
      // Headless (TCU): `networkidle0`, a lista chega por XHR e com `networkidle2` vinha pela metade.
      // Janela (gov.br, páginas servidas prontas): `networkidle2`, porque os scripts de analytics do
      // gov.br nunca deixam a rede zerar, e uma pausa curta para o DOM assentar.
      if (modo.janela) {
        await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });
        await new Promise((r) => setTimeout(r, PAUSA_APOS_CARREGAR_MS));
      } else {
        await page.goto(url, { waitUntil: "networkidle0", timeout: timeoutMs });
      }
      return page.content();
    },
    async fechar() {
      await browser.close();
    },
  };
};
```

com a constante, ao lado de `TETO_NAVEGADOR_MS`:

```ts
/** Pausa depois do carregamento na sessão com janela, para o DOM assentar antes de ler o HTML. */
const PAUSA_APOS_CARREGAR_MS = 1_500;
```

2. Ao fim do arquivo, a sessão:

```ts
export interface SessaoNavegador {
  /** Lê UMA URL do catálogo na janela. As chamadas são enfileiradas: uma página por vez. */
  raspar(url: string, opcoes?: { tabela?: ExtracaoTabela }): Promise<ConteudoFonte>;
  /** Fecha o Chrome, se chegou a abrir. Nunca lança. */
  fechar(): Promise<void>;
}

export interface OpcoesSessao {
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  existe?: (caminho: string) => boolean;
  lancar?: Lancador;
}

/**
 * Sessão do Chrome COM JANELA para as fontes `navegador: "janela"` (spec 2026-10-15 §4.2):
 * um Chrome por varredura, lançado no primeiro `raspar`, uma página por vez na mesma aba,
 * com o teto por página. Chrome ausente ou que não sobe faz cada `raspar` falhar com
 * `ScrapeError`, sem travar as fontes lidas por `fetch`. A rota chama `fechar()` no `finally`.
 */
export function abrirSessao(opcoes: OpcoesSessao = {}): SessaoNavegador {
  const timeoutMs = opcoes.timeoutMs ?? TETO_NAVEGADOR_MS;
  const lancar = opcoes.lancar ?? lancarChrome;
  let lancamento: Promise<PaginaNavegador> | undefined;
  // Fila: cada leitura começa quando a anterior termina, com sucesso ou erro.
  let fila: Promise<unknown> = Promise.resolve();

  const pagina = (url: string): Promise<PaginaNavegador> => {
    if (!lancamento) {
      const caminho = localizarChrome(opcoes.env ?? process.env, opcoes.existe ?? existsSync);
      if (!caminho) return Promise.reject(new ScrapeError(url, MOTIVO_NAVEGADOR_AUSENTE));
      lancamento = lancar(caminho, { janela: true });
      // Evita "unhandled rejection" quando o Chrome não sobe: o erro é entregue a cada raspar.
      lancamento.catch(() => undefined);
    }
    return lancamento;
  };

  const lerUma = async (url: string, tabela?: ExtracaoTabela): Promise<ConteudoFonte> => {
    try {
      const p = await pagina(url);
      const html = await comTeto(p.conteudo(url, timeoutMs), timeoutMs);
      if (!html.trim()) throw new ScrapeError(url, "HTML vazio");
      return tabela ? extrairTabela(html, url, tabela) : extrairConteudo(html, url);
    } catch (err) {
      if (err instanceof ScrapeError) throw err;
      if (err instanceof TempoEsgotadoError) throw new ScrapeError(url, MOTIVO_NAVEGADOR_TEMPO);
      throw new ScrapeError(url, err instanceof Error ? err.message : "erro desconhecido");
    }
  };

  return {
    raspar(url, o = {}) {
      const leitura = fila.then(() => lerUma(url, o.tabela));
      fila = leitura.catch(() => undefined);
      return leitura;
    },
    async fechar() {
      if (!lancamento) return;
      try {
        await fila;
        await (await lancamento).fechar();
      } catch {
        /* Chrome que não subiu ou já fechou: nada a fechar */
      }
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/navegador.test.ts && npm run typecheck`
Expected: PASS (os testes antigos de `rasparComNavegador` continuam passando: o lançador antigo recebe o segundo argumento e o ignora).

- [ ] **Step 5: Commit**

```bash
git add lib/navegador.ts tests/navegador.test.ts
git commit -m "feat: sessão do Chrome com janela para fontes do gov.br

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Roteamento "janela" em `rasparFonte`

**Files:**
- Modify: `lib/raspagem.ts`
- Test: `tests/raspagem.test.ts`

**Interfaces:**
- Consumes: `FonteLegivel` (Task 1), `SessaoNavegador` (Task 3).
- Produces: `Raspadores.porJanela: (url: string, opcoes: { tabela?: ExtracaoTabela }) => Promise<ConteudoFonte>`; `RASPADORES_PADRAO` exportado; `rasparFonte(fonte: FonteLegivel, raspadores?: Raspadores)`.

- [ ] **Step 1: Testes (falham)**

Em `tests/raspagem.test.ts`, acrescentar `porJanela: vi.fn(async (url: string) => vazio(url))` a `raspadoresFalsos()` (e ao tipo de retorno), e os testes:

```ts
  test("fonte 'janela' vai pela sessão com janela, nunca pelo headless nem pelo fetch", async () => {
    const r = raspadoresFalsos();
    await rasparFonte({ url: "https://www.gov.br/planalto/lista", ativo: true, navegador: "janela" }, r);
    expect(r.porJanela).toHaveBeenCalledWith("https://www.gov.br/planalto/lista", {});
    expect(r.porNavegador).not.toHaveBeenCalled();
    expect(r.porFetch).not.toHaveBeenCalled();
  });

  test("fonte individual (sem `ativo` nem `tabela`) é legível pelo mesmo caminho", async () => {
    const r = raspadoresFalsos();
    await rasparFonte({ url: "https://go.gov.br/governador" }, r);
    expect(r.porFetch).toHaveBeenCalledWith("https://go.gov.br/governador", {});
  });

  test("sem sessão aberta, fonte 'janela' falha com ScrapeError claro (RASPADORES_PADRAO)", async () => {
    await expect(rasparFonte({ url: "https://www.gov.br/x", navegador: "janela" }, { ...RASPADORES_PADRAO, porFetch: vi.fn(), porNavegador: vi.fn() }))
      .rejects.toMatchObject({ motivo: MOTIVO_SESSAO_AUSENTE });
  });
```

(importar `RASPADORES_PADRAO`, `MOTIVO_SESSAO_AUSENTE` de `@/lib/raspagem`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/raspagem.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `lib/raspagem.ts`**

```ts
import { raspar, ScrapeError, type OpcoesRaspagem } from "@/lib/scrape";
import { rasparComNavegador, type OpcoesNavegador } from "@/lib/navegador";
import type { ConteudoFonte, ExtracaoTabela, FonteLegivel } from "@/lib/types";

/**
 * Escolhe como ler UMA fonte do catálogo: `fetch` + cheerio (padrão), Chrome headless
 * (`navegador: true`, spec 2026-10-02 §5) ou a sessão do Chrome com janela
 * (`navegador: "janela"`, spec 2026-10-15 §4.2). Recebe só fonte do catálogo (de grupo ou
 * individual): nenhuma URL de fora chega ao navegador. Os leitores são injetáveis para teste.
 */
export interface Raspadores {
  porFetch: (url: string, opcoes: OpcoesRaspagem) => Promise<ConteudoFonte>;
  porNavegador: (url: string, opcoes: OpcoesNavegador) => Promise<ConteudoFonte>;
  /** A sessão com janela da varredura (`abrirSessao().raspar`). Sem sessão, a fonte falha. */
  porJanela: (url: string, opcoes: { tabela?: ExtracaoTabela }) => Promise<ConteudoFonte>;
}

export const MOTIVO_SESSAO_AUSENTE = "sessão do navegador com janela não aberta";

export const RASPADORES_PADRAO: Raspadores = {
  porFetch: raspar,
  porNavegador: rasparComNavegador,
  porJanela: async (url) => {
    throw new ScrapeError(url, MOTIVO_SESSAO_AUSENTE);
  },
};

export function rasparFonte(fonte: FonteLegivel, raspadores: Raspadores = RASPADORES_PADRAO): Promise<ConteudoFonte> {
  const opcoes = fonte.tabela ? { tabela: fonte.tabela } : {};
  if (fonte.navegador === "janela") return raspadores.porJanela(fonte.url, opcoes);
  return fonte.navegador ? raspadores.porNavegador(fonte.url, opcoes) : raspadores.porFetch(fonte.url, opcoes);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/raspagem.test.ts && npm run typecheck`
Expected: PASS. O typecheck acusa `Dependencias.raspar` em `lib/analise.ts` (tipo `FonteCatalogo`) e a rota? Não: `FonteCatalogo` é atribuível a `FonteLegivel`. Se acusar, ajustar só o tipo em `Dependencias` para `FonteLegivel` (Task 6 faz isso de qualquer forma).

- [ ] **Step 5: Commit**

```bash
git add lib/raspagem.ts tests/raspagem.test.ts
git commit -m "feat: rasparFonte roteia fontes 'janela' pela sessão do Chrome

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Vereditos por campo para contato com fonte individual

**Files:**
- Modify: `lib/types.ts:91-108` (`SituacaoCampo`, `ComparacaoCampo.fonteUrl`)
- Modify: `lib/match.ts` (funções novas; `marcarFonteInacessivel` com `url` opcional)
- Create: `tests/fixtures/ministerio-individual.html`, `tests/fixtures/governo-estadual.html`
- Test: `tests/match-individual.test.ts` (novo)

**Interfaces:**
- Consumes: `FonteIndividual`, `CampoFonte` (Task 1); `normalizarNome`, `normalizarTexto`; `situacaoCampo`, `tokensSignificativos`, `comparacoesTratamento`, `divergenciasDe` (internas de `lib/match.ts`).
- Produces, em `lib/match.ts`:
  - `MIN_TEXTO_PAGINA_INDIVIDUAL = 300`, `MOTIVO_PAGINA_INDIVIDUAL_SEM_CONTEUDO`, `OBSERVACAO_NAO_CONSTA_INDIVIDUAL`, `OBSERVACAO_SEM_INDIVIDUAL`
  - `paginaComConteudo(c: ConteudoFonte): boolean`
  - `nomeNaPagina(nome: string, c: ConteudoFonte): { pessoa?: PessoaSite } | undefined`
  - `listaDeCargos(c: ConteudoFonte): string[]`
  - `type ListaCargos = { url: string; cargos: readonly string[] } | { url: string; erro: string }`
  - `compararCargoNaLista(cargo: string, lista: readonly string[], fonteUrl: string): ComparacaoCampo`
  - `interface EntradaIndividual { contato; fonte: FonteIndividual; lida: { conteudo?: ConteudoFonte; erro?: string }; listaCargos?: ListaCargos; grupoCanonico?: string }`
  - `interface VereditoIndividual { resultado: ResultadoContato; nomeConfirmado: boolean; lidaComConteudo: boolean; novos: PessoaSite[] }`
  - `compararContatoIndividual(e: EntradaIndividual): VereditoIndividual`
  - `compararContatoSemIndividual(contato, o: { grupoCanonico?: string; listaCargos?: ListaCargos; uf?: string }): ResultadoContato`
  - `novosForaDaPlanilha(pessoas: PessoaSite[], contatos: ContatoPlanilha[]): PessoaSite[]`
  - `marcarFonteInacessivel(grupo, contatos, url: string | undefined, motivo, grupoCanonico?)`
- `lib/types.ts`: `SituacaoCampo` inclui `"nao_verificado"`; `ComparacaoCampo.fonteUrl?: string`.

- [ ] **Step 1: Fixtures**

Criar `tests/fixtures/ministerio-individual.html` (página de gabinete, anonimizada, com texto acima de 300 caracteres):

```html
<!doctype html><html lang="pt-br"><head><title>Ministra — Ministério Exemplar</title></head><body>
<header><nav><ul><li><a href="/">Início</a></li><li><a href="/composicao">Composição</a></li><li><a href="/acesso">Acesso à informação</a></li></ul></nav></header>
<main id="content">
  <h1>Ministra de Estado do Exemplo</h1>
  <div class="documentDescription">Gabinete da Ministra</div>
  <article>
    <h2>Ana Maria Política Completa</h2>
    <p><strong>Ministra de Estado do Exemplo</strong></p>
    <p>Ana Maria Política Completa é formada em Administração Pública e tomou posse como Ministra de Estado do Exemplo em janeiro. Antes, foi secretária-executiva da pasta e presidiu o conselho nacional da área por dois mandatos consecutivos, com atuação reconhecida na gestão de políticas públicas e na articulação federativa com estados e municípios.</p>
    <p>Contato institucional do gabinete: Esplanada dos Ministérios, Bloco Z, Brasília/DF.</p>
  </article>
</main>
<footer><p>Ministério Exemplar · Todos os direitos reservados</p></footer>
</body></html>
```

Criar `tests/fixtures/governo-estadual.html` (página de governo estadual, nome só no texto corrido):

```html
<!doctype html><html lang="pt-br"><head><title>Governador — Governo do Estado Exemplar</title></head><body>
<header><nav><a href="/">Portal</a> <a href="/governo">Governo</a> <a href="/transparencia">Transparência</a></nav></header>
<main>
  <h1>O Governo</h1>
  <section>
    <p>O Governo do Estado Exemplar é conduzido pelo governador João Carlos Destaque Silva, eleito em 2022 e reeleito em 2026, ao lado da vice-governadora Beltrana Souza Lima. A gestão tem como prioridades a educação em tempo integral, a saúde regionalizada e a infraestrutura logística que liga o interior aos portos do litoral.</p>
    <p>O gabinete do governador fica no Palácio do Governo, no centro da capital, e atende de segunda a sexta-feira, das 8h às 18h. As secretarias de Estado e suas respectivas titularidades estão listadas na página da estrutura administrativa.</p>
  </section>
</main>
<footer>Governo do Estado Exemplar</footer>
</body></html>
```

- [ ] **Step 2: Testes (falham)**

Criar `tests/match-individual.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  compararCargoNaLista,
  compararContatoIndividual,
  compararContatoSemIndividual,
  listaDeCargos,
  marcarFonteInacessivel,
  MIN_TEXTO_PAGINA_INDIVIDUAL,
  MOTIVO_PAGINA_INDIVIDUAL_SEM_CONTEUDO,
  nomeNaPagina,
  novosForaDaPlanilha,
  OBSERVACAO_NAO_CONSTA_INDIVIDUAL,
  OBSERVACAO_SEM_INDIVIDUAL,
  paginaComConteudo,
} from "@/lib/match";
import { extrairConteudo } from "@/lib/scrape";
import type { ContatoPlanilha, ConteudoFonte, FonteIndividual } from "@/lib/types";

const fixture = (nome: string) => readFileSync(resolve(__dirname, `fixtures/${nome}`), "utf-8");
const ministerio = extrairConteudo(fixture("ministerio-individual.html"), "https://www.gov.br/exemplo/pt-br/composicao/ministra");
const estado = extrairConteudo(fixture("governo-estadual.html"), "https://www.exemplar.gov.br/governo");

/** Contato com protocolo coerente: o que está sob teste é o site, não a tabela de tratamentos. */
function contato(p: Partial<ContatoPlanilha>): ContatoPlanilha {
  return { nome: "", grupo: "G", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora", ...p };
}
const ministra = contato({ nome: "Ana Maria Política Completa", cargo: "Ministra de Estado do Exemplo" });
const governador = contato({ nome: "João Carlos Destaque Silva", cargo: "Governador do Estado Exemplar", tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" });

const indNome: FonteIndividual = { url: ministerio.url, ativo: true, chave: { nome: ministra.nome }, campos: ["nome"], navegador: "janela" };
const indNomeCargo: FonteIndividual = { url: estado.url, ativo: true, chave: { uf: "EX" }, campos: ["nome", "cargo"] };
const LISTA = { url: "https://www.gov.br/planalto/lista", cargos: ["Ministra de Estado do Exemplo", "Ministro de Estado da Fazenda", "Ministro de Estado das Cidades"] };

const captcha: ConteudoFonte = { url: ministerio.url, textoLimpo: "This question is for testing whether you are a human visitor. What code is in the image?", destaques: [], pessoas: [] };

describe("paginaComConteudo e nomeNaPagina", () => {
  test("fixture do ministério tem conteúdo e traz a pessoa estruturada", () => {
    expect(paginaComConteudo(ministerio)).toBe(true);
    expect(nomeNaPagina("Ministra ANA MARIA POLÍTICA COMPLETA", ministerio)?.pessoa?.nome).toBe("Ana Maria Política Completa");
  });

  test("fixture do governo confirma o nome pelo texto corrido, mesmo sem pessoa estruturada", () => {
    expect(paginaComConteudo(estado)).toBe(true);
    expect(nomeNaPagina("João Carlos Destaque Silva", estado)).toBeDefined();
    const soTexto: ConteudoFonte = { ...estado, pessoas: [] };
    const achado = nomeNaPagina("João Carlos Destaque Silva", soTexto);
    expect(achado).toBeDefined();
    expect(achado?.pessoa).toBeUndefined();
  });

  test("nome parcial ou outro nome não é confirmado; CAPTCHA é página sem conteúdo", () => {
    expect(nomeNaPagina("João Carlos Silva", estado)).toBeUndefined();
    expect(nomeNaPagina("Fulano de Tal", ministerio)).toBeUndefined();
    expect(captcha.textoLimpo.length).toBeLessThan(MIN_TEXTO_PAGINA_INDIVIDUAL);
    expect(paginaComConteudo(captcha)).toBe(false);
  });
});

describe("compararCargoNaLista (cargo pela lista geral, spec §5.3)", () => {
  test("denominação com mais tokens em comum é a esperada; confere pela régua de cargo", () => {
    const c = compararCargoNaLista("Ministra de Estado do Exemplo", LISTA.cargos, LISTA.url);
    expect(c).toMatchObject({ campo: "cargo", situacao: "confere", valorEsperado: "Ministra de Estado do Exemplo", fonteUrl: LISTA.url, origemValor: "pagina" });
  });

  test("gênero diferente da denominação oficial é divergente, com o texto oficial", () => {
    const c = compararCargoNaLista("Ministro de Estado do Exemplo", LISTA.cargos, LISTA.url);
    expect(c).toMatchObject({ situacao: "divergente", valorEsperado: "Ministra de Estado do Exemplo" });
  });

  test("sem token em comum, fonte não informa (pasta renomeada), sem exceção", () => {
    const c = compararCargoNaLista("Ministro de Estado da Economia", LISTA.cargos, LISTA.url);
    expect(c).toMatchObject({ situacao: "fonte_nao_informa", fonteUrl: LISTA.url });
    expect(c.valorEsperado).toBeUndefined();
  });

  test("listaDeCargos tira os cargos únicos das pessoas da página", () => {
    const pagina: ConteudoFonte = { url: "u", textoLimpo: "", destaques: [], pessoas: [{ nome: "A", cargo: "X" }, { nome: "B", cargo: "X" }, { nome: "C" }] };
    expect(listaDeCargos(pagina)).toEqual(["X"]);
  });
});

describe("compararContatoIndividual (tabela §5.2)", () => {
  test("individual lida, nome presente, cargo pela lista confere: verde, nome e cargo com a URL de cada fonte", () => {
    const v = compararContatoIndividual({ contato: ministra, fonte: indNome, lida: { conteudo: ministerio }, listaCargos: LISTA });
    expect(v.resultado.semaforo).toBe("verde");
    expect(v.nomeConfirmado).toBe(true);
    expect(v.lidaComConteudo).toBe(true);
    expect(v.resultado.fonteUrl).toBe(ministerio.url);
    expect(v.resultado.comparacoes.find((c) => c.campo === "nome")).toMatchObject({ situacao: "confere", fonteUrl: ministerio.url });
    expect(v.resultado.comparacoes.find((c) => c.campo === "cargo")).toMatchObject({ situacao: "confere", fonteUrl: LISTA.url });
    expect(v.novos).toEqual([]);
  });

  test("cargo diverge da lista: amarelo com o texto oficial em valorEsperado", () => {
    const v = compararContatoIndividual({ contato: { ...ministra, cargo: "Ministro de Estado do Exemplo" }, fonte: indNome, lida: { conteudo: ministerio }, listaCargos: LISTA });
    expect(v.resultado.semaforo).toBe("amarelo");
    expect(v.resultado.camposDivergentes).toEqual([{ campo: "cargo", valorPlanilha: "Ministro de Estado do Exemplo", valorEncontrado: "Ministra de Estado do Exemplo" }]);
  });

  test("fonte do cargo caiu: cargo 'nao_verificado' com a URL da lista, semáforo pelo nome (verde)", () => {
    const v = compararContatoIndividual({ contato: ministra, fonte: indNome, lida: { conteudo: ministerio }, listaCargos: { url: LISTA.url, erro: "HTTP 403" } });
    expect(v.resultado.semaforo).toBe("verde");
    expect(v.resultado.comparacoes.find((c) => c.campo === "cargo")).toMatchObject({ situacao: "nao_verificado", fonteUrl: LISTA.url });
    expect(v.resultado.camposDivergentes).toEqual([]);
  });

  test("individual cobre cargo (governador): cargo pela pessoa da página, ou fonte não informa sem pessoa estruturada", () => {
    const soTexto: ConteudoFonte = { ...estado, pessoas: [] };
    const v = compararContatoIndividual({ contato: governador, fonte: indNomeCargo, lida: { conteudo: soTexto } });
    expect(v.resultado.semaforo).toBe("verde");
    expect(v.resultado.comparacoes.find((c) => c.campo === "cargo")).toMatchObject({ situacao: "fonte_nao_informa", fonteUrl: estado.url });
    const comPessoa: ConteudoFonte = { ...estado, pessoas: [{ nome: governador.nome, cargo: "Governador do Estado Exemplar" }] };
    const v2 = compararContatoIndividual({ contato: governador, fonte: indNomeCargo, lida: { conteudo: comPessoa } });
    expect(v2.resultado.comparacoes.find((c) => c.campo === "cargo")).toMatchObject({ situacao: "confere", valorEsperado: "Governador do Estado Exemplar" });
  });

  test("individual lida com conteúdo e nome ausente: vermelho, possível saída, pessoas com cargo viram novos com a URL", () => {
    const v = compararContatoIndividual({ contato: { ...ministra, nome: "Outra Pessoa Qualquer" }, fonte: indNome, lida: { conteudo: ministerio }, listaCargos: LISTA });
    expect(v.resultado).toMatchObject({ semaforo: "vermelho", possivelSaida: true, observacao: OBSERVACAO_NAO_CONSTA_INDIVIDUAL, fonteUrl: ministerio.url });
    expect(v.resultado.camposDivergentes[0]).toEqual({ campo: "nome", valorPlanilha: "Outra Pessoa Qualquer" });
    expect(v.resultado.comparacoes.find((c) => c.campo === "cargo")).toBeUndefined();
    expect(v.nomeConfirmado).toBe(false);
    expect(v.lidaComConteudo).toBe(true);
    expect(v.novos.map((n) => [n.nome, n.fonteUrl])).toEqual([["Ana Maria Política Completa", ministerio.url]]);
  });

  test("individual caiu (erro): indeterminado, nome 'nao_verificado', cargo ainda pela lista, motivo na observação", () => {
    const v = compararContatoIndividual({ contato: ministra, fonte: indNome, lida: { erro: "navegador: tempo esgotado" }, listaCargos: LISTA });
    expect(v.resultado.semaforo).toBe("indeterminado");
    expect(v.resultado.possivelSaida).toBeUndefined();
    expect(v.resultado.observacao).toContain("navegador: tempo esgotado");
    expect(v.resultado.comparacoes.find((c) => c.campo === "nome")).toMatchObject({ situacao: "nao_verificado", fonteUrl: ministerio.url });
    expect(v.resultado.comparacoes.find((c) => c.campo === "cargo")).toMatchObject({ situacao: "confere", fonteUrl: LISTA.url });
    expect(v.lidaComConteudo).toBe(false);
    expect(v.novos).toEqual([]);
  });

  test("página com texto abaixo do mínimo (CAPTCHA, só menu) é inacessível, não ausência: nunca possível saída", () => {
    const v = compararContatoIndividual({ contato: ministra, fonte: indNome, lida: { conteudo: captcha }, listaCargos: LISTA });
    expect(v.resultado.semaforo).toBe("indeterminado");
    expect(v.resultado.possivelSaida).toBeUndefined();
    expect(v.resultado.observacao).toContain(MOTIVO_PAGINA_INDIVIDUAL_SEM_CONTEUDO);
    expect(v.lidaComConteudo).toBe(false);
  });

  test("individual caiu e cobre cargo: cargo também 'nao_verificado' com a URL da individual", () => {
    const v = compararContatoIndividual({ contato: governador, fonte: indNomeCargo, lida: { erro: "HTTP 500" } });
    expect(v.resultado.comparacoes.find((c) => c.campo === "cargo")).toMatchObject({ situacao: "nao_verificado", fonteUrl: estado.url });
  });

  test("contato sem cargo não ganha comparação de cargo, em nenhum caminho", () => {
    const semCargo = { ...ministra, cargo: undefined };
    const lida = compararContatoIndividual({ contato: semCargo, fonte: indNome, lida: { conteudo: ministerio }, listaCargos: LISTA });
    const caida = compararContatoIndividual({ contato: semCargo, fonte: indNome, lida: { erro: "x" }, listaCargos: LISTA });
    expect(lida.resultado.comparacoes.find((c) => c.campo === "cargo")).toBeUndefined();
    expect(caida.resultado.comparacoes.find((c) => c.campo === "cargo")).toBeUndefined();
  });

  test("tratamento e endereçamento continuam auditados em todos os caminhos", () => {
    const incoerente = { ...ministra, tratamento: "Senhor" };
    for (const lida of [{ conteudo: ministerio }, { erro: "x" }]) {
      const v = compararContatoIndividual({ contato: incoerente, fonte: indNome, lida, listaCargos: LISTA });
      expect(v.resultado.comparacoes.some((c) => c.origemValor === "coerencia" || c.origemValor === "protocolo")).toBe(true);
    }
  });
});

describe("compararContatoSemIndividual (§5.4)", () => {
  test("grupo com lista de cargos (ministro): indeterminado, nome nao_verificado, cargo pela lista", () => {
    const r = compararContatoSemIndividual(ministra, { listaCargos: LISTA });
    expect(r).toMatchObject({ semaforo: "indeterminado", observacao: OBSERVACAO_SEM_INDIVIDUAL });
    expect(r.fonteUrl).toBeUndefined();
    expect(r.comparacoes.find((c) => c.campo === "nome")).toMatchObject({ situacao: "nao_verificado" });
    expect(r.comparacoes.find((c) => c.campo === "cargo")).toMatchObject({ situacao: "confere", fonteUrl: LISTA.url });
    expect(r.camposDivergentes).toEqual([]);
  });

  test("grupo sem lista de cargos (governador): vermelho com campo 'fonte', observação com a UF", () => {
    const r = compararContatoSemIndividual(governador, { uf: "MT" });
    expect(r.semaforo).toBe("vermelho");
    expect(r.possivelSaida).toBeUndefined();
    expect(r.camposDivergentes[0]).toEqual({ campo: "fonte", valorPlanilha: "sem URL cadastrada" });
    expect(r.observacao).toBe("Sem fonte individual para a UF MT");
    expect(compararContatoSemIndividual(governador, {}).observacao).toBe("UF não reconhecida no cadastro");
  });
});

describe("novosForaDaPlanilha e marcarFonteInacessivel sem URL", () => {
  test("pessoa com cargo que não casa nenhum contato vira novo; quem casa (tokens) não", () => {
    const pessoas = [{ nome: "Ana Maria Política Completa", cargo: "X" }, { nome: "Pessoa Nova da Silva", cargo: "Y" }, { nome: "Sem Cargo Algum" }];
    expect(novosForaDaPlanilha(pessoas, [ministra]).map((p) => p.nome)).toEqual(["Pessoa Nova da Silva"]);
  });

  test("marcarFonteInacessivel aceita url ausente e não grava fonteUrl", () => {
    const g = marcarFonteInacessivel("Governadores", [governador], undefined, "motivo");
    expect(g.fonteUrl).toBeUndefined();
    expect(g.contatos[0].fonteUrl).toBeUndefined();
    expect(g.contatos[0].semaforo).toBe("indeterminado");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/match-individual.test.ts`
Expected: FAIL (exports ausentes).

- [ ] **Step 4: Tipos em `lib/types.ts`**

```ts
export type SituacaoCampo = "confere" | "divergente" | "fonte_nao_informa" | "sem_regra" | "nao_verificado";
```

E em `ComparacaoCampo`, depois de `achado?`:

```ts
  /** Página de onde saiu o valor esperado, ou que se tentou ler quando `nao_verificado` (spec 2026-10-15 §5.1). */
  fonteUrl?: string;
```

Documentar `nao_verificado` no comentário de `SituacaoCampo`: "a fonte daquele campo caiu, ou não existe para o contato; como `fonte_nao_informa`, não é divergência".

- [ ] **Step 5: Implementar em `lib/match.ts`**

1. Import de tipos: acrescentar `FonteIndividual`. Import de `@/lib/normalize` já traz `normalizarNome` e `normalizarTexto`.

2. `marcarFonteInacessivel`: assinatura `url: string | undefined`; no objeto do grupo trocar `fonteUrl: url,` por `...(url ? { fonteUrl: url } : {}),` e, em cada contato, `fonteUrl: url,` por `...(url ? { fonteUrl: url } : {}),`.

3. Ao fim do arquivo:

```ts
// ---------------------------------------------------------------------------
// Fontes individuais por contato (spec 2026-10-15)
// ---------------------------------------------------------------------------

/**
 * Abaixo disto a página individual não conta como lida: é o CAPTCHA do gov.br (uns 200
 * caracteres), o menu sem o miolo, ou uma resposta vazia. Regra de ouro: sem conteúdo não
 * há "ausência", há fonte inacessível. Calibrado pelas fixtures de ministério e de governo.
 */
export const MIN_TEXTO_PAGINA_INDIVIDUAL = 300;
export const MOTIVO_PAGINA_INDIVIDUAL_SEM_CONTEUDO = "página individual sem conteúdo legível (CAPTCHA ou só menu)";
export const OBSERVACAO_NAO_CONSTA_INDIVIDUAL = "Não consta na página individual (possível saída)";
export const OBSERVACAO_SEM_INDIVIDUAL = "Sem fonte individual cadastrada";

export function paginaComConteudo(c: ConteudoFonte): boolean {
  return c.textoLimpo.trim().length >= MIN_TEXTO_PAGINA_INDIVIDUAL;
}

/** Só letras, dígitos e espaços simples: para procurar um nome como trecho de um texto. */
function soPalavras(valor: string): string {
  return normalizarTexto(valor).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * O nome do contato está na página individual? Duas vias (spec §4.3): uma `PessoaSite` com o
 * mesmo nome normalizado, ou o nome inteiro como trecho contíguo do texto, com fronteira de
 * palavra. `{}` (sem `pessoa`) é a segunda via; `undefined` é nome ausente.
 */
export function nomeNaPagina(nome: string, c: ConteudoFonte): { pessoa?: PessoaSite } | undefined {
  const alvo = normalizarNome(nome);
  if (!alvo) return undefined;
  const pessoa = c.pessoas.find((p) => normalizarNome(p.nome) === alvo);
  if (pessoa) return { pessoa };
  const trecho = soPalavras(alvo);
  if (!trecho) return undefined;
  return ` ${soPalavras(c.textoLimpo)} `.includes(` ${trecho} `) ? {} : undefined;
}

/** Denominações de cargo publicadas por uma fonte `casamento: "cargo"`, únicas, na ordem da página. */
export function listaDeCargos(c: ConteudoFonte): string[] {
  return [...new Set(c.pessoas.map((p) => p.cargo?.trim() ?? "").filter((x) => x.length > 0))];
}

export type ListaCargos = { url: string; cargos: readonly string[] } | { url: string; erro: string };

/** Tokens que não distinguem uma pasta da outra: toda denominação de ministro os tem. */
const TOKENS_GENERICOS_CARGO = new Set(["de", "da", "do", "das", "dos", "e", "em", "ministro", "ministra", "estado"]);

function tokensDistintivos(valor: string): string[] {
  return tokensSignificativos(valor).filter((t) => !TOKENS_GENERICOS_CARGO.has(t));
}

/**
 * Cargo do contato contra a lista de denominações da página geral (spec §5.3). A denominação
 * esperada é a de maior sobreposição de tokens distintivos ("fazenda", "casa civil"); sobre
 * ela vale a régua de cargo de sempre (`situacaoCampo`: papel, gênero, prefixo). Sem token em
 * comum com denominação alguma, a lista não informa este cargo. Nome não entra aqui.
 */
export function compararCargoNaLista(cargo: string, lista: readonly string[], fonteUrl: string): ComparacaoCampo {
  const tc = tokensDistintivos(cargo);
  let melhor: { denominacao: string; n: number } | undefined;
  for (const d of lista) {
    const n = tokensDistintivos(d).filter((t) => tc.includes(t)).length;
    if (n > 0 && (!melhor || n > melhor.n)) melhor = { denominacao: d, n };
  }
  if (!melhor) return { campo: "cargo", valorPlanilha: cargo, situacao: "fonte_nao_informa", fonteUrl };
  return {
    campo: "cargo",
    valorPlanilha: cargo,
    valorEsperado: melhor.denominacao,
    origemValor: "pagina",
    situacao: situacaoCampo(cargo, melhor.denominacao),
    fonteUrl,
  };
}

function comparacaoCargoPelaLista(cargo: string, lista: ListaCargos | undefined): ComparacaoCampo {
  if (!lista) return { campo: "cargo", valorPlanilha: cargo, situacao: "nao_verificado" };
  if ("erro" in lista) return { campo: "cargo", valorPlanilha: cargo, situacao: "nao_verificado", fonteUrl: lista.url };
  return compararCargoNaLista(cargo, lista.cargos, lista.url);
}

function comparacoesSemSite(contato: ContatoPlanilha): ComparacaoCampo[] {
  const lista: ComparacaoCampo[] = [];
  for (const campo of ["telefone", "email"] as const) {
    const v = contato[campo];
    if (v) lista.push({ campo, valorPlanilha: v, valorEsperado: undefined, situacao: "fonte_nao_informa" });
  }
  return lista;
}

export interface EntradaIndividual {
  contato: ContatoPlanilha;
  /** A fonte individual que casou o contato. */
  fonte: FonteIndividual;
  /** Leitura da página individual: conteúdo OU motivo da falha. */
  lida: { conteudo?: ConteudoFonte; erro?: string };
  /** Fonte do cargo do grupo (`casamento: "cargo"`), quando o grupo tem; a individual cobre o cargo quando declara. */
  listaCargos?: ListaCargos;
  grupoCanonico?: string;
}

export interface VereditoIndividual {
  resultado: ResultadoContato;
  /** O nome do contato foi encontrado na página individual. */
  nomeConfirmado: boolean;
  /** A página individual foi lida com conteúdo (independe de o nome estar nela). */
  lidaComConteudo: boolean;
  /** Pessoas com cargo da página individual quando o contato não está nela (proposta de inclusão). */
  novos: PessoaSite[];
}

/** Veredito de um contato ligado a uma fonte individual: a tabela da spec 2026-10-15 §5.2. */
export function compararContatoIndividual(e: EntradaIndividual): VereditoIndividual {
  const { contato, fonte, lida, listaCargos, grupoCanonico } = e;
  const url = fonte.url;
  const cobreCargo = fonte.campos.includes("cargo");
  const protocolo = comparacoesTratamento(contato, grupoCanonico);
  const cargoDe = (comp: ComparacaoCampo | undefined): ComparacaoCampo[] => (comp ? [comp] : []);

  const semConteudo = lida.erro !== undefined || lida.conteudo === undefined || !paginaComConteudo(lida.conteudo);
  if (semConteudo) {
    const motivo = lida.erro ?? MOTIVO_PAGINA_INDIVIDUAL_SEM_CONTEUDO;
    const cargo = contato.cargo
      ? cobreCargo
        ? { campo: "cargo", valorPlanilha: contato.cargo, situacao: "nao_verificado" as const, fonteUrl: url }
        : comparacaoCargoPelaLista(contato.cargo, listaCargos)
      : undefined;
    const comparacoes: ComparacaoCampo[] = [
      { campo: "nome", valorPlanilha: contato.nome, situacao: "nao_verificado", fonteUrl: url },
      ...cargoDe(cargo),
      ...comparacoesSemSite(contato),
      ...protocolo,
    ];
    return {
      resultado: {
        contato,
        semaforo: "indeterminado",
        score: 0,
        comparacoes,
        camposDivergentes: divergenciasDe(comparacoes),
        origem: "oficial",
        fonteUrl: url,
        observacao: `Página individual inacessível: ${motivo}`,
      },
      nomeConfirmado: false,
      lidaComConteudo: false,
      novos: [],
    };
  }

  const conteudo = lida.conteudo as ConteudoFonte;
  const achado = nomeNaPagina(contato.nome, conteudo);
  if (!achado) {
    return {
      resultado: {
        contato,
        semaforo: "vermelho",
        score: 0,
        comparacoes: protocolo,
        camposDivergentes: [{ campo: "nome", valorPlanilha: contato.nome }, ...divergenciasDe(protocolo)],
        possivelSaida: true,
        origem: "oficial",
        fonteUrl: url,
        observacao: OBSERVACAO_NAO_CONSTA_INDIVIDUAL,
      },
      nomeConfirmado: false,
      lidaComConteudo: true,
      novos: conteudo.pessoas.filter((p) => Boolean(p.cargo)).map((p) => ({ ...p, origem: "pagina" as const, fonteUrl: url })),
    };
  }

  const cargo = contato.cargo
    ? cobreCargo
      ? {
          campo: "cargo",
          valorPlanilha: contato.cargo,
          valorEsperado: achado.pessoa?.cargo,
          origemValor: "pagina" as const,
          situacao: situacaoCampo(contato.cargo, achado.pessoa?.cargo),
          fonteUrl: url,
        }
      : comparacaoCargoPelaLista(contato.cargo, listaCargos)
    : undefined;
  const comparacoes: ComparacaoCampo[] = [
    { campo: "nome", valorPlanilha: contato.nome, valorEsperado: achado.pessoa?.nome ?? contato.nome, origemValor: "pagina", situacao: "confere", fonteUrl: url },
    ...cargoDe(cargo),
    ...comparacoesSemSite(contato),
    ...protocolo,
  ];
  const camposDivergentes = divergenciasDe(comparacoes);
  return {
    resultado: {
      contato,
      semaforo: camposDivergentes.length > 0 ? "amarelo" : "verde",
      score: 1,
      comparacoes,
      camposDivergentes,
      origem: "oficial",
      fonteUrl: url,
    },
    nomeConfirmado: true,
    lidaComConteudo: true,
    novos: [],
  };
}

/**
 * Contato de grupo com individuais que não casou nenhuma (spec §5.4). Com lista de cargos no
 * grupo (ministro): indeterminado, nome não verificado, cargo pela lista. Sem lista
 * (governador): o vermelho de "cadastrar fonte", como o grupo sem fonte.
 */
export function compararContatoSemIndividual(
  contato: ContatoPlanilha,
  o: { grupoCanonico?: string; listaCargos?: ListaCargos; uf?: string },
): ResultadoContato {
  const protocolo = comparacoesTratamento(contato, o.grupoCanonico);
  if (o.listaCargos) {
    const comparacoes: ComparacaoCampo[] = [
      { campo: "nome", valorPlanilha: contato.nome, situacao: "nao_verificado" },
      ...(contato.cargo ? [comparacaoCargoPelaLista(contato.cargo, o.listaCargos)] : []),
      ...comparacoesSemSite(contato),
      ...protocolo,
    ];
    return {
      contato,
      semaforo: "indeterminado",
      score: 0,
      comparacoes,
      camposDivergentes: divergenciasDe(comparacoes),
      origem: "oficial",
      observacao: OBSERVACAO_SEM_INDIVIDUAL,
    };
  }
  return {
    contato,
    semaforo: "vermelho",
    score: 0,
    comparacoes: protocolo,
    camposDivergentes: [{ campo: "fonte", valorPlanilha: "sem URL cadastrada" }, ...divergenciasDe(protocolo)],
    origem: "oficial",
    observacao: o.uf ? `Sem fonte individual para a UF ${o.uf}` : "UF não reconhecida no cadastro",
  };
}

/**
 * Pessoas com cargo de uma composição de grupo que não casam nenhum contato (régua de
 * tokens, a mesma de `compararGrupo`): proposta de inclusão de uma fonte `casamento:
 * "pessoa"` num grupo que também tem individuais (spec §5.5).
 */
export function novosForaDaPlanilha(pessoas: PessoaSite[], contatos: ContatoPlanilha[]): PessoaSite[] {
  return pessoas.filter(
    (p) => Boolean(p.cargo) && !contatos.some((c) => pontuarPessoa(c.nome, p.nome) >= LIMIAR_PESSOA),
  );
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run tests/match-individual.test.ts tests/match.test.ts tests/scrape.test.ts && npm run typecheck`
Expected: PASS. Se o `nomeNaPagina` do governo falhar, conferir que `extrairConteudo` manteve o parágrafo no `textoLimpo` (ele remove nav/header/footer, não `<main>`); ajustar a fixture, nunca a função. Se um caso "verde" sair amarelo por `tratamento`/`enderecamento`, a tabela de protocolo manda outra forma para aquele cargo: ajustar os valores do contato de teste para os que `tests/match-protocolo.test.ts` usa para o mesmo cargo, nunca a função.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/match.ts tests/match-individual.test.ts tests/fixtures/ministerio-individual.html tests/fixtures/governo-estadual.html
git commit -m "feat: veredito por campo do contato com fonte individual

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Orquestrador por contato e rota com a sessão

**Files:**
- Modify: `lib/analise.ts`
- Modify: `lib/types.ts:134-160` (`ResultadoGrupo.individuais`)
- Modify: `app/api/analise/route.ts`
- Test: `tests/analise-individual.test.ts` (novo); `tests/analise.test.ts` (um teste)

**Interfaces:**
- Consumes: `fonteIndividualDe`, `FonteResolvida.fontesIndividuais` (Task 2); `ufDoContato` (Task 2); `compararContatoIndividual`, `compararContatoSemIndividual`, `listaDeCargos`, `paginaComConteudo`, `novosForaDaPlanilha`, `marcarFonteInacessivel`, `type ListaCargos` (Task 5); `abrirSessao` (Task 3); `rasparFonte`, `RASPADORES_PADRAO` (Task 4); `FonteLegivel` (Task 1).
- Produces: `Dependencias.raspar: (fonte: FonteLegivel) => Promise<ConteudoFonte>`; `ResultadoGrupo.individuais?: { lidas: number; caidas: number }`; `resumir` contando `contatosSemFonte` pelo campo `fonte`.

- [ ] **Step 1: Testes (falham)**

Criar `tests/analise-individual.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { analisar, MOTIVO_LEITURA_SUSPEITA, type Dependencias } from "@/lib/analise";
import { OBSERVACAO_SEM_INDIVIDUAL } from "@/lib/match";
import { extrairConteudo } from "@/lib/scrape";
import type { ContatoPlanilha, ConteudoFonte, FonteIndividual, FonteCatalogo } from "@/lib/types";
import type { FonteResolvida } from "@/lib/catalogo";

const fixture = (nome: string) => readFileSync(resolve(__dirname, `fixtures/${nome}`), "utf-8");
const PROTOCOLO_F = { tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" };
const PROTOCOLO_M = { tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" };

const URL_GERAL = "https://www.gov.br/planalto/pt-br/conheca-a-presidencia/ministros-e-ministras";
const URL_MIN = "https://www.gov.br/exemplo/pt-br/composicao/ministra";
const URL_GO = "https://go.gov.br/governador";
const URL_RS = "https://rs.gov.br/governadoria";

const geral: FonteCatalogo = { url: URL_GERAL, ativo: true, campos: ["cargo"], casamento: "cargo", navegador: "janela" };
const individuaisMin: FonteIndividual[] = [
  { url: URL_MIN, ativo: true, chave: { nome: "Ana Maria Política Completa" }, campos: ["nome"], navegador: "janela" },
];
const individuaisGov: FonteIndividual[] = [
  { url: URL_GO, ativo: true, chave: { uf: "GO" }, campos: ["nome", "cargo"] },
  { url: URL_RS, ativo: true, chave: { uf: "RS" }, campos: ["nome", "cargo"] },
];

const ministra: ContatoPlanilha = { nome: "Ana Maria Política Completa", cargo: "Ministra de Estado do Exemplo", grupo: "Ministros de Estado", ...PROTOCOLO_F };
const ministroSemIndividual: ContatoPlanilha = { nome: "Beltrano Sem Página", cargo: "Ministro de Estado da Fazenda", grupo: "Ministros de Estado", ...PROTOCOLO_M };
const govGo: ContatoPlanilha = { nome: "João Carlos Destaque Silva", cargo: "Governador do Estado de Goiás", grupo: "Governadores", ...PROTOCOLO_M };
const govRs: ContatoPlanilha = { nome: "Pedro Paulo Sul Alegre", cargo: "Governador do Estado do Rio Grande do Sul", grupo: "Governadores", ...PROTOCOLO_M };
const govMt: ContatoPlanilha = { nome: "Fulano Sem Fonte", cargo: "Governador do Estado de Mato Grosso", grupo: "Governadores", ...PROTOCOLO_M };

const paginaMin = extrairConteudo(fixture("ministerio-individual.html"), URL_MIN);
const paginaGeral: ConteudoFonte = {
  url: URL_GERAL,
  textoLimpo: "Ministra de Estado do Exemplo Ana Maria Política Completa Ministro de Estado da Fazenda Fulano Fazenda",
  destaques: [],
  pessoas: [{ nome: "Ana Maria Política Completa", cargo: "Ministra de Estado do Exemplo" }, { nome: "Fulano Fazenda", cargo: "Ministro de Estado da Fazenda" }],
};
const paginaGo = extrairConteudo(fixture("governo-estadual.html"), URL_GO);
const paginaRs: ConteudoFonte = { ...extrairConteudo(fixture("governo-estadual.html"), URL_RS), pessoas: [{ nome: "Pedro Paulo Sul Alegre", cargo: "Governador do Estado do Rio Grande do Sul" }], textoLimpo: `${paginaGo.textoLimpo} Pedro Paulo Sul Alegre`.replace("João Carlos Destaque Silva", "Outro Governador Qualquer") };

function resolver(ministros: FonteResolvida, governadores: FonteResolvida): Dependencias["resolverFonte"] {
  return (grupo) => (grupo === "Ministros de Estado" ? ministros : grupo === "Governadores" ? governadores : { fontes: [], fontesIndividuais: [], sugestoes: [] });
}
const RESOLVIDA_MIN: FonteResolvida = { grupoCanonico: "Ministros de Estado", fontes: [geral], fontesIndividuais: individuaisMin, sugestoes: [] };
const RESOLVIDA_GOV: FonteResolvida = { grupoCanonico: "Governadores", fontes: [], fontesIndividuais: individuaisGov, sugestoes: [] };

/** Raspador por URL: conteúdo, ou erro quando o valor é uma mensagem. */
function rasparDe(mapa: Record<string, ConteudoFonte | string>): Dependencias["raspar"] {
  return async (fonte) => {
    const v = mapa[fonte.url];
    if (v === undefined) throw new Error(`sem página para ${fonte.url}`);
    if (typeof v === "string") throw new Error(v);
    return v;
  };
}

function deps(mapa: Record<string, ConteudoFonte | string>, extra: Partial<Dependencias> = {}): Dependencias {
  return { resolverFonte: resolver(RESOLVIDA_MIN, RESOLVIDA_GOV), raspar: rasparDe(mapa), extrairComposicao: async () => [], ...extra };
}

describe("analisar com fontes individuais (spec 2026-10-15 §4 e §5.5)", () => {
  test("ministro: individual lida e geral lida → verde; grupo lido, fonteUrl é a geral, individuais contadas", async () => {
    const r = await analisar("c.xlsx", [ministra], deps({ [URL_MIN]: paginaMin, [URL_GERAL]: paginaGeral }));
    const g = r.grupos[0];
    expect(g).toMatchObject({ semFonte: false, fonteUrl: URL_GERAL, individuais: { lidas: 1, caidas: 0 } });
    expect(g.fonteInacessivel).toBeUndefined();
    expect(g.erroFonte).toBeUndefined();
    expect(g.contatos[0].semaforo).toBe("verde");
    expect(g.contatos[0].fonteUrl).toBe(URL_MIN);
    expect(r.resumo.gruposSemFonte).toBe(0);
  });

  test("ministro: geral caiu → cargo não verificado, verde pelo nome, erroFonte identifica a geral pela URL", async () => {
    const r = await analisar("c.xlsx", [ministra], deps({ [URL_MIN]: paginaMin, [URL_GERAL]: "HTTP 403" }));
    const g = r.grupos[0];
    expect(g.contatos[0].semaforo).toBe("verde");
    expect(g.contatos[0].comparacoes.find((c) => c.campo === "cargo")?.situacao).toBe("nao_verificado");
    expect(g.erroFonte).toBe(`${URL_GERAL}: HTTP 403`);
    expect(g.fonteInacessivel).toBeUndefined();
  });

  test("ministro: individual caiu e geral lida → indeterminado, cargo conferido, individuais 0/1", async () => {
    const r = await analisar("c.xlsx", [ministra], deps({ [URL_MIN]: "navegador: tempo esgotado", [URL_GERAL]: paginaGeral }));
    const g = r.grupos[0];
    expect(g.contatos[0].semaforo).toBe("indeterminado");
    expect(g.contatos[0].possivelSaida).toBeUndefined();
    expect(g.contatos[0].comparacoes.find((c) => c.campo === "cargo")?.situacao).toBe("confere");
    expect(g.individuais).toEqual({ lidas: 0, caidas: 1 });
    expect(g.erroFonte).toBe(`${URL_MIN}: navegador: tempo esgotado`);
    expect(g.fonteInacessivel).toBeUndefined();
  });

  test("nenhuma fonte lida (CAPTCHA em todas) → grupo inacessível, todos indeterminados, nunca saída", async () => {
    const captcha = (url: string): ConteudoFonte => ({ url, textoLimpo: "What code is in the image?", destaques: [], pessoas: [] });
    const r = await analisar("c.xlsx", [ministra, ministroSemIndividual], deps({ [URL_MIN]: captcha(URL_MIN), [URL_GERAL]: captcha(URL_GERAL) }));
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBe(true);
    expect(g.contatos.every((c) => c.semaforo === "indeterminado" && !c.possivelSaida)).toBe(true);
    expect(g.erroFonte).toContain("1 página individual inacessível");
    expect(r.resumo.gruposFonteInacessivel).toBe(1);
  });

  test("ministro sem individual: indeterminado, cargo pela geral, observação própria; não conta como sem fonte", async () => {
    const r = await analisar("c.xlsx", [ministroSemIndividual], deps({ [URL_GERAL]: paginaGeral }));
    const c = r.grupos[0].contatos[0];
    expect(c).toMatchObject({ semaforo: "indeterminado", observacao: OBSERVACAO_SEM_INDIVIDUAL });
    expect(c.comparacoes.find((x) => x.campo === "cargo")).toMatchObject({ situacao: "confere", fonteUrl: URL_GERAL });
    expect(r.resumo.contatosSemFonte).toBe(0);
    expect(r.grupos[0].individuais).toEqual({ lidas: 0, caidas: 0 });
  });

  test("governadores: cada um pela sua página; sem individual (MT) é vermelho 'cadastrar fonte' e conta em contatosSemFonte; grupo sem fonteUrl", async () => {
    const r = await analisar("c.xlsx", [govGo, govRs, govMt], deps({ [URL_GO]: paginaGo, [URL_RS]: paginaRs }));
    const g = r.grupos[0];
    expect(g.semFonte).toBe(false);
    expect(g.fonteUrl).toBeUndefined();
    const [go, rs, mt] = g.contatos;
    expect(go.semaforo).toBe("verde");
    expect(go.fonteUrl).toBe(URL_GO);
    expect(rs.semaforo).toBe("verde");
    expect(rs.comparacoes.find((c) => c.campo === "cargo")?.situacao).toBe("confere");
    expect(mt.semaforo).toBe("vermelho");
    expect(mt.possivelSaida).toBeUndefined();
    expect(mt.camposDivergentes[0].campo).toBe("fonte");
    expect(mt.observacao).toBe("Sem fonte individual para a UF MT");
    expect(r.resumo.contatosSemFonte).toBe(1);
    expect(r.resumo.gruposSemFonte).toBe(0);
    expect(g.individuais).toEqual({ lidas: 2, caidas: 0 });
  });

  test("governador que saiu: página lida sem o nome → possível saída, com o novo titular em novos", async () => {
    const trocada: ConteudoFonte = { ...paginaGo, pessoas: [{ nome: "Novo Titular do Estado", cargo: "Governador" }], textoLimpo: paginaGo.textoLimpo.replace("João Carlos Destaque Silva", "Novo Titular do Estado") };
    const r = await analisar("c.xlsx", [govGo, govRs], deps({ [URL_GO]: trocada, [URL_RS]: paginaRs }));
    const g = r.grupos[0];
    expect(g.contatos[0]).toMatchObject({ semaforo: "vermelho", possivelSaida: true });
    expect(g.novos.map((n) => [n.nome, n.fonteUrl])).toEqual([["Novo Titular do Estado", URL_GO]]);
    expect(r.resumo.possivelSaida).toBe(1);
  });

  test("guarda de grupo: duas individuais lidas e nenhuma confirma o nome → leitura suspeita, sem novos", async () => {
    const semGo: ConteudoFonte = { ...paginaGo, pessoas: [], textoLimpo: paginaGo.textoLimpo.replace("João Carlos Destaque Silva", "Alguém Diferente Aqui") };
    const semRs: ConteudoFonte = { ...paginaRs, pessoas: [], textoLimpo: paginaRs.textoLimpo.replace("Pedro Paulo Sul Alegre", "Outra Pessoa Lá") };
    const r = await analisar("c.xlsx", [govGo, govRs], deps({ [URL_GO]: semGo, [URL_RS]: semRs }));
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBe(true);
    expect(g.erroFonte).toBe(MOTIVO_LEITURA_SUSPEITA);
    expect(g.contatos.every((c) => c.semaforo === "indeterminado" && !c.possivelSaida)).toBe(true);
    expect(g.novos).toEqual([]);
  });

  test("uma individual lida sem o nome, com só uma lida no grupo, continua saída (a guarda exige duas)", async () => {
    const semGo: ConteudoFonte = { ...paginaGo, pessoas: [], textoLimpo: paginaGo.textoLimpo.replace("João Carlos Destaque Silva", "Alguém Diferente Aqui") };
    const r = await analisar("c.xlsx", [govGo, govRs], deps({ [URL_GO]: semGo, [URL_RS]: "HTTP 500" }));
    expect(r.grupos[0].contatos[0].possivelSaida).toBe(true);
    expect(r.grupos[0].contatos[1].semaforo).toBe("indeterminado");
  });

  test("duas ligações à mesma URL leem a página uma vez; individual sem contato não é lida", async () => {
    const raspar = vi.fn(rasparDe({ [URL_GO]: paginaGo, [URL_RS]: paginaRs }));
    const outroGo: ContatoPlanilha = { ...govGo, nome: "Vice Governador de Goiás" };
    await analisar("c.xlsx", [govGo, outroGo], deps({}, { raspar }));
    expect(raspar.mock.calls.map((c) => c[0].url)).toEqual([URL_GO]);
  });

  test("IA não é chamada para grupo cuja primária é lista de cargos", async () => {
    const extrairComposicao = vi.fn(async () => []);
    await analisar("c.xlsx", [ministra], deps({ [URL_MIN]: paginaMin, [URL_GERAL]: paginaGeral }, { extrairComposicao }));
    expect(extrairComposicao).not.toHaveBeenCalled();
  });

  test("erroFonte e observações nunca trazem nome de contato", async () => {
    const r = await analisar("c.xlsx", [ministra, govGo], deps({ [URL_MIN]: "HTTP 403", [URL_GERAL]: "HTTP 403", [URL_GO]: "HTTP 403" }));
    const textos = r.grupos.flatMap((g) => [g.erroFonte ?? "", ...g.contatos.map((c) => c.observacao ?? "")]).join(" ");
    expect(textos).not.toContain("Ana Maria");
    expect(textos).not.toContain("João Carlos");
  });
});
```

Em `tests/analise.test.ts`, no objeto `deps`, acrescentar `fontesIndividuais: []` aos dois retornos de `resolverFonte` (o tipo `FonteResolvida` passou a exigir o campo). Procurar com `grep -n "sugestoes: \[\]" tests/*.test.ts` outros `FonteResolvida` literais (por exemplo `tests/eleitos*.test.ts`) e acrescentar o campo neles também.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/analise-individual.test.ts`
Expected: FAIL (grupo com individuais cai no caminho antigo: Governadores sai `semFonte: true`).

- [ ] **Step 3: `ResultadoGrupo.individuais` em `lib/types.ts`**

Depois de `viaPesquisaAmpla?: boolean;` (e seu comentário):

```ts
  /** Páginas individuais ligadas a contatos do grupo: lidas com conteúdo e caídas (spec 2026-10-15 §6.1). */
  individuais?: { lidas: number; caidas: number };
```

- [ ] **Step 4: Implementar em `lib/analise.ts`**

1. Imports: trocar o bloco de tipos para incluir `FonteIndividual`, `FonteLegivel`, `ResultadoContato`; de `@/lib/match` importar também `compararContatoIndividual, compararContatoSemIndividual, listaDeCargos, novosForaDaPlanilha, paginaComConteudo, type ListaCargos`; de `@/lib/catalogo` importar `fonteIndividualDe` (valor) além do tipo `FonteResolvida`; de `@/lib/uf` importar `ufDoContato`.

2. `Dependencias.raspar` passa a `(fonte: FonteLegivel) => Promise<ConteudoFonte>` (comentário: "Raspa UMA fonte do catálogo, de grupo ou individual, com a extração que ela declara.").

3. Em `analisarGrupo`, logo depois do `if (!resolvida.grupoCanonico) {...}`:

```ts
  // Grupo com fontes individuais (spec 2026-10-15): caminho por contato. Os demais seguem abaixo.
  if (resolvida.fontesIndividuais.length > 0) {
    return comResponsavel(await analisarGrupoIndividual(grupo, contatos, resolvida, deps), resolvida.responsavel);
  }
```

e, na Camada 2 do caminho atual, trocar `const pessoasIA = await deps.extrairComposicao(...)` por:

```ts
  // Fonte que é só lista de cargos não tem composição de pessoas a refinar: a IA não roda.
  const primariaCasaPessoa = (resolvida.fontes[0]?.casamento ?? "pessoa") === "pessoa";
  const pessoasIA = primariaCasaPessoa ? await deps.extrairComposicao(resolvida.grupoCanonico, textoLimpo) : [];
```

4. Funções novas, antes de `anexarEnderecos`:

```ts
/** Leitura de uma fonte individual, pela URL. */
interface IndividualLida {
  fonte: FonteIndividual;
  conteudo?: ConteudoFonte;
  erro?: string;
}

async function lerFonte<F extends FonteLegivel>(fonte: F, deps: Dependencias): Promise<{ fonte: F; conteudo?: ConteudoFonte; erro?: string }> {
  try {
    return { fonte, conteudo: await deps.raspar(fonte) };
  } catch (err) {
    return { fonte, erro: motivoDaFalha(err) };
  }
}

function individualComConteudo(l: { conteudo?: ConteudoFonte; erro?: string }): boolean {
  return l.erro === undefined && l.conteudo !== undefined && paginaComConteudo(l.conteudo);
}

/** Pluraliza "N página(s) individual(is) inacessível(is)" para o motivo do grupo. */
function textoIndividuaisCaidas(n: number): string {
  return n === 1 ? "1 página individual inacessível" : `${n} páginas individuais inacessíveis`;
}

/**
 * Caminho por contato (spec 2026-10-15 §4 e §5): cada contato é verificado na SUA página
 * individual; a fonte de grupo, quando existe, é a lista de denominações de cargo
 * (`casamento: "cargo"`) ou, se compõe pessoas, só alimenta `novos`. Nenhuma leitura parcial
 * entre individuais: cada contato responde pela sua. A IA não participa.
 */
async function analisarGrupoIndividual(
  grupo: string,
  contatos: ContatoPlanilha[],
  resolvida: FonteResolvida,
  deps: Dependencias,
): Promise<ResultadoGrupo> {
  const grupoCanonico = resolvida.grupoCanonico;
  const ligacoes = contatos.map((c) => ({ contato: c, fonte: fonteIndividualDe(c, resolvida.fontesIndividuais) }));
  // Cada URL é lida UMA vez, mesmo com dois contatos ligados a ela; individual sem contato não é lida.
  const aLer = [...new Map(ligacoes.flatMap((l) => (l.fonte ? [[l.fonte.url, l.fonte] as const] : []))).values()];
  const geral = resolvida.fontes[0];
  const [lidasInd, lidaGeral] = await Promise.all([
    Promise.all(aLer.map((f) => lerFonte(f, deps))),
    geral ? lerFonte(geral, deps) : Promise.resolve(undefined),
  ]);
  const porUrl = new Map<string, IndividualLida>(lidasInd.map((l) => [l.fonte.url, l]));

  // Fonte do cargo do grupo: a lista de denominações, ou o motivo de ela não ter vindo.
  const geralContribuiu = lidaGeral !== undefined && contribuiu(lidaGeral);
  const listaCargos: ListaCargos | undefined =
    geral && geral.casamento === "cargo"
      ? geralContribuiu
        ? { url: geral.url, cargos: listaDeCargos(lidaGeral!.conteudo!) }
        : { url: geral.url, erro: lidaGeral?.erro ?? MOTIVO_PAGINA_SEM_CONTEUDO }
      : undefined;

  const vereditos = ligacoes.map((l) =>
    l.fonte
      ? compararContatoIndividual({ contato: l.contato, fonte: l.fonte, lida: porUrl.get(l.fonte.url)!, listaCargos, grupoCanonico })
      : { resultado: compararContatoSemIndividual(l.contato, { grupoCanonico, listaCargos, uf: ufDoContato(l.contato) }), nomeConfirmado: false, lidaComConteudo: false, novos: [] as PessoaSite[] },
  );

  const lidas = lidasInd.filter(individualComConteudo).length;
  const caidas = lidasInd.length - lidas;
  const individuais = { lidas, caidas };
  const geralFalhou = geral !== undefined && !geralContribuiu;

  // Nenhuma fonte, de grupo ou individual, lida com conteúdo: grupo inacessível, como sempre.
  if (aLer.length + (geral ? 1 : 0) > 0 && lidas === 0 && (geral === undefined || geralFalhou)) {
    const motivo = [
      geral ? `${identificarFonte(geral)}: ${lidaGeral?.erro ?? MOTIVO_PAGINA_SEM_CONTEUDO}` : undefined,
      caidas > 0 ? textoIndividuaisCaidas(caidas) : undefined,
    ].filter(Boolean).join(" · ");
    return { ...marcarFonteInacessivel(grupo, contatos, geral?.url, motivo, grupoCanonico), individuais };
  }

  // GUARDA DE GRUPO (§4.3): duas ou mais individuais lidas com conteúdo e nenhuma confirmou
  // o nome do seu contato é layout que mudou ou bloqueio devolvendo outra página, nunca
  // todo mundo saindo de uma vez. Indeterminado, com o motivo, sem novos.
  const confirmadas = vereditos.filter((v) => v.nomeConfirmado).length;
  if (lidas >= MIN_CONTATOS_LEITURA_SUSPEITA && confirmadas === 0) {
    return { ...marcarFonteInacessivel(grupo, contatos, geral?.url, MOTIVO_LEITURA_SUSPEITA, grupoCanonico), individuais };
  }

  const erros = [
    ...(geralFalhou ? [`${identificarFonte(geral!)}: ${lidaGeral?.erro ?? MOTIVO_PAGINA_SEM_CONTEUDO}`] : []),
    ...lidasInd.filter((l) => !individualComConteudo(l)).map((l) => `${l.fonte.url}: ${l.erro ?? MOTIVO_PAGINA_INDIVIDUAL_SEM_CONTEUDO}`),
  ];
  // Fonte de grupo que compõe pessoas (não é o caso do catálogo de hoje): só propõe inclusão.
  const novosDaGeral =
    geral && geral.casamento !== "cargo" && geralContribuiu
      ? novosForaDaPlanilha(marcarProveniencia(lidaGeral!.conteudo!.pessoas, geral), contatos)
      : [];
  return {
    grupo,
    ...(geral ? { fonteUrl: geral.url } : {}),
    semFonte: false,
    contatos: vereditos.map((v) => v.resultado),
    novos: [...vereditos.flatMap((v) => v.novos), ...novosDaGeral],
    ...(erros.length > 0 ? { erroFonte: erros.join(" · ") } : {}),
    individuais,
  };
}
```

Importar `MOTIVO_PAGINA_INDIVIDUAL_SEM_CONTEUDO` de `@/lib/match` junto com os demais.

5. Em `resumir`, trocar `if (g.semFonte) resumo.contatosSemFonte += 1;` por:

```ts
      // Grupo sem fonte, ou contato de grupo com individuais que não tem a sua ("cadastrar fonte").
      if (g.semFonte || c.camposDivergentes.some((d) => d.campo === "fonte")) resumo.contatosSemFonte += 1;
```

6. Rota `app/api/analise/route.ts`: importar `abrirSessao` de `@/lib/navegador` e `RASPADORES_PADRAO` de `@/lib/raspagem`; trocar a montagem de `deps` e a chamada de `analisar` por:

```ts
    // Sessão do Chrome com janela para as fontes `navegador: "janela"` (spec 2026-10-15 §4.2):
    // aberta uma vez por varredura, lançada só se alguma fonte precisar, fechada sempre.
    const sessao = abrirSessao();
    let analisado;
    try {
      const deps: Dependencias = {
        resolverFonte: (grupo) => resolverGrupoEFonte(grupo),
        raspar: (fonte) => rasparFonte(fonte, { ...RASPADORES_PADRAO, porJanela: (url, opcoes) => sessao.raspar(url, opcoes) }),
        extrairComposicao: (grupoCanonico, textoLimpo) => extrairComposicao(grupoCanonico, textoLimpo),
      };
      analisado = await analisar(arquivoNome, contatos, deps, enderecos);
    } finally {
      await sessao.fechar();
    }
```

(`let analisado: Awaited<ReturnType<typeof analisar>>;` se o `let` sem tipo acusar no typecheck.)

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/analise-individual.test.ts tests/analise.test.ts && npm test && npm run typecheck`
Expected: PASS em tudo. Atenção a `tests/painel.test.ts` ou `tests/publicar.test.ts` que montem `ResumoAnalise` com `toEqual`: o campo novo é opcional e não afeta.

- [ ] **Step 6: Commit**

```bash
git add lib/analise.ts lib/types.ts app/api/analise/route.ts tests/analise-individual.test.ts tests/analise.test.ts tests/eleitos.test.ts tests/eleitos-governo.test.ts
git commit -m "feat: orquestrador por contato para grupos com fontes individuais

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(incluir no `git add` só os testes que de fato mudaram.)

---

### Task 7: Painel: etiqueta "não verificado", links por campo, cabeçalho do grupo e `/grupos`

**Files:**
- Modify: `lib/painel.ts` (`etiquetaDoCampo`, `valorReferenciaDe`, `DetalheCampo.url`, `motivoDoContato`, `procedenciaDoContato`, `textoIndividuais`)
- Modify: `components/linha-contato.tsx` (`Detalhe`)
- Modify: `components/painel.tsx` (`EstadoDaFonte`)
- Modify: `app/grupos/page.tsx`
- Test: `tests/painel.test.ts`

**Interfaces:**
- Consumes: `SituacaoCampo "nao_verificado"`, `ComparacaoCampo.fonteUrl` (Task 5); `ResultadoGrupo.individuais` (Task 6); `GrupoCadastro.fontesIndividuais`, `camposFontePrimaria` (Task 2).
- Produces, em `lib/painel.ts`: `DetalheCampo.url?: string`; `procedenciaDoContato(c, g): { rotulo: string; texto: string; url?: string }[]`; `textoIndividuais(i: { lidas: number; caidas: number }): string`.

- [ ] **Step 1: Testes (falham)**

Acrescentar a `tests/painel.test.ts` (reaproveitando `grupoComFonte` e um contato mínimo do próprio arquivo; `procedenciaDoContato`, `textoIndividuais` nos imports):

```ts
describe("fontes individuais no painel (spec 2026-10-15 §6.1)", () => {
  const grupoIndividuais: ResultadoGrupo = { grupo: "Ministros de Estado", fonteUrl: "https://www.gov.br/planalto/lista", semFonte: false, contatos: [], novos: [], individuais: { lidas: 36, caidas: 2 } };
  const contato: ResultadoContato = {
    contato: { nome: "Ana", grupo: "Ministros de Estado", cargo: "Ministra de Estado do Exemplo" },
    semaforo: "verde", score: 1, origem: "oficial", fonteUrl: "https://www.gov.br/exemplo/ministra",
    comparacoes: [
      { campo: "nome", valorPlanilha: "Ana", valorEsperado: "Ana", situacao: "confere", origemValor: "pagina", fonteUrl: "https://www.gov.br/exemplo/ministra" },
      { campo: "cargo", valorPlanilha: "Ministra de Estado do Exemplo", situacao: "nao_verificado", fonteUrl: "https://www.gov.br/planalto/lista" },
    ],
    camposDivergentes: [],
  };

  test("nao_verificado vira etiqueta neutra 'Cargo não verificado' e não pede revisão", () => {
    const etiquetas = etiquetasDoContato(contato, grupoIndividuais);
    expect(etiquetas.find((e) => e.campo === "cargo")).toMatchObject({ texto: "Cargo não verificado", tom: "neutro" });
    expect(situacaoDoContato(contato, grupoIndividuais).texto).toBe("Nada a revisar");
  });

  test("detalhe traz a URL da fonte de cada campo e o texto de não verificado", () => {
    const d = detalhesDoContato(contato, grupoIndividuais);
    expect(d.find((x) => x.campo === "nome")?.url).toBe("https://www.gov.br/exemplo/ministra");
    expect(d.find((x) => x.campo === "cargo")).toMatchObject({ url: "https://www.gov.br/planalto/lista", valorReferencia: "não verificado nesta varredura" });
    expect(d.find((x) => x.campo === "tratamento")?.url).toBeUndefined();
  });

  test("procedência por contato: nome pela individual, cargo pela geral; grupo comum mantém a linha única", () => {
    expect(procedenciaDoContato(contato, grupoIndividuais)).toEqual([
      { rotulo: "Nome", texto: "https://www.gov.br/exemplo/ministra", url: "https://www.gov.br/exemplo/ministra" },
      { rotulo: "Cargo", texto: "https://www.gov.br/planalto/lista", url: "https://www.gov.br/planalto/lista" },
    ]);
    expect(procedenciaDoContato({ ...contato, comparacoes: [], fonteUrl: undefined }, grupoComFonte)).toEqual([
      { rotulo: "Nome e cargo", texto: "https://orgao.gov.br", url: "https://orgao.gov.br" },
    ]);
  });

  test("motivo do contato indeterminado num grupo com individuais é a observação dele", () => {
    const caido: ResultadoContato = { ...contato, semaforo: "indeterminado", observacao: "Página individual inacessível: HTTP 403" };
    expect(motivoDoContato(caido, grupoIndividuais)).toBe("Página individual inacessível: HTTP 403");
  });

  test("textoIndividuais", () => {
    expect(textoIndividuais({ lidas: 22, caidas: 0 })).toBe("22 páginas individuais lidas");
    expect(textoIndividuais({ lidas: 36, caidas: 2 })).toBe("36 páginas individuais lidas · 2 inacessíveis");
    expect(textoIndividuais({ lidas: 1, caidas: 1 })).toBe("1 página individual lida · 1 inacessível");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/painel.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar em `lib/painel.ts`**

1. Em `etiquetaDoCampo`, antes do `if (!comp) return ...`:

```ts
  if (comp?.situacao === "nao_verificado") {
    return { campo, texto: `${rotulo} não verificado`, tom: "neutro", explicacao: EXPLICACAO.naoVerificado };
  }
```

2. Constante `const TEXTO_NAO_VERIFICADO = "não verificado nesta varredura";` ao lado de `TEXTO_FONTE_NAO_INFORMA`, e em `valorReferenciaDe`, depois da linha de `sem_regra`: `if (comp.situacao === "nao_verificado") return TEXTO_NAO_VERIFICADO;`.

3. `DetalheCampo` ganha `url?: string;` (comentário: "Página de onde veio a referência deste campo, quando o retrato a registra (fontes individuais)."), e em `detalhesDoContato`, no objeto do cartão: `...(comp?.fonteUrl ? { url: comp.fonteUrl } : {}),`.

4. `motivoDoContato`: trocar a última linha de `indeterminado` por:

```ts
  if (c.semaforo === "indeterminado") return g.individuais && c.observacao ? c.observacao : "Não verificado: uma fonte não respondeu";
```

5. Funções novas, depois de `procedenciaNomeCargo`:

```ts
/**
 * Rodapé "De onde veio cada resposta", por contato. Grupo com fontes individuais: o nome vem da
 * página do contato e o cargo da fonte do cargo (a geral, ou a mesma página). Grupo comum: a
 * linha única de `procedenciaNomeCargo`.
 */
export function procedenciaDoContato(c: ResultadoContato, g: ResultadoGrupo): { rotulo: string; texto: string; url?: string }[] {
  if (!g.individuais) {
    const p = procedenciaNomeCargo(g);
    return p ? [{ rotulo: "Nome e cargo", ...p }] : [];
  }
  const linhas: { rotulo: string; texto: string; url?: string }[] = [];
  const nome = comparacaoDeValor(c, "nome")?.fonteUrl ?? c.fonteUrl;
  if (nome) linhas.push({ rotulo: "Nome", texto: nome, url: nome });
  const cargo = comparacaoDeValor(c, "cargo")?.fonteUrl;
  if (cargo) linhas.push({ rotulo: "Cargo", texto: cargo, url: cargo });
  return linhas;
}

/** "22 páginas individuais lidas · 2 inacessíveis", no cabeçalho do grupo. */
export function textoIndividuais(i: { lidas: number; caidas: number }): string {
  const lidas = i.lidas === 1 ? "1 página individual lida" : `${i.lidas} páginas individuais lidas`;
  if (i.caidas === 0) return lidas;
  return `${lidas} · ${i.caidas} ${i.caidas === 1 ? "inacessível" : "inacessíveis"}`;
}
```

- [ ] **Step 4: Componentes**

`components/linha-contato.tsx`, em `Detalhe`: trocar `const p = procedenciaNomeCargo(g);` por `const procedencia = procedenciaDoContato(c, g);` (ajustar o import: `procedenciaDoContato` no lugar de `procedenciaNomeCargo`), e a `<li>` de "Nome e cargo" por:

```tsx
        {procedencia.map((p) => (
          <li key={p.rotulo}>{p.rotulo}: {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="text-acao underline">{p.texto}</a> : p.texto}, lido em {textoDataHora(retrato.geradoEm)}</li>
        ))}
```

No cartão do campo, depois de `<div className="mt-2 text-xs text-cinza-claro">{d.origem}</div>`, deixar o valor de referência como está e acrescentar, depois do `BotaoCopiar`:

```tsx
              {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="mt-1 block text-[11px] text-acao underline break-all">abrir a página desta referência</a>}
```

`components/painel.tsx`, em `EstadoDaFonte`, no `return` final (grupo lido), antes de `{g.erroFonte && ...}`: `{g.individuais && <span>{textoIndividuais(g.individuais)} · </span>}` (importar `textoIndividuais` de `@/lib/painel`). No ramo `fonteInacessivel`, depois do motivo: `{g.individuais && <> · {textoIndividuais(g.individuais)}</>}`.

`app/grupos/page.tsx`, em `FonteStatus`:

```tsx
function FonteStatus({ grupo }: { grupo: GrupoCadastro }) {
  if (!grupo.temFonte) return <span className="text-amber-600">— sem fonte</span>;
  return (
    <div className="space-y-1">
      {grupo.fonteUrl && (
        <div>
          <a href={grupo.fonteUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline break-all">{grupo.fonteUrl}</a>
          {grupo.camposFontePrimaria && <span className="ml-2 text-xs text-gray-500">(referência de: {grupo.camposFontePrimaria.join(", ")})</span>}
        </div>
      )}
      {grupo.fontesIndividuais > 0 && (
        <div className="text-xs text-gray-600">{grupo.fontesIndividuais} {grupo.fontesIndividuais === 1 ? "fonte individual" : "fontes individuais"} (uma página por contato)</div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/painel.test.ts && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/painel.ts components/linha-contato.tsx components/painel.tsx app/grupos/page.tsx tests/painel.test.ts
git commit -m "feat: painel com etiqueta não verificado, link por campo e contagem de individuais

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Export com "Fonte do cargo" e "não verificado"

**Files:**
- Modify: `lib/export.ts`
- Test: `tests/export.test.ts`

**Interfaces:**
- Consumes: `ComparacaoCampo.fonteUrl`, `SituacaoCampo "nao_verificado"` (Task 5).
- Produces: coluna `Fonte do cargo` em `resultadoParaLinhas`.

- [ ] **Step 1: Testes (falham)**

Em `tests/export.test.ts`, acrescentar:

```ts
describe("fontes individuais no export (spec 2026-10-15 §6.2)", () => {
  const comIndividual: ResultadoAnalise = {
    ...analise,
    grupos: [{
      grupo: "Ministros de Estado", fonteUrl: "https://www.gov.br/planalto/lista", semFonte: false, novos: [],
      contatos: [{
        contato: { nome: "Ana", grupo: "Ministros de Estado", cargo: "Ministra X" },
        semaforo: "verde", score: 1, origem: "oficial", fonteUrl: "https://www.gov.br/x/ministra",
        comparacoes: [
          { campo: "nome", valorPlanilha: "Ana", valorEsperado: "Ana", situacao: "confere", origemValor: "pagina", fonteUrl: "https://www.gov.br/x/ministra" },
          { campo: "cargo", valorPlanilha: "Ministra X", situacao: "nao_verificado", fonteUrl: "https://www.gov.br/planalto/lista" },
        ],
        camposDivergentes: [],
      }],
    }],
  };

  test("Fonte é a individual; 'Fonte do cargo' é a geral; cargo não verificado sai com o texto", () => {
    const linha = resultadoParaLinhas(comIndividual)[0];
    expect(linha).toMatchObject({ Fonte: "https://www.gov.br/x/ministra", "Fonte do cargo": "https://www.gov.br/planalto/lista", "Cargo (site)": "não verificado" });
  });

  test("'Fonte do cargo' fica vazia quando é a mesma página da Fonte, e existe em toda linha", () => {
    const linhas = resultadoParaLinhas(analise);
    expect(linhas[0]["Fonte do cargo"]).toBe("");
    expect(Object.keys(linhas[0])).toContain("Fonte do cargo");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/export.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar em `lib/export.ts`**

Em `valorEsperadoDe`, depois de `sem_regra`: `if (comp.situacao === "nao_verificado") return "não verificado";`.

Função nova, depois de `valorPlanilhaDe`:

```ts
/** URL da fonte do cargo quando é outra página que não a `Fonte` do contato (fontes individuais). */
function fonteDoCargo(c: ResultadoContato): string {
  const url = comparacaoDe(c, "cargo")?.fonteUrl;
  return url && url !== c.fonteUrl ? url : "";
}
```

Em `resultadoParaLinhas`, na linha do contato, depois de `Fonte: c.fonteUrl ?? "",`: `"Fonte do cargo": fonteDoCargo(c),`; na linha de `novos`, depois de `Fonte: ...`: `"Fonte do cargo": "",`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/export.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/export.ts tests/export.test.ts
git commit -m "feat: export com fonte do cargo e situação não verificado

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Documentação, verificação completa e branch pronta

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-10-15-fontes-individuais-por-contato-design.md` (só se a implementação exigiu desvio; registrar o desvio em uma linha)

- [ ] **Step 1: CLAUDE.md**

1. Tabela de specs: na linha de 2026-10-15, trocar a situação para `Vigente; implementado`.
2. Em "Estado do projeto", atualizar a contagem: "Catálogo: 33 grupos, 24 fontes de grupo, 60 fontes individuais (22 Governadores, 38 Ministros de Estado), 22 grupos com fonte, **11 sem fonte**" (Governadores deixa de ser "sem fonte").
3. Em "Princípios de implementação", acrescentar o bullet, depois de "Fonte em JavaScript é lida pelo Chrome local":

> - **Fontes individuais por contato (spec 2026-10-15).** Grupo com `fontesIndividuais` no catálogo vai pelo caminho por contato de `lib/analise.ts` (`analisarGrupoIndividual`): cada contato é verificado na sua página, ligada por UF (`ufDoContato`) ou por nome (igualdade após `normalizarNome`). Fonte de grupo `casamento: "cargo"` é só lista de denominações de cargo, casada pela denominação, nunca pelo nome. Página individual só "não contém" o nome quando lida com conteúdo (`MIN_TEXTO_PAGINA_INDIVIDUAL`); CAPTCHA e página vazia são fonte inacessível. Guarda de grupo: duas ou mais individuais lidas e nenhuma confirmando o nome é leitura suspeita. `nao_verificado` é situação neutra de campo (a fonte daquele campo caiu). Páginas `navegador: "janela"` são lidas numa sessão única do Chrome **com janela** (`abrirSessao`, aberta pela rota e fechada no `finally`): a janela aparece durante a varredura e não deve ser tocada.

4. Em "Semântica dos vereditos", na frase sobre `fonte_nao_informa`, acrescentar `nao_verificado` à lista do que **não** é divergência.
5. Em "Rotina: do código e da coleta até a web", passo 3: "A varredura abre uma janela do Chrome enquanto lê o gov.br (Ministros de Estado); não tocar nela. Dura alguns minutos." Passo 5 (trava): "Grupo que teve páginas individuais lidas no retrato anterior e vem com **todas** caídas também trava."
6. Em "Catálogo: como cadastrar ou trocar uma URL", acrescentar o passo: "Fonte individual (uma página por contato) entra em `fontesIndividuais` do grupo, com `chave` por UF ou pelo nome **como está no Contatos**, e `campos` que ela cobre. Página do gov.br federal leva `navegador: "janela"`."

- [ ] **Step 2: Verificação completa**

Run: `npm test && npm run typecheck && npm run build`
Expected: suíte inteira verde, typecheck limpo, build sem erro. Se `npm run build` acusar algo de `app/grupos/page.tsx` ou `components/`, corrigir aqui.

- [ ] **Step 3: Commit e push**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-15-fontes-individuais-por-contato-design.md
git commit -m "docs: fontes individuais por contato no CLAUDE.md

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin feat/fontes-individuais
```

Depois do push, a branch segue a rotina do CLAUDE.md: PR para `main`, merge pelo Clovis, deploy automático da Vercel, coleta nova (o retrato muda: Governadores e Ministros passam a ter veredito por contato), publicação e conferência na web.
