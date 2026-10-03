# Plano A: painel e Camada B — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Camada B encontra a regra de protocolo sem olhar o gênero do cargo; o painel diz "Nada a revisar" em vez de "Tudo confere" quando algo não pôde ser conferido, acusa "Cargo vazio", filtra por grupo com cabeçalho fixo, e explica cada etiqueta ao passar o cursor.

**Architecture:** Toda regra nova nasce em função pura com teste: `neutralizarGenero` em `lib/cargos.ts` (usada por `resolverRegra`), e `situacaoDoContato` / `etiquetasDoContato` / `filtrarGrupos` em `lib/painel.ts`, agora com `explicacao` em cada etiqueta. Os componentes só passam a explicação ao `title` e acrescentam o `<select>` de grupo.

**Tech Stack:** TypeScript, Next.js 15, Tailwind v4, Vitest. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-02-ajustes-do-painel-genero-tcu-publicacao.md`, §4 (Plano A). Leia antes de começar.

## Global Constraints

- `lib/*.ts` puros, imutáveis, sem `any`, sem `console.*`. UI sem lógica de negócio: regra nova só em `lib/painel.ts` ou `lib/cargos.ts`, com teste.
- **Vereditos não mudam.** `lib/match.ts`, `lib/endereco.ts`, `lib/export.ts` não são tocados. Em `lib/tratamento.ts` só `resolverRegra` muda, e só a forma de **encontrar** a regra; a Camada A (gênero entre campos) e a Camada 1 (site) ficam como estão.
- Textos novos em português do Brasil, sem travessão no lugar de vírgula. Comentários e nomes de teste em português, AAA.
- npm: `npm test`, `npm run typecheck`, `npm run build`. Não commitar `PROXIMA_SESSAO*.md`, `.fiscal/`, pnpm, `.xlsx`.
- Commit: conventional commit em português, trailer exato `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Branch: `feat/ajustes-painel` (sobre `feat/painel-local`; spec commitado em `f86b399`).

## Review Focus

1. **"Senadora" cai na mesma regra de "Senador"** contra a tabela real, e "Senhora" continua coerente na Camada A. → Task 1, Step 1.
2. **Cargo só com espaços** conta como vazio ("Cargo vazio"), não como "sem regra". → Task 2, Step 1.
3. **Contato verde com uma etiqueta neutra** sai "Nada a revisar", nunca "Tudo confere". → Task 2, Step 1.
4. **Filtro de grupo combinado com busca e com "Possível saída"**: só o grupo escolhido, só as linhas que passam. → Task 2, Step 1.
5. **"Endereço a confirmar" com dois achados** explica os dois, na ordem dos achados. → Task 2, Step 1.

---

### Task 1: Gênero no casamento de cargo (Camada B)

**Files:**
- Modify: `lib/cargos.ts` (fim do arquivo), `lib/tratamento.ts:238-246` (`resolverRegra`)
- Test: `tests/cargos-genero.test.ts` (novo), `tests/tratamento-comparacao.test.ts` (acrescentar)

**Interfaces:**
- Produces: `neutralizarGenero(cargoNormalizado: string): string` em `lib/cargos.ts`.
- `resolverRegra` mantém a assinatura.

- [ ] **Step 1: Testes que falham**

`tests/cargos-genero.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { neutralizarGenero } from "@/lib/cargos";

describe("neutralizarGenero", () => {
  test("troca cada feminino do léxico pelo masculino, palavra a palavra", () => {
    expect(neutralizarGenero("senadora")).toBe("senador");
    expect(neutralizarGenero("governadora do estado do acre")).toBe("governador do estado do acre");
    expect(neutralizarGenero("encarregada de negocios")).toBe("encarregado de negocios");
    expect(neutralizarGenero("vice-governadora")).toBe("vice-governador");
    expect(neutralizarGenero("presidenta")).toBe("presidente");
  });

  test("não mexe em texto sem feminino do léxico, nem em 'secretaria' (nome de órgão)", () => {
    expect(neutralizarGenero("ministro de estado")).toBe("ministro de estado");
    expect(neutralizarGenero("secretaria-geral da presidencia")).toBe("secretaria-geral da presidencia");
    expect(neutralizarGenero("")).toBe("");
  });
});
```

Em `tests/tratamento-comparacao.test.ts`, no fim do arquivo (use o import de `resolverRegra` já existente ou acrescente `import { resolverRegra } from "@/lib/tratamento";`):

```ts
describe("resolverRegra: gênero não muda a regra encontrada (tabela real)", () => {
  test.each([
    ["Senadora", "Senador"],
    ["Encarregada de Negócios", "Encarregado de Negócios"],
    ["Governadora do Estado do Acre", "Governador do Estado do Acre"],
  ])("%s resolve igual a %s", (feminino, masculino) => {
    expect(resolverRegra(feminino)?.cargoDestinatario).toBe(resolverRegra(masculino)?.cargoDestinatario);
  });

  test("Senadora encontra a regra de Senador (hoje caía em sem regra)", () => {
    expect(resolverRegra("Senadora")).toBeDefined();
    expect(resolverRegra("Senadora")?.cargoDestinatario).toBe(resolverRegra("Senador")?.cargoDestinatario);
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/cargos-genero.test.ts tests/tratamento-comparacao.test.ts`
Expected: FAIL (função não existe; "Senadora" devolve `undefined`).

- [ ] **Step 3: `lib/cargos.ts`**

No fim do arquivo:

```ts
/**
 * Feminino → masculino, só para ENCONTRAR a regra de protocolo (Camada B): a tabela
 * escreve os cargos no masculino ("Senador / Deputado Federal"), e "Senadora" não chegava
 * nela por similaridade. Serve só para a busca da regra; a Camada A continua exigindo
 * gênero coerente entre tratamento e cargo, e a comparação com o site não muda.
 * Só palavras da lista mudam, para "mesa" não virar "meso" e "secretaria" (órgão) ficar.
 * Ver docs/superpowers/specs/2026-10-02-ajustes-do-painel-genero-tcu-publicacao.md §4.2
 */
const FEMININO_PARA_MASCULINO: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(CARGOS_FEMININOS.map((f, i) => [f, CARGOS_MASCULINOS[i]])),
  presidenta: "presidente",
});

/** Recebe texto já normalizado (minúsculas, sem acento) e devolve o mesmo texto com os femininos do léxico no masculino. */
export function neutralizarGenero(cargoNormalizado: string): string {
  return cargoNormalizado.replace(/[a-z]+/g, (palavra) => FEMININO_PARA_MASCULINO[palavra] ?? palavra);
}
```

Confira que `CARGOS_FEMININOS[i]` corresponde a `CARGOS_MASCULINOS[i]` nos 19 primeiros índices (as listas já são paralelas; "secretario" é o 20º masculino e não tem par, de propósito).

- [ ] **Step 4: `lib/tratamento.ts`**

Importe `neutralizarGenero` de `@/lib/cargos` (o arquivo já importa de lá) e, em `resolverRegra`, troque

```ts
  const alvo = normalizarTexto(cargo);
```
por
```ts
  // Gênero não muda a regra: "Senadora" procura como "senador". Só a busca; ver §4.2 do spec.
  const alvo = neutralizarGenero(normalizarTexto(cargo));
```

- [ ] **Step 5: Rode tudo**

Run: `npm test && npm run typecheck`
Expected: verde. Se algum dos dez casos travados em `tests/tratamento-comparacao.test.ts` mudar, **pare e reporte**: é regressão de alvo, não ajuste de teste.

- [ ] **Step 6: Commit**

```bash
git add lib/cargos.ts lib/tratamento.ts tests/cargos-genero.test.ts tests/tratamento-comparacao.test.ts
git commit -m "feat: Camada B encontra a regra de protocolo sem olhar o gênero do cargo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Situação, cargo vazio, filtro por grupo e explicações em `lib/painel.ts`

**Files:**
- Modify: `lib/painel.ts`
- Test: `tests/painel.test.ts`

**Interfaces:**
- `Etiqueta` ganha `explicacao: string`. `situacaoDoContato` devolve `{ texto, tom, explicacao }`. `filtrarGrupos(grupos, filtro, busca, grupo?: string)`. Demais assinaturas iguais.

- [ ] **Step 1: Testes que falham**

Em `tests/painel.test.ts`:

1. Troque, nos testes existentes de `etiquetasDoContato` e `situacaoDoContato`, `toEqual({ campo, texto, tom })` por `toMatchObject(...)` (a explicação entra no objeto). O teste "ordem: possível saída, sem fonte, não verificado, tudo confere" passa a esperar, no último caso (`comparacoes: [confere("nome", "pagina")]`), `{ texto: "Nada a revisar", tom: "neutro" }`, porque cargo, tratamento e endereçamento ficam neutros.

2. Acrescente:

```ts
describe("situação: Tudo confere × Nada a revisar", () => {
  test("todas as etiquetas verdes → Tudo confere", () => {
    const c = contato({
      comparacoes: [confere("nome", "pagina"), confere("cargo", "pagina"), confere("tratamento", "protocolo"), confere("enderecamento", "protocolo")],
      endereco: { situacao: "completo", achados: [] },
    });
    expect(situacaoDoContato(c, grupoComFonte)).toMatchObject({ texto: "Tudo confere", tom: "ok" });
  });

  test("uma etiqueta neutra e nada a revisar → Nada a revisar", () => {
    const c = contato({
      comparacoes: [confere("nome", "pagina"), confere("cargo", "pagina"), { campo: "tratamento", valorPlanilha: "Senhora", situacao: "sem_regra", origemValor: "protocolo" }, confere("enderecamento", "protocolo")],
      endereco: { situacao: "a_completar", achados: ["sem_bairro"] },
    });
    const s = situacaoDoContato(c, grupoComFonte);
    expect(s).toMatchObject({ texto: "Nada a revisar", tom: "neutro" });
    expect(s.explicacao).toContain("não puderam ser conferidos");
  });
});

describe("cargo vazio", () => {
  test.each(["", "   ", undefined])("cargo %j vira 'Cargo vazio' em atenção, sem etiquetas de protocolo, e conta como a revisar", (cargo) => {
    const c = contato({
      contato: { nome: "Ana", grupo: "ORG", cargo, tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" },
      comparacoes: [confere("nome", "pagina"), { campo: "tratamento", valorPlanilha: "Senhora", situacao: "sem_regra", origemValor: "protocolo" }, { campo: "enderecamento", valorPlanilha: "x", situacao: "sem_regra", origemValor: "protocolo" }],
    });
    const t = textos(c, grupoComFonte);
    expect(t).toContain("Cargo vazio");
    expect(t.some((x) => x.startsWith("Tratamento") || x.startsWith("Endereçamento"))).toBe(false);
    expect(etiquetasDoContato(c, grupoComFonte).find((e) => e.campo === "cargo")?.tom).toBe("atencao");
    expect(situacaoDoContato(c, grupoComFonte).texto).toBe("1 a revisar");
  });
});

describe("explicações", () => {
  test("endereço a confirmar lista os achados reais, na ordem", () => {
    const c = contato({ endereco: { situacao: "pendente", achados: ["sem_numero", "cep_ausente"] } });
    const e = etiquetasDoContato(c, grupoComFonte).find((x) => x.campo === "endereco");
    expect(e?.explicacao).toBe("Precisa de confirmação por telefone: sem número; sem CEP");
  });

  test("sem regra cita o cargo", () => {
    const c = contato({ comparacoes: [{ campo: "tratamento", valorPlanilha: "Senhora", situacao: "sem_regra", origemValor: "protocolo" }] });
    expect(etiquetasDoContato(c, grupoComFonte).find((x) => x.campo === "tratamento")?.explicacao)
      .toBe('O cargo "Ministra" não foi encontrado na tabela de protocolo; nada foi conferido');
  });

  test("a completar fala do bairro; sem par na fonte fala da composição", () => {
    const a = contato({ endereco: { situacao: "a_completar", achados: ["sem_bairro"] } });
    expect(etiquetasDoContato(a, grupoComFonte).find((x) => x.campo === "endereco")?.explicacao).toContain("bairro");
    const s = contato({ possivelSaida: true, semaforo: "vermelho" });
    expect(etiquetasDoContato(s, grupoComFonte)[0].explicacao).toContain("composição oficial");
  });

  test("toda etiqueta tem explicação não vazia", () => {
    const c = contato({
      semaforo: "amarelo",
      comparacoes: [confere("nome", "pagina"), diverge("cargo", "pagina", "a", "b"), diverge("tratamento", "protocolo", "a", "b"), confere("enderecamento", "protocolo")],
      endereco: { situacao: "nao_verificado", achados: ["nome_ambiguo"] },
    });
    for (const e of etiquetasDoContato(c, grupoComFonte)) expect(e.explicacao.length).toBeGreaterThan(10);
  });
});

describe("filtro por grupo", () => {
  const a = contato({ contato: { nome: "Ana", grupo: "A" } });
  const b = contato({ contato: { nome: "Bia", grupo: "B" }, semaforo: "vermelho", possivelSaida: true });
  const b2 = contato({ contato: { nome: "Bruno", grupo: "B" } });
  const grupos: ResultadoGrupo[] = [
    { ...grupoComFonte, grupo: "A", contatos: [a], novos: [] },
    { ...grupoComFonte, grupo: "B", contatos: [b, b2], novos: [] },
  ];
  test("só o grupo escolhido, e os outros filtros valem dentro dele", () => {
    expect(filtrarGrupos(grupos, "tudo", "", "B").map((g) => g.grupo)).toEqual(["B"]);
    expect(filtrarGrupos(grupos, "saida", "", "B")[0].contatos.map((c) => c.contato.nome)).toEqual(["Bia"]);
    expect(filtrarGrupos(grupos, "tudo", "bruno", "B")[0].contatos).toHaveLength(1);
    expect(filtrarGrupos(grupos, "saida", "", "A")).toEqual([]);
  });
  test("sem grupo (undefined ou vazio) é como hoje", () => {
    expect(filtrarGrupos(grupos, "tudo", "")).toHaveLength(2);
    expect(filtrarGrupos(grupos, "tudo", "", "")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/painel.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implemente em `lib/painel.ts`**

Importe `rotuloAchadoEndereco` de `@/lib/endereco`. Substitua a interface, `ETIQUETA_ENDERECO`, `etiquetaDoCampo`, `etiquetasDoContato`, `etiquetaDeEndereco` e `situacaoDoContato` por:

```ts
export interface Etiqueta {
  campo: CampoEtiqueta;
  texto: string;
  tom: Tom;
  /** Uma frase, mostrada ao passar o cursor: o que a etiqueta quer dizer e por quê. */
  explicacao: string;
}

const EXPLICACAO = {
  confereSite: "Igual ao que o site do órgão publica",
  divergeSite: "O site do órgão publica outro valor; veja no detalhe",
  naoVerificado: "A fonte oficial não pôde ser lida nesta varredura",
  confereProtocolo: "Igual ao que a tabela de protocolo manda para este cargo",
  divergeProtocolo: "Diferente do que a tabela de protocolo manda, ou incoerente com o cargo; veja no detalhe",
  cargoVazio: "O cadastro não informa o cargo; sem ele não há regra de protocolo",
  semParNaFonte: "Ninguém com este nome na composição oficial; confirmar se saiu",
} as const;

function explicacaoSemRegra(cargo: string | undefined): string {
  return `O cargo "${cargo ?? ""}" não foi encontrado na tabela de protocolo; nada foi conferido`;
}

const ETIQUETA_ENDERECO: Record<Exclude<SituacaoEndereco, "sem_base" | "pendente">, { texto: string; tom: Tom; explicacao: string }> = {
  completo: { texto: "Endereço completo", tom: "ok", explicacao: "Logradouro, número, bairro, CEP, cidade e UF presentes no relatório de endereços" },
  a_completar: { texto: "Endereço a completar", tom: "neutro", explicacao: "Falta o bairro no relatório; ele sai do CEP na conferência dos Correios (Fase 2)" },
  nao_verificado: { texto: "Endereço não verificado", tom: "neutro", explicacao: "Nome ambíguo no relatório: mais de um contato com este nome; endereço não atribuído" },
};

function etiquetaDoCampo(c: ResultadoContato, campo: CampoComparado): Etiqueta | undefined {
  const rotulo = ROTULO_CAMPO[campo];
  const doSite = campo === "nome" || campo === "cargo";
  const comp = comparacaoDeValor(c, campo);
  if (coerenciasDo(c, campo).length > 0 || comp?.situacao === "divergente") {
    return { campo, texto: `${rotulo} diverge`, tom: "atencao", explicacao: doSite ? EXPLICACAO.divergeSite : EXPLICACAO.divergeProtocolo };
  }
  if (!comp) return { campo, texto: `${rotulo} não verificado`, tom: "neutro", explicacao: EXPLICACAO.naoVerificado };
  if (comp.situacao === "confere") {
    return { campo, texto: `${rotulo} confere`, tom: "ok", explicacao: doSite ? EXPLICACAO.confereSite : EXPLICACAO.confereProtocolo };
  }
  if (comp.situacao === "sem_regra") {
    return { campo, texto: `${rotulo} sem regra`, tom: "neutro", explicacao: explicacaoSemRegra(c.contato.cargo) };
  }
  return undefined; // fonte_nao_informa
}

function cargoEstaVazio(c: ResultadoContato): boolean {
  return (c.contato.cargo ?? "").trim().length === 0;
}

export function etiquetasDoContato(c: ResultadoContato, _g: ResultadoGrupo): Etiqueta[] {
  const lista: Etiqueta[] = [];
  const semCargo = cargoEstaVazio(c);
  if (c.possivelSaida) {
    lista.push({ campo: "fonte", texto: "Sem par na fonte", tom: "ruim", explicacao: EXPLICACAO.semParNaFonte });
    const nome = etiquetaDoCampo(c, "nome");
    if (nome?.tom === "atencao") lista.push(nome);
  } else {
    const nome = etiquetaDoCampo(c, "nome");
    if (nome) lista.push(nome);
    if (!semCargo) {
      const cargo = etiquetaDoCampo(c, "cargo");
      if (cargo) lista.push(cargo);
    }
  }
  if (semCargo) {
    // Cadastro sem cargo é dado faltante que a Posse precisa; sem cargo não há regra de protocolo a procurar.
    lista.push({ campo: "cargo", texto: "Cargo vazio", tom: "atencao", explicacao: EXPLICACAO.cargoVazio });
  } else {
    for (const campo of ["tratamento", "enderecamento"] as const) {
      const e = etiquetaDoCampo(c, campo);
      if (e) lista.push(e);
    }
  }
  const endereco = etiquetaDeEndereco(c);
  if (endereco) lista.push(endereco);
  return lista;
}

export function etiquetaDeEndereco(c: ResultadoContato): Etiqueta | undefined {
  const a = c.endereco;
  if (!a || a.situacao === "sem_base") return undefined;
  if (a.situacao === "pendente") {
    const motivos = a.achados.map(rotuloAchadoEndereco).join("; ");
    return { campo: "endereco", texto: "Endereço a confirmar", tom: "atencao", explicacao: `Precisa de confirmação por telefone: ${motivos}` };
  }
  return { campo: "endereco", ...ETIQUETA_ENDERECO[a.situacao] };
}

const PRECISA_REVISAR: readonly Tom[] = ["atencao", "ruim"];

export interface Situacao { texto: string; tom: Tom; explicacao: string }

export function situacaoDoContato(c: ResultadoContato, g: ResultadoGrupo): Situacao {
  if (c.possivelSaida) return { texto: "Possível saída", tom: "ruim", explicacao: EXPLICACAO.semParNaFonte };
  if (g.semFonte) return { texto: "Sem fonte", tom: "neutro", explicacao: "O grupo não tem fonte oficial cadastrada; nome e cargo não foram conferidos" };
  if (c.semaforo === "indeterminado") return { texto: "Não verificado", tom: "neutro", explicacao: EXPLICACAO.naoVerificado };
  const etiquetas = etiquetasDoContato(c, g);
  const aRevisar = etiquetas.filter((e) => PRECISA_REVISAR.includes(e.tom)).length;
  if (aRevisar > 0) return { texto: `${aRevisar} a revisar`, tom: "atencao", explicacao: "Campos em atenção pedem revisão; veja as etiquetas e o detalhe" };
  if (etiquetas.some((e) => e.tom === "neutro")) {
    return { texto: "Nada a revisar", tom: "neutro", explicacao: "Nenhum campo pede revisão; os campos neutros não puderam ser conferidos" };
  }
  return { texto: "Tudo confere", tom: "ok", explicacao: "Todos os campos conferidos batem com as referências" };
}
```

Em `filtrarGrupos`, acrescente o quarto parâmetro e o filtro de grupo antes do `map`:

```ts
export function filtrarGrupos(grupos: readonly ResultadoGrupo[], filtro: Filtro, busca: string, grupo?: string): ResultadoGrupo[] {
  const b = normalizarTexto(busca.trim());
  return grupos
    .filter((g) => !grupo || g.grupo === grupo)
    .map((g) => ({
```

Na `LinhaNovo` (Task 3) a etiqueta "Site: cargo" ganha explicação "Pessoa publicada pela fonte, sem par na planilha"; exporte a constante: `export const EXPLICACAO_NOVO = "Pessoa publicada pela fonte, sem par na planilha";`.

- [ ] **Step 4: Rode e confirme que passa**

Run: `npx vitest run tests/painel.test.ts`
Expected: PASS. Se algum teste antigo falhar por `toEqual` com objeto sem `explicacao`, troque para `toMatchObject` (é o único ajuste permitido em teste antigo).

- [ ] **Step 5: Rode tudo**

Run: `npm test && npm run typecheck`
Expected: typecheck vai apontar os componentes que leem `situacaoDoContato` e `filtrarGrupos` só se as assinaturas quebrarem; como `explicacao` é campo a mais e `grupo` é opcional, deve passar. Se não passar, reporte em vez de mexer em componente (é a Task 3).

- [ ] **Step 6: Commit**

```bash
git add lib/painel.ts tests/painel.test.ts
git commit -m "feat: Nada a revisar, Cargo vazio, filtro por grupo e explicação em cada etiqueta

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Componentes, `CLAUDE.md` e conferência

**Files:**
- Modify: `components/etiqueta.tsx`, `components/linha-contato.tsx`, `components/painel.tsx`, `CLAUDE.md`

- [ ] **Step 1: `components/etiqueta.tsx`**

```tsx
export function Etiqueta({ texto, tom, explicacao }: { texto: string; tom: Tom; explicacao?: string }) {
  return (
    <span
      title={explicacao}
      className={`inline-block cursor-default whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASSES[tom]}`}
    >
      {texto}
    </span>
  );
}
```

(`title`, não `aria-label`: `aria-label` esconderia o texto visível do leitor de tela. Ruling do controlador sobre o §4.5 do spec.)

- [ ] **Step 2: `components/linha-contato.tsx`**

Passe `explicacao={e.explicacao}` nas três chamadas de `<Etiqueta>` que recebem uma `Etiqueta` (bloco de endereço, cartão do detalhe, etiquetas da linha) e `explicacao={situacao.explicacao}` na situação. Na `LinhaNovo`, `<Etiqueta texto={`Site: …`} tom="neutro" explicacao={EXPLICACAO_NOVO} />` (importe `EXPLICACAO_NOVO` de `@/lib/painel`).

- [ ] **Step 3: `components/painel.tsx`**

Estado e filtro:

```tsx
  const [grupo, setGrupo] = useState("");
  const grupos = useMemo(() => filtrarGrupos(retrato.grupos, filtro, busca, grupo), [retrato, filtro, busca, grupo]);
  const filtrando = filtro !== "tudo" || busca.trim() !== "" || grupo !== "";
```

Na barra de filtros, antes do `<div className="grow" />`:

```tsx
        <label htmlFor="grupo" className="ml-2 text-xs text-cinza-claro">Grupo</label>
        <select
          id="grupo"
          value={grupo}
          onChange={(e) => setGrupo(e.target.value)}
          className="max-w-72 rounded-md border border-borda-forte bg-cartao px-2 py-1 text-xs"
        >
          <option value="">Todos os grupos</option>
          {retrato.grupos.map((g) => <option key={g.grupo} value={g.grupo}>{g.grupo}</option>)}
        </select>
```

Cabeçalho do grupo fixo ao rolar: na `div` do cabeçalho de cada `<section>`, acrescente `sticky top-0 z-10` e garanta `bg-cartao`.

- [ ] **Step 4: `CLAUDE.md`**

Na tabela de documentos de decisão, depois da linha `2026-10-01 | painel-local-retrato-em-arquivo.md`, acrescente:
`| 2026-10-02 | \`ajustes-do-painel-genero-tcu-publicacao.md\` | Gênero não muda a regra de protocolo; "Nada a revisar"; "Cargo vazio"; filtro por grupo; explicações; TCU por navegador (Plano B); retrato publicado com senha (Plano C) | Vigente; Plano A implementado |`
Em "Semântica dos vereditos", acrescente ao fim da seção: "No painel, a situação da linha é \"Tudo confere\" só com todas as etiquetas verdes; com etiqueta neutra (sem regra, a completar, não verificado) e nada a revisar, \"Nada a revisar\". Cargo vazio é atenção." Atualize a contagem de testes com o número real de `npm test`.

- [ ] **Step 5: Rode tudo e confira no navegador**

Run: `npm test && npm run typecheck && npm run build`. Depois `npm run dev` e, em `http://localhost:3000` (o retrato de 01/10 já está em `.fiscal/`): o seletor "Grupo" isola um grupo e combina com "Possível saída"; o cabeçalho do grupo fica no topo ao rolar; passar o cursor numa etiqueta mostra a frase; nos Senadores, as senadoras **ainda** mostram "sem regra" (o retrato é antigo; a Camada B só vale numa varredura nova), e a situação das linhas com etiqueta neutra diz "Nada a revisar". Pare o servidor. Registre no relatório, sem nomes.

- [ ] **Step 6: Commit**

```bash
git add components/etiqueta.tsx components/linha-contato.tsx components/painel.tsx CLAUDE.md
git commit -m "feat: seletor de grupo, cabeçalho fixo e explicação no cursor; CLAUDE.md com o spec de 02/10

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Verificação final

- [ ] `npm test`, `npm run typecheck`, `npm run build` verdes.
- [ ] Varredura nova com as duas planilhas reais (daqui) e conferir: as 15 senadoras saem de "sem regra"; os 17 "Cargo vazio" estão no grupo PILOTO; nenhum contato muda de semáforo (o verde do cartão "Conferem" continua 175).
- [ ] `git log --oneline feat/painel-local..HEAD`: spec + três commits; nenhum `.xlsx`, `.fiscal/`, pnpm, `PROXIMA_SESSAO*`.
