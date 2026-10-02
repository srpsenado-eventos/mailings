# Auditoria de endereço — Fase 1 (sem Correios) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer o endereço estruturado para dentro da auditoria pela junção por `Id`, apontar o que falta e o que o app pode completar, e entregar isso na tela e na planilha — sem depender da API dos Correios.

**Architecture:** A auditoria de endereço é um eixo **independente**: não depende da fonte oficial, não entra em `camposDivergentes` e não pinta o semáforo. Por isso ela não toca `lib/match.ts`: o orquestrador anexa `ResultadoContato.endereco` numa passada posterior, sobre o `ResultadoGrupo` que `compararGrupo` já devolveu, em todos os caminhos (com fonte, sem fonte, fonte inacessível). A leitura da segunda planilha acontece no navegador, como a primeira.

**Tech Stack:** TypeScript, Next.js 15 (App Router), SheetJS (`xlsx`), Vitest. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-01-auditoria-de-endereco-camada-d.md` — leia antes de começar; as medições que justificam cada regra estão lá.

## Global Constraints

- `lib/*.ts` são funções puras: sem JSX, sem hooks, sem `window`, sem `fetch` fora de `lib/scrape.ts`.
- Imutabilidade: nenhuma função muta input; devolve novo objeto/array.
- **Sem `any`.** `unknown` + narrowing, ou tipo declarado.
- Normalização centralizada em `lib/normalize.ts` (`normalizarTexto`, `normalizarNome`). Não reimplementar "minúsculas + sem acento".
- **Sem PII no log nem no prompt.** O endereço **nunca** vai para `console.*` nem para a Camada 2. O prompt da IA continua recebendo só nome do grupo e texto público da página.
- **A auditoria de endereço não pinta o semáforo.** Ela não entra em `comparacoes`, não entra em `camposDivergentes`, não cria `possivelSaida`. `fonte_nao_informa` e `sem_regra` continuam não sendo divergência.
- **Nada de rede nesta fase.** Nenhum `fetch` novo, nenhuma chave, nenhuma variável de ambiente. A conferência nos Correios é a Fase 2.
- Erros tipados e explícitos; a rota captura e devolve `{ ok: false, message }`.
- Comentários e nomes de teste em português do Brasil, na voz dos arquivos vizinhos. Testes em AAA.
- Gerenciador é npm: `npm test`, `npm run typecheck`, `npm run build`. Nunca criar nem commitar `pnpm-lock.yaml` / `pnpm-workspace.yaml`.
- **Não commitar `CLAUDE.md`** — ele carrega alteração não commitada do usuário. Também não commitar `PROXIMA_SESSAO.md` nem nenhum `.xlsx`.
- Commit: conventional commit em português, terminando com a linha exata (confira com `git log -1 --format=%B` depois):
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Branch de trabalho: `feat/auditoria-de-endereco` (já criada, com o spec commitado).

## Review Focus

Classes de entrada que o spec pressupõe e que o mundo real traz. Cada uma tem o teste apontado na tarefa dona:

1. **CEP de sete dígitos com UF diferente de SP** — a recuperação do zero à esquerda vale **só** para SP, porque só SP tem CEP começando em zero. Em qualquer outra UF o CEP é inválido, nunca uma proposta. → Task 1, Step 6.
2. **Linha de endereço cujo `Contato Id` não corresponde a contato nenhum** — a base tem 1.531 linhas para 418 contatos do agrupador; as 1.100+ sobrando são ignoradas em silêncio, sem erro e sem custo. → Task 3, Step 8.
3. **Planilha de endereços sem a coluna `Contato Id`** — erro claro nomeando a coluna, nunca junção vazia silenciosa. → Task 2, Step 6.
4. **Contato sem `Id` quando a base existe** — cai para nome; nome que casa mais de um `Contato Id` **não recebe endereço** e sai `nao_verificado`. → Task 3, Step 10.
5. **Nenhuma planilha de endereços** — o resultado tem que ser idêntico ao de hoje, e a planilha baixada não pode mudar a ordem nem o conteúdo das colunas existentes. → Task 7, Step 6.

---

## Arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `lib/types.ts` | `EnderecoEstruturado`, `SituacaoEndereco`, `AchadoEndereco`, `AuditoriaEndereco`, `ContatoPlanilha.id`, `ResumoAnalise.enderecosAConfirmar` | 1 |
| `lib/cep.ts` | normalizar, classificar e formatar CEP (puro, sem rede) | 1 |
| `lib/planilha-enderecos.ts` | ler a planilha de endereços no navegador | 2 |
| `lib/endereco.ts` | indexar a base e auditar um contato | 3 |
| `lib/analise.ts` | anexar a auditoria a todos os caminhos + contador no resumo | 4 |
| `lib/analise-payload.ts`, `app/api/analise/route.ts` | aceitar a segunda planilha no corpo JSON | 5 |
| `components/upload-zone.tsx` | segundo arquivo, opcional | 6 |
| `lib/export.ts` | endereço em colunas separadas | 7 |
| `components/resultado-tabela.tsx`, `app/page.tsx` | situação do endereço na linha e contador no resumo | 8 |

---

### Task 1: Tipos e o módulo de CEP

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/cep.ts`
- Test: `tests/cep.test.ts`

**Interfaces:**
- Consumes: nada (primeira tarefa).
- Produces: `EnderecoEstruturado`, `SituacaoEndereco`, `AchadoEndereco`, `AuditoriaEndereco`, `ContatoPlanilha.id?`, `ResultadoContato.endereco?`, `ResumoAnalise.enderecosAConfirmar`; e de `lib/cep.ts`: `normalizarCep(valor?: string): string`, `formatarCep(digitos: string): string`, `classificarCep(valor: string | undefined, uf: string | undefined): Cep` com `Cep = { situacao: "valido" | "recuperavel" | "invalido" | "ausente"; digitos?: string; proposto?: string }`.

- [ ] **Step 1: Escreva os testes que falham**

Crie `tests/cep.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { classificarCep, formatarCep, normalizarCep } from "@/lib/cep";

describe("normalizarCep", () => {
  test("mantém só os dígitos", () => {
    expect(normalizarCep("70070-030")).toBe("70070030");
    expect(normalizarCep(" 01.049-000 ")).toBe("01049000");
    expect(normalizarCep(undefined)).toBe("");
  });
});

describe("classificarCep", () => {
  test("oito dígitos é válido", () => {
    expect(classificarCep("70070-030", "DF")).toEqual({ situacao: "valido", digitos: "70070030" });
  });

  test("sete dígitos em SP é recuperável: o zero à esquerda caiu na exportação", () => {
    expect(classificarCep("1049000", "SP")).toEqual({ situacao: "recuperavel", proposto: "01049000" });
    expect(classificarCep("4531003", "SP")).toEqual({ situacao: "recuperavel", proposto: "04531003" });
  });

  test("vazio é ausente, não inválido", () => {
    expect(classificarCep("", "DF").situacao).toBe("ausente");
    expect(classificarCep(undefined, undefined).situacao).toBe("ausente");
  });

  test("qualquer outro tamanho é inválido", () => {
    expect(classificarCep("700989000", "DF").situacao).toBe("invalido");
    expect(classificarCep("70070", "DF").situacao).toBe("invalido");
    expect(classificarCep("7007003", "DF").situacao).toBe("invalido");
  });
});

describe("formatarCep", () => {
  test("põe o hífen em oito dígitos e devolve o resto como veio", () => {
    expect(formatarCep("70070030")).toBe("70070-030");
    expect(formatarCep("7007003")).toBe("7007003");
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/cep.test.ts`
Expected: FAIL — `lib/cep.ts` não existe.

- [ ] **Step 3: Implemente `lib/cep.ts`**

```ts
/**
 * CEP do cadastro: normalização, classificação e formatação. Puro e sem rede —
 * a conferência contra os Correios é a Fase 2 deste spec.
 */

export type SituacaoCep = "valido" | "recuperavel" | "invalido" | "ausente";

export interface Cep {
  situacao: SituacaoCep;
  /** Oito dígitos, só quando `valido`. */
  digitos?: string;
  /** Oito dígitos propostos, só quando `recuperavel`. Ainda NÃO confirmado. */
  proposto?: string;
}

/**
 * Faixa de CEP de São Paulo: 01000-000 a 19999-999. É a única UF com CEP
 * começando em zero, e é por isso que a recuperação do dígito perdido só vale lá.
 */
const FAIXA_SP = /^(0[1-9]|1\d)/;

export function normalizarCep(valor?: string): string {
  return String(valor ?? "").replace(/\D/g, "");
}

export function formatarCep(digitos: string): string {
  return /^\d{8}$/.test(digitos) ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}

/**
 * Classifica o CEP de uma linha da base de endereços.
 *
 * Sete dígitos com UF igual a SP é o defeito medido em 31 linhas da base de
 * 2026-10-01: o campo foi exportado como número e o zero inicial caiu
 * (`1049000` era `01049-000`). A proposta só sai quando o resultado cai na faixa
 * de SP, e continua sendo **proposta** até a Fase 2 conferir nos Correios.
 */
export function classificarCep(valor: string | undefined, uf: string | undefined): Cep {
  const digitos = normalizarCep(valor);
  if (digitos.length === 0) return { situacao: "ausente" };
  if (digitos.length === 8) return { situacao: "valido", digitos };
  if (digitos.length === 7 && String(uf ?? "").trim().toUpperCase() === "SP") {
    const proposto = `0${digitos}`;
    if (FAIXA_SP.test(proposto)) return { situacao: "recuperavel", proposto };
  }
  return { situacao: "invalido" };
}
```

- [ ] **Step 4: Rode e confirme que passa**

Run: `npx vitest run tests/cep.test.ts`
Expected: PASS.

- [ ] **Step 5: Acrescente os tipos**

Em `lib/types.ts`, acrescente o campo `id` em `ContatoPlanilha`, logo antes de `foto`:

```ts
  /**
   * `Id` do contato no Sistema Contatos. Chave exata da junção com a base de
   * endereços: casar por nome deixa 26 dos 418 contatos do agrupador ambíguos
   * (medido em 2026-10-01), e endereço de outra pessoa é pior que endereço ausente.
   */
  id?: string;
```

E acrescente, depois de `RegraTratamento`, o bloco da auditoria de endereço:

```ts
/** Uma linha da planilha de endereços do Sistema Contatos, com os campos separados. */
export interface EnderecoEstruturado {
  contatoId: string;
  enderecoId?: string;
  /** Nome como está na base de endereços — usado só na junção por nome, sem `Id`. */
  nome?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  pais?: string;
  cep?: string;
  /** Coluna `Prioritário` (Sim/Não): qual endereço vale quando o contato tem vários. */
  prioritario: boolean;
}

/**
 * Situação do endereço de um contato. Eixo **separado** do semáforo: endereço
 * incompleto não é divergência contra fonte nenhuma, é trabalho de telefone pendente.
 * `sem_base` = nenhuma planilha de endereços foi enviada (comportamento de hoje).
 */
export type SituacaoEndereco = "completo" | "a_completar" | "pendente" | "nao_verificado" | "sem_base";

/** O que a auditoria de endereço encontrou. `rotuloAchadoEndereco` traduz cada código. */
export type AchadoEndereco =
  | "sem_linha"
  | "sem_logradouro"
  | "sem_numero"
  | "sem_bairro"
  | "cep_ausente"
  | "cep_invalido"
  | "cep_recuperavel"
  | "nome_ambiguo"
  | "sem_prioritario"
  | "varios_prioritarios";

export interface AuditoriaEndereco {
  situacao: SituacaoEndereco;
  achados: AchadoEndereco[];
  /** A linha escolhida da base. Ausente quando não há linha ou a junção não resolveu. */
  endereco?: EnderecoEstruturado;
  /** Endereço montado no formato do Contatos, pronto para copiar. */
  formatado?: string;
  /** Quantas linhas de endereço o contato tem na base (para explicar a escolha). */
  linhas?: number;
}
```

Ainda em `lib/types.ts`, acrescente o campo em `ResultadoContato`, depois de `observacao`:

```ts
  /**
   * Auditoria de endereço (Camada D). **Não** entra em `camposDivergentes` nem muda
   * `semaforo`: ver docs/superpowers/specs/2026-10-01-auditoria-de-endereco-camada-d.md
   */
  endereco?: AuditoriaEndereco;
```

E em `ResumoAnalise`, depois de `indeterminado`:

```ts
  /** Contatos cujo endereço precisa de confirmação humana (situacao `pendente`). */
  enderecosAConfirmar: number;
```

- [ ] **Step 6: Teste do Review Focus 1 — sete dígitos fora de SP**

Acrescente em `tests/cep.test.ts`:

```ts
  test("sete dígitos fora de SP é inválido, nunca proposta — só SP tem CEP com zero à esquerda", () => {
    expect(classificarCep("1049000", "DF")).toEqual({ situacao: "invalido" });
    expect(classificarCep("1049000", "RJ")).toEqual({ situacao: "invalido" });
    expect(classificarCep("1049000", undefined)).toEqual({ situacao: "invalido" });
  });

```

Só este teste. Não escreva um caso de "sete dígitos em SP fora da faixa": com o zero na frente, qualquer entrada de sete dígitos vira `0X…`, que sempre cai na faixa de SP — a guarda `FAIXA_SP` existe para o caso de a regra ser estendida a outra UF depois, e é inalcançável por entrada de sete dígitos. Vale um comentário no código, não um teste que não pode falhar.

- [ ] **Step 7: Rode o arquivo e o typecheck**

Run: `npx vitest run tests/cep.test.ts && npm run typecheck`
Expected: PASS nos testes; `tsc` limpo (os tipos novos são todos opcionais, nada quebra).

- [ ] **Step 8: Rode a suíte inteira**

Run: `npm test`
Expected: verde. `ResumoAnalise.enderecosAConfirmar` é obrigatório no tipo — se algum teste monta `ResumoAnalise` à mão, ele vai falhar no typecheck; acrescente `enderecosAConfirmar: 0` nesses literais.

- [ ] **Step 9: Commit**

```bash
git add lib/cep.ts lib/types.ts tests/cep.test.ts
git commit -m "feat: módulo de CEP e tipos da auditoria de endereço

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Leitura da planilha de endereços

**Files:**
- Create: `lib/planilha-enderecos.ts`
- Test: `tests/planilha-enderecos.test.ts`

**Interfaces:**
- Consumes: `EnderecoEstruturado` (Task 1); `ColunaFaltanteError` de `@/lib/planilha`.
- Produces: `lerPlanilhaEnderecos(buffer: ArrayBuffer): EnderecoEstruturado[]`.

- [ ] **Step 1: Escreva os testes que falham**

Crie `tests/planilha-enderecos.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { lerPlanilhaEnderecos } from "@/lib/planilha-enderecos";
import { ColunaFaltanteError } from "@/lib/planilha";

function montarXlsx(linhas: Record<string, string>[]): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Folha1");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("lerPlanilhaEnderecos", () => {
  test("mapeia as colunas da exportação, com acento e caixa livres", () => {
    const buf = montarXlsx([
      {
        "Contato Id": "4711",
        "Endereço Id": "88",
        Nome: "Autoridade de Teste",
        Logradouro: "Setor de Autarquias Sul, Quadra 3",
        Numero: "S/N",
        Complemento: "Bloco A, sala 412",
        Bairro: "Asa Sul",
        Cidade: "Brasília",
        UF: "DF",
        "País": "Brasil",
        CEP: "70070-030",
        "Prioritário": "Sim",
      },
    ]);
    const linhas = lerPlanilhaEnderecos(buf);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      contatoId: "4711",
      enderecoId: "88",
      logradouro: "Setor de Autarquias Sul, Quadra 3",
      numero: "S/N",
      bairro: "Asa Sul",
      uf: "DF",
      cep: "70070-030",
      prioritario: true,
    });
  });

  test("Prioritário diferente de Sim é falso", () => {
    const buf = montarXlsx([{ "Contato Id": "1", "Prioritário": "Não" }]);
    expect(lerPlanilhaEnderecos(buf)[0].prioritario).toBe(false);
  });

  test("ignora a coluna de lixo da exportação e linhas sem Contato Id", () => {
    const buf = montarXlsx([
      { "&nbsp;": "x", "Contato Id": "1", Logradouro: "Rua A" },
      { "&nbsp;": "", "Contato Id": "", Logradouro: "" },
    ]);
    const linhas = lerPlanilhaEnderecos(buf);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].contatoId).toBe("1");
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/planilha-enderecos.test.ts`
Expected: FAIL — o módulo não existe.

- [ ] **Step 3: Implemente `lib/planilha-enderecos.ts`**

```ts
import * as XLSX from "xlsx";
import type { EnderecoEstruturado } from "@/lib/types";
import { normalizarTexto } from "@/lib/normalize";
import { ColunaFaltanteError } from "@/lib/planilha";

/**
 * Leitura da planilha de endereços do Sistema Contatos (`BASE ENDERECO`), feita no
 * navegador como a dos contatos. Mesmo padrão de `lib/planilha.ts`: cabeçalho
 * casado normalizado, coluna ausente vira erro claro em vez de campo vazio.
 *
 * A exportação real traz uma primeira coluna de lixo (`&nbsp;`), que é ignorada
 * por não estar no mapa.
 */
const MAPA_COLUNAS = {
  contatoId: "contato id",
  enderecoId: "endereco id",
  nome: "nome",
  logradouro: "logradouro",
  numero: "numero",
  complemento: "complemento",
  bairro: "bairro",
  cidade: "cidade",
  uf: "uf",
  pais: "pais",
  cep: "cep",
  prioritario: "prioritario",
} as const;

type Campo = keyof typeof MAPA_COLUNAS;

/** Sem `Contato Id` não existe junção: é erro, não planilha vazia. */
const OBRIGATORIAS: Campo[] = ["contatoId"];

export function lerPlanilhaEnderecos(buffer: ArrayBuffer): EnderecoEstruturado[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new ColunaFaltanteError([MAPA_COLUNAS.contatoId]);

  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (linhas.length === 0) return [];

  const idx = new Map<string, string>();
  for (const chave of Object.keys(linhas[0])) idx.set(normalizarTexto(chave), chave);

  const faltantes = OBRIGATORIAS.filter((c) => !idx.has(MAPA_COLUNAS[c])).map((c) => MAPA_COLUNAS[c]);
  if (faltantes.length > 0) throw new ColunaFaltanteError(faltantes);

  const pegar = (linha: Record<string, unknown>, campo: Campo): string => {
    const chave = idx.get(MAPA_COLUNAS[campo]);
    if (!chave) return "";
    return String(linha[chave] ?? "").trim();
  };

  const enderecos: EnderecoEstruturado[] = [];
  for (const linha of linhas) {
    const contatoId = pegar(linha, "contatoId");
    if (!contatoId) continue; // linha vazia da exportação
    enderecos.push({
      contatoId,
      enderecoId: pegar(linha, "enderecoId") || undefined,
      nome: pegar(linha, "nome") || undefined,
      logradouro: pegar(linha, "logradouro") || undefined,
      numero: pegar(linha, "numero") || undefined,
      complemento: pegar(linha, "complemento") || undefined,
      bairro: pegar(linha, "bairro") || undefined,
      cidade: pegar(linha, "cidade") || undefined,
      uf: pegar(linha, "uf") || undefined,
      pais: pegar(linha, "pais") || undefined,
      cep: pegar(linha, "cep") || undefined,
      prioritario: normalizarTexto(pegar(linha, "prioritario")) === "sim",
    });
  }
  return enderecos;
}
```

- [ ] **Step 4: Rode e confirme que passa**

Run: `npx vitest run tests/planilha-enderecos.test.ts`
Expected: PASS.

- [ ] **Step 5: Rode a suíte e o typecheck**

Run: `npm test && npm run typecheck`
Expected: verde.

- [ ] **Step 6: Teste do Review Focus 3 — planilha sem `Contato Id`**

Acrescente em `tests/planilha-enderecos.test.ts`:

```ts
  test("planilha sem Contato Id lança erro nomeando a coluna, em vez de junção vazia", () => {
    const buf = montarXlsx([{ Nome: "Autoridade de Teste", Logradouro: "Rua A", CEP: "70070-030" }]);
    expect(() => lerPlanilhaEnderecos(buf)).toThrow(ColunaFaltanteError);
    try {
      lerPlanilhaEnderecos(buf);
    } catch (err) {
      expect((err as ColunaFaltanteError).colunas).toEqual(["contato id"]);
    }
  });
```

- [ ] **Step 7: Rode e confirme**

Run: `npx vitest run tests/planilha-enderecos.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/planilha-enderecos.ts tests/planilha-enderecos.test.ts
git commit -m "feat: leitura da planilha de endereços do Sistema Contatos

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Índice e auditoria de endereço

**Files:**
- Create: `lib/endereco.ts`
- Test: `tests/endereco.test.ts`

**Interfaces:**
- Consumes: `EnderecoEstruturado`, `AuditoriaEndereco`, `AchadoEndereco`, `SituacaoEndereco`, `ContatoPlanilha` (Task 1); `classificarCep`, `formatarCep` (Task 1).
- Produces:
  - `indexarEnderecos(linhas: EnderecoEstruturado[]): IndiceEnderecos`
  - `IndiceEnderecos = { porId: Map<string, EnderecoEstruturado[]>; porNome: Map<string, Set<string>> }`
  - `auditarEndereco(contato: ContatoPlanilha, indice?: IndiceEnderecos): AuditoriaEndereco`
  - `formatarEnderecoContatos(e: EnderecoEstruturado): string`
  - `rotuloAchadoEndereco(a: AchadoEndereco): string`

- [ ] **Step 1: Escreva os testes que falham**

Crie `tests/endereco.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { auditarEndereco, formatarEnderecoContatos, indexarEnderecos } from "@/lib/endereco";
import type { ContatoPlanilha, EnderecoEstruturado } from "@/lib/types";

const linha = (over: Partial<EnderecoEstruturado> = {}): EnderecoEstruturado => ({
  contatoId: "1",
  nome: "Autoridade de Teste",
  logradouro: "Setor de Autarquias Sul, Quadra 3",
  numero: "S/N",
  complemento: "Bloco A, sala 412",
  bairro: "Asa Sul",
  cidade: "Brasília",
  uf: "DF",
  cep: "70070-030",
  prioritario: true,
  ...over,
});

const contato = (over: Partial<ContatoPlanilha> = {}): ContatoPlanilha => ({
  nome: "Autoridade de Teste",
  grupo: "Ministros do TST",
  ...over,
});

describe("auditarEndereco", () => {
  test("sem base de endereços devolve sem_base, como hoje", () => {
    const a = auditarEndereco(contato({ id: "1" }), undefined);
    expect(a.situacao).toBe("sem_base");
    expect(a.achados).toEqual([]);
  });

  test("endereço completo casa pelo Id e monta a string no formato do Contatos", () => {
    const a = auditarEndereco(contato({ id: "1" }), indexarEnderecos([linha()]));
    expect(a.situacao).toBe("completo");
    expect(a.achados).toEqual([]);
    expect(a.formatado).toBe(
      "Setor de Autarquias Sul, Quadra 3, S/N - Bloco A, sala 412\nAsa Sul\n70070-030 Brasília - DF",
    );
  });

  test("complemento ausente não é achado", () => {
    const a = auditarEndereco(contato({ id: "1" }), indexarEnderecos([linha({ complemento: undefined })]));
    expect(a.situacao).toBe("completo");
    expect(a.achados).toEqual([]);
  });

  test("bairro ausente com CEP válido é a completar, não pendência", () => {
    const a = auditarEndereco(contato({ id: "1" }), indexarEnderecos([linha({ bairro: undefined })]));
    expect(a.situacao).toBe("a_completar");
    expect(a.achados).toContain("sem_bairro");
  });

  test("CEP de sete dígitos em SP é a completar", () => {
    const a = auditarEndereco(
      contato({ id: "1" }),
      indexarEnderecos([linha({ cep: "1049000", uf: "SP", cidade: "São Paulo" })]),
    );
    expect(a.situacao).toBe("a_completar");
    expect(a.achados).toContain("cep_recuperavel");
  });

  test("sem número é pendência humana", () => {
    const a = auditarEndereco(contato({ id: "1" }), indexarEnderecos([linha({ numero: undefined })]));
    expect(a.situacao).toBe("pendente");
    expect(a.achados).toContain("sem_numero");
  });

  test("CEP vazio é pendência humana", () => {
    const a = auditarEndereco(contato({ id: "1" }), indexarEnderecos([linha({ cep: undefined })]));
    expect(a.situacao).toBe("pendente");
    expect(a.achados).toContain("cep_ausente");
  });

  test("contato sem linha na base é pendência", () => {
    const a = auditarEndereco(contato({ id: "999" }), indexarEnderecos([linha()]));
    expect(a.situacao).toBe("pendente");
    expect(a.achados).toEqual(["sem_linha"]);
  });

  test("dois endereços com um prioritário usa o prioritário", () => {
    const indice = indexarEnderecos([
      linha({ enderecoId: "1", prioritario: false, complemento: "Antigo" }),
      linha({ enderecoId: "2", prioritario: true, complemento: "Bloco A, sala 412" }),
    ]);
    const a = auditarEndereco(contato({ id: "1" }), indice);
    expect(a.endereco?.enderecoId).toBe("2");
    expect(a.linhas).toBe(2);
    expect(a.situacao).toBe("completo");
  });

  test("dois endereços e nenhum prioritário é pendência, nunca escolha", () => {
    const indice = indexarEnderecos([
      linha({ enderecoId: "1", prioritario: false }),
      linha({ enderecoId: "2", prioritario: false }),
    ]);
    const a = auditarEndereco(contato({ id: "1" }), indice);
    expect(a.situacao).toBe("pendente");
    expect(a.achados).toContain("sem_prioritario");
    expect(a.endereco).toBeUndefined();
  });
});

describe("formatarEnderecoContatos", () => {
  test("omite as linhas que não têm conteúdo", () => {
    expect(formatarEnderecoContatos(linha({ bairro: undefined, complemento: undefined }))).toBe(
      "Setor de Autarquias Sul, Quadra 3, S/N\n70070-030 Brasília - DF",
    );
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/endereco.test.ts`
Expected: FAIL — o módulo não existe.

- [ ] **Step 3: Implemente `lib/endereco.ts`**

```ts
import type {
  AchadoEndereco,
  AuditoriaEndereco,
  ContatoPlanilha,
  EnderecoEstruturado,
} from "@/lib/types";
import { normalizarNome } from "@/lib/normalize";
import { classificarCep, formatarCep } from "@/lib/cep";

/**
 * Índice da base de endereços. `porId` é a junção exata; `porNome` existe só para o
 * caso de a planilha de contatos não trazer `Id`, e guarda o CONJUNTO de ids de cada
 * nome — nome que aponta para mais de um id é ambíguo e não recebe endereço.
 */
export interface IndiceEnderecos {
  porId: Map<string, EnderecoEstruturado[]>;
  porNome: Map<string, Set<string>>;
}

export function indexarEnderecos(linhas: EnderecoEstruturado[]): IndiceEnderecos {
  const porId = new Map<string, EnderecoEstruturado[]>();
  const porNome = new Map<string, Set<string>>();
  for (const linha of linhas) {
    porId.set(linha.contatoId, [...(porId.get(linha.contatoId) ?? []), linha]);
    const chave = normalizarNome(linha.nome ?? "");
    if (!chave) continue;
    const ids = porNome.get(chave) ?? new Set<string>();
    ids.add(linha.contatoId);
    porNome.set(chave, ids);
  }
  return { porId, porNome };
}

/** Monta o endereço no formato que o Sistema Contatos usa no campo `Endereço`. */
export function formatarEnderecoContatos(e: EnderecoEstruturado): string {
  const primeira = [e.logradouro, e.numero].filter(Boolean).join(", ");
  const comComplemento = e.complemento ? `${primeira} - ${e.complemento}` : primeira;
  const cep = classificarCep(e.cep, e.uf);
  const digitos = cep.digitos ?? cep.proposto;
  const ultima = [digitos ? formatarCep(digitos) : "", [e.cidade, e.uf].filter(Boolean).join(" - ")]
    .filter((p) => p.length > 0)
    .join(" ");
  return [comComplemento, e.bairro ?? "", ultima].filter((l) => l.trim().length > 0).join("\n");
}

const ROTULOS: Record<AchadoEndereco, string> = {
  sem_linha: "sem endereço cadastrado",
  sem_logradouro: "sem logradouro",
  sem_numero: "sem número",
  sem_bairro: "sem bairro (sai do CEP)",
  cep_ausente: "sem CEP",
  cep_invalido: "CEP inválido",
  cep_recuperavel: "CEP com dígito faltando (proposta pronta)",
  nome_ambiguo: "nome casa mais de um contato — endereço não atribuído",
  sem_prioritario: "vários endereços, nenhum prioritário",
  varios_prioritarios: "vários endereços marcados como prioritários",
};

export function rotuloAchadoEndereco(achado: AchadoEndereco): string {
  return ROTULOS[achado];
}

/** Achados que exigem pessoa: ninguém completa isso sozinho. */
const PENDENCIAS: readonly AchadoEndereco[] = [
  "sem_linha",
  "sem_logradouro",
  "sem_numero",
  "cep_ausente",
  "cep_invalido",
  "sem_prioritario",
  "varios_prioritarios",
];

function escolher(linhas: EnderecoEstruturado[]): { escolhido?: EnderecoEstruturado; achado?: AchadoEndereco } {
  if (linhas.length === 1) return { escolhido: linhas[0] };
  const prioritarios = linhas.filter((l) => l.prioritario);
  if (prioritarios.length === 1) return { escolhido: prioritarios[0] };
  return { achado: prioritarios.length === 0 ? "sem_prioritario" : "varios_prioritarios" };
}

function achadosDe(e: EnderecoEstruturado): AchadoEndereco[] {
  const achados: AchadoEndereco[] = [];
  if (!e.logradouro) achados.push("sem_logradouro");
  if (!e.numero) achados.push("sem_numero");
  const cep = classificarCep(e.cep, e.uf);
  if (cep.situacao === "ausente") achados.push("cep_ausente");
  if (cep.situacao === "invalido") achados.push("cep_invalido");
  if (cep.situacao === "recuperavel") achados.push("cep_recuperavel");
  // Bairro só é "completável" quando há CEP de onde tirá-lo; sem CEP, a pendência é o CEP.
  if (!e.bairro && cep.situacao !== "ausente" && cep.situacao !== "invalido") achados.push("sem_bairro");
  return achados;
}

/**
 * Auditoria de endereço de um contato (Camada D). Eixo separado do semáforo: o
 * resultado nunca entra em `camposDivergentes` nem produz "possível saída". Ver
 * docs/superpowers/specs/2026-10-01-auditoria-de-endereco-camada-d.md
 */
export function auditarEndereco(
  contato: ContatoPlanilha,
  indice?: IndiceEnderecos,
): AuditoriaEndereco {
  if (!indice) return { situacao: "sem_base", achados: [] };

  let linhas: EnderecoEstruturado[] | undefined;
  if (contato.id) {
    linhas = indice.porId.get(contato.id);
  } else {
    const ids = indice.porNome.get(normalizarNome(contato.nome));
    // Nome que casa mais de um contato não recebe endereço: endereço de outra
    // pessoa é pior que endereço ausente (26 de 418 ambíguos, medido em 2026-10-01).
    if (ids && ids.size > 1) return { situacao: "nao_verificado", achados: ["nome_ambiguo"] };
    if (ids && ids.size === 1) linhas = indice.porId.get([...ids][0]);
  }

  if (!linhas || linhas.length === 0) return { situacao: "pendente", achados: ["sem_linha"] };

  const { escolhido, achado } = escolher(linhas);
  if (!escolhido) return { situacao: "pendente", achados: [achado!], linhas: linhas.length };

  const achados = achadosDe(escolhido);
  const situacao = achados.some((a) => PENDENCIAS.includes(a))
    ? "pendente"
    : achados.length > 0
      ? "a_completar"
      : "completo";
  return {
    situacao,
    achados,
    endereco: escolhido,
    formatado: formatarEnderecoContatos(escolhido),
    linhas: linhas.length,
  };
}
```

O `achado!` na linha da escolha é seguro porque `escolher` devolve um dos dois campos sempre; se preferir evitar o `!`, troque por `achados: achado ? [achado] : []`.

- [ ] **Step 4: Rode e confirme que passa**

Run: `npx vitest run tests/endereco.test.ts`
Expected: PASS. Se o formato montado sair diferente do esperado no teste, confira o teste contra o formato real medido — `"Logradouro, Numero - Complemento\nBairro\nCEP Cidade - UF"` — e corrija quem estiver errado, dizendo qual no relatório.

- [ ] **Step 5: Rode a suíte e o typecheck**

Run: `npm test && npm run typecheck`
Expected: verde.

- [ ] **Step 6: Teste do caso dos dois prioritários**

```ts
  test("dois endereços e dois prioritários é pendência, nunca escolha", () => {
    const indice = indexarEnderecos([
      linha({ enderecoId: "1", prioritario: true }),
      linha({ enderecoId: "2", prioritario: true }),
    ]);
    const a = auditarEndereco(contato({ id: "1" }), indice);
    expect(a.situacao).toBe("pendente");
    expect(a.achados).toContain("varios_prioritarios");
    expect(a.endereco).toBeUndefined();
  });
```

- [ ] **Step 7: Rode e confirme**

Run: `npx vitest run tests/endereco.test.ts`
Expected: PASS.

- [ ] **Step 8: Teste do Review Focus 2 — linhas que não correspondem a contato nenhum**

```ts
  test("linhas de contatos que não estão na planilha são ignoradas sem erro", () => {
    // A base real tem 1.531 linhas para 418 contatos do agrupador.
    const indice = indexarEnderecos([
      linha({ contatoId: "1" }),
      linha({ contatoId: "2", nome: "Outra Autoridade" }),
      linha({ contatoId: "3", nome: "Terceira Autoridade" }),
    ]);
    const a = auditarEndereco(contato({ id: "1" }), indice);
    expect(a.situacao).toBe("completo");
    expect(a.linhas).toBe(1);
  });
```

- [ ] **Step 9: Rode e confirme**

Run: `npx vitest run tests/endereco.test.ts`
Expected: PASS.

- [ ] **Step 10: Teste do Review Focus 4 — contato sem `Id`**

```ts
  test("sem Id, casa por nome quando o nome é único na base", () => {
    const a = auditarEndereco(contato(), indexarEnderecos([linha()]));
    expect(a.situacao).toBe("completo");
    expect(a.endereco?.contatoId).toBe("1");
  });

  test("sem Id, nome que casa dois contatos não recebe endereço nenhum", () => {
    const indice = indexarEnderecos([
      linha({ contatoId: "1" }),
      linha({ contatoId: "2", complemento: "Outro lugar" }),
    ]);
    const a = auditarEndereco(contato(), indice);
    expect(a.situacao).toBe("nao_verificado");
    expect(a.achados).toEqual(["nome_ambiguo"]);
    expect(a.endereco).toBeUndefined();
    expect(a.formatado).toBeUndefined();
  });
```

- [ ] **Step 11: Rode a suíte inteira e o typecheck**

Run: `npm test && npm run typecheck`
Expected: verde.

- [ ] **Step 12: Commit**

```bash
git add lib/endereco.ts tests/endereco.test.ts
git commit -m "feat: auditoria de endereço — junção pelo Id, prioritário e três naturezas de achado

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: O orquestrador anexa a auditoria

**Files:**
- Modify: `lib/analise.ts`
- Test: `tests/analise.test.ts`

**Interfaces:**
- Consumes: `indexarEnderecos`, `auditarEndereco` (Task 3); `EnderecoEstruturado` (Task 1).
- Produces: `analisar(arquivoNome, contatos, deps, enderecos?: EnderecoEstruturado[])` — quarto parâmetro opcional; `ResultadoContato.endereco` preenchido em **todos** os caminhos; `ResumoAnalise.enderecosAConfirmar`.

- [ ] **Step 1: Escreva os testes que falham**

Em `tests/analise.test.ts`, acrescente um `describe` novo:

```ts
describe("auditoria de endereço anexada ao resultado", () => {
  const enderecos = [
    {
      contatoId: "7",
      nome: "Ana Maria Política Completa",
      logradouro: "Praça dos Três Poderes",
      numero: "S/N",
      bairro: "Zona Cívico-Administrativa",
      cidade: "Brasília",
      uf: "DF",
      cep: "70160-900",
      prioritario: true,
    },
  ];

  test("sem planilha de endereços, a situação é sem_base e o resumo conta zero", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], deps);
    expect(r.grupos[0].contatos[0].endereco?.situacao).toBe("sem_base");
    expect(r.resumo.enderecosAConfirmar).toBe(0);
  });

  test("com a planilha, o contato casado pelo Id recebe o endereço", async () => {
    const r = await analisar("c.xlsx", [{ ...contatos[0], id: "7" }], deps, enderecos);
    const e = r.grupos[0].contatos[0].endereco;
    expect(e?.situacao).toBe("completo");
    expect(e?.formatado).toContain("70160-900 Brasília - DF");
    expect(r.resumo.enderecosAConfirmar).toBe(0);
  });

  test("contato sem endereço na base conta no resumo como a confirmar", async () => {
    const r = await analisar("c.xlsx", [{ ...contatos[0], id: "999" }], deps, enderecos);
    expect(r.grupos[0].contatos[0].endereco?.situacao).toBe("pendente");
    expect(r.resumo.enderecosAConfirmar).toBe(1);
  });

  test("a auditoria não muda o semáforo nem cria divergência", async () => {
    const r = await analisar("c.xlsx", [{ ...contatos[0], id: "999" }], deps, enderecos);
    const c = r.grupos[0].contatos[0];
    expect(c.semaforo).toBe("verde");
    expect(c.camposDivergentes).toEqual([]);
    expect(c.possivelSaida).toBeUndefined();
  });

  test("grupo sem fonte também recebe a auditoria de endereço", async () => {
    const r = await analisar("c.xlsx", [{ ...contatos[1], id: "7" }], deps, enderecos);
    const c = r.grupos[0].contatos[0];
    expect(r.grupos[0].semFonte).toBe(true);
    expect(c.endereco?.situacao).toBe("completo");
  });
});
```

Use as constantes `contatos` e `deps` que já existem no topo do arquivo: `contatos[0]` está no grupo com fonte, `contatos[1]` no grupo sem fonte.

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/analise.test.ts -t "auditoria de endereço"`
Expected: FAIL — `analisar` não aceita o quarto argumento e `endereco` vem `undefined`.

- [ ] **Step 3: Implemente em `lib/analise.ts`**

Acrescente os imports:

```ts
import { auditarEndereco, indexarEnderecos, type IndiceEnderecos } from "@/lib/endereco";
import type { EnderecoEstruturado } from "@/lib/types";
```

Acrescente a função que anexa, antes de `analisar`:

```ts
/**
 * Anexa a auditoria de endereço a cada contato do grupo. Passada POSTERIOR de
 * propósito: o endereço não depende da fonte oficial, então não entra em
 * `compararGrupo` e vale igual nos três caminhos (com fonte, sem fonte, fonte
 * inacessível). Não toca `semaforo`, `camposDivergentes` nem `possivelSaida`.
 */
function anexarEnderecos(grupo: ResultadoGrupo, indice?: IndiceEnderecos): ResultadoGrupo {
  return {
    ...grupo,
    contatos: grupo.contatos.map((c) => ({ ...c, endereco: auditarEndereco(c.contato, indice) })),
  };
}
```

Em `resumir`, acrescente o contador. Na inicialização do objeto, depois de `indeterminado: 0`:

```ts
    enderecosAConfirmar: 0,
```

E dentro do laço dos contatos, ao lado de `resumo[c.semaforo] += 1`:

```ts
      if (c.endereco?.situacao === "pendente") resumo.enderecosAConfirmar += 1;
```

Em `analisar`, aceite a planilha e indexe uma vez:

```ts
export async function analisar(
  arquivoNome: string,
  contatos: ContatoPlanilha[],
  deps: Dependencias,
  enderecos?: EnderecoEstruturado[],
): Promise<ResultadoAnalise> {
  const indice = enderecos && enderecos.length > 0 ? indexarEnderecos(enderecos) : undefined;
  const porGrupo = agruparPorGrupo(contatos);
  const grupos = await Promise.all(
    [...porGrupo.entries()].map(async ([grupo, lista]) =>
      anexarEnderecos(await analisarGrupo(grupo, lista, deps), indice),
    ),
  );
  return { arquivoNome, grupos, resumo: resumir(grupos) };
}
```

- [ ] **Step 4: Rode e confirme que passa**

Run: `npx vitest run tests/analise.test.ts`
Expected: PASS. Testes antigos que montam `ResumoAnalise` à mão podem falhar no typecheck: acrescente `enderecosAConfirmar: 0` nesses literais.

- [ ] **Step 5: Rode a suíte inteira e o typecheck**

Run: `npm test && npm run typecheck`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add lib/analise.ts tests/analise.test.ts
git commit -m "feat: orquestrador anexa a auditoria de endereço em todos os caminhos

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: A segunda planilha no corpo da requisição

**Files:**
- Modify: `lib/analise-payload.ts`
- Modify: `app/api/analise/route.ts`
- Test: `tests/analise-payload.test.ts`

**Interfaces:**
- Consumes: `EnderecoEstruturado` (Task 1); `analisar(..., enderecos?)` (Task 4).
- Produces: `PayloadAnalise` com `enderecos?: EnderecoEstruturado[]` e `arquivoEnderecosNome?: string`.

- [ ] **Step 1: Escreva os testes que falham**

Em `tests/analise-payload.test.ts`:

```ts
  test("aceita a planilha de endereços e normaliza cada linha", () => {
    const p = parsePayloadAnalise({
      arquivoNome: "c.xlsx",
      contatos: [{ nome: "Autoridade", grupo: "G", id: "7" }],
      arquivoEnderecosNome: "enderecos.xlsx",
      enderecos: [
        { contatoId: "7", logradouro: "Rua A", numero: "10", cep: "70070-030", uf: "DF", prioritario: true },
        { contatoId: 9, prioritario: "Sim" },
      ],
    });
    expect(p.contatos[0].id).toBe("7");
    expect(p.arquivoEnderecosNome).toBe("enderecos.xlsx");
    expect(p.enderecos).toHaveLength(2);
    expect(p.enderecos?.[0]).toMatchObject({ contatoId: "7", numero: "10", prioritario: true });
    // tipos errados vindos do JSON não derrubam a rota: viram vazio/falso
    expect(p.enderecos?.[1]).toMatchObject({ contatoId: "", prioritario: false });
  });

  test("sem a planilha de endereços, o campo fica ausente", () => {
    const p = parsePayloadAnalise({ arquivoNome: "c.xlsx", contatos: [] });
    expect(p.enderecos).toBeUndefined();
  });

  test("planilha de endereços maior que o teto é recusada", () => {
    const enderecos = Array.from({ length: 50_001 }, () => ({ contatoId: "1", prioritario: false }));
    expect(() => parsePayloadAnalise({ arquivoNome: "c.xlsx", contatos: [], enderecos })).toThrow(
      PayloadInvalidoError,
    );
  });
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/analise-payload.test.ts`
Expected: FAIL — `enderecos` não existe no payload.

- [ ] **Step 3: Implemente em `lib/analise-payload.ts`**

Acrescente o import do tipo e o campo `id` em `narrowContato` (depois de `grupo`):

```ts
    id: textoOpcional(o.id),
```

Acrescente o narrowing da linha de endereço, depois de `narrowContato`:

```ts
/** Converte uma linha de endereço vinda do JSON num `EnderecoEstruturado` seguro. */
function narrowEndereco(v: unknown): EnderecoEstruturado {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  return {
    contatoId: texto(o.contatoId),
    enderecoId: textoOpcional(o.enderecoId),
    nome: textoOpcional(o.nome),
    logradouro: textoOpcional(o.logradouro),
    numero: textoOpcional(o.numero),
    complemento: textoOpcional(o.complemento),
    bairro: textoOpcional(o.bairro),
    cidade: textoOpcional(o.cidade),
    uf: textoOpcional(o.uf),
    pais: textoOpcional(o.pais),
    cep: textoOpcional(o.cep),
    prioritario: o.prioritario === true,
  };
}
```

Acrescente os campos na interface:

```ts
export interface PayloadAnalise {
  arquivoNome: string;
  contatos: ContatoPlanilha[];
  /** Nome da planilha de endereços, quando enviada. */
  arquivoEnderecosNome?: string;
  /** Linhas da planilha de endereços. Ausente = auditoria de endereço não roda. */
  enderecos?: EnderecoEstruturado[];
}
```

E, no fim de `parsePayloadAnalise`, antes do `return`:

```ts
  const { arquivoEnderecosNome, enderecos } = corpo as Record<string, unknown>;
  if (enderecos !== undefined && !Array.isArray(enderecos)) {
    throw new PayloadInvalidoError("Lista de endereços inválida.");
  }
  if (Array.isArray(enderecos) && enderecos.length > MAX_CONTATOS) {
    throw new PayloadInvalidoError(`Planilha de endereços muito grande (máximo ${MAX_CONTATOS} linhas).`);
  }
```

e devolva os campos novos:

```ts
  return {
    arquivoNome,
    contatos: contatos.map(narrowContato),
    ...(typeof arquivoEnderecosNome === "string" && arquivoEnderecosNome.length > 0
      ? { arquivoEnderecosNome }
      : {}),
    ...(Array.isArray(enderecos) ? { enderecos: enderecos.map(narrowEndereco) } : {}),
  };
```

- [ ] **Step 4: Ligue a rota**

Em `app/api/analise/route.ts`, troque a desestruturação e a chamada:

```ts
    const { arquivoNome, contatos, enderecos } = parsePayloadAnalise(corpo);
```

```ts
    const resultado = await analisar(arquivoNome, contatos, deps, enderecos);
```

- [ ] **Step 5: Rode a suíte e o typecheck**

Run: `npm test && npm run typecheck`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add lib/analise-payload.ts app/api/analise/route.ts tests/analise-payload.test.ts
git commit -m "feat: /api/analise aceita a planilha de endereços no corpo JSON

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Upload da segunda planilha

**Files:**
- Modify: `components/upload-zone.tsx`

**Interfaces:**
- Consumes: `lerPlanilhaEnderecos` (Task 2); o payload da Task 5.
- Produces: nada que outra tarefa consuma.

- [ ] **Step 1: Leia o componente inteiro antes de mexer**

Run: leia `components/upload-zone.tsx` (69 linhas). Ele é `"use client"`, tem um `<input type="file">`, lê o buffer, chama `lerPlanilha` e faz o `fetch` para `/api/analise`.

- [ ] **Step 2: Acrescente o segundo arquivo, opcional**

Mantenha o fluxo e a aparência atuais; acrescente:

- um estado para a planilha de endereços já lida: `const [enderecos, setEnderecos] = useState<EnderecoEstruturado[] | null>(null);` e `const [enderecosNome, setEnderecosNome] = useState<string | null>(null);`
- um segundo `<input type="file" accept=".xlsx,.csv">` com `<label>` associado por `id`/`htmlFor`, texto **"Relatório de endereços (opcional)"**, cujo handler lê o buffer, chama `lerPlanilhaEnderecos` e guarda o resultado — tratando `ColunaFaltanteError` com a mesma mensagem de erro que o primeiro já usa;
- uma linha de confirmação quando houver arquivo lido: `{enderecosNome && <p>…{enderecosNome} — {enderecos?.length} endereços</p>}`, nas classes Tailwind já usadas no arquivo;
- no `body` do `fetch`, os dois campos novos:

```ts
        body: JSON.stringify({
          arquivoNome: arquivo.name,
          contatos,
          ...(enderecos ? { enderecos, arquivoEnderecosNome: enderecosNome } : {}),
        }),
```

Regras: a planilha de endereços **nunca** é obrigatória — sem ela o botão de analisar funciona igual. Nada de `console.log` com conteúdo de planilha. Não mude o texto nem o comportamento do primeiro campo.

- [ ] **Step 3: Rode o build e o typecheck**

Run: `npm run typecheck && npm run build`
Expected: ambos limpos. Não há infraestrutura de teste de componente neste projeto — verifique lendo o JSX: sem a segunda planilha, o corpo enviado é byte a byte o de hoje.

- [ ] **Step 4: Rode a suíte**

Run: `npm test`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add components/upload-zone.tsx
git commit -m "feat: envio opcional da planilha de endereços

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Endereço em colunas separadas no export

**Files:**
- Modify: `lib/export.ts`
- Test: `tests/export.test.ts`

**Interfaces:**
- Consumes: `AuditoriaEndereco`, `rotuloAchadoEndereco` (Tasks 1 e 3).
- Produces: colunas novas na planilha baixada.

- [ ] **Step 1: Escreva os testes que falham**

Em `tests/export.test.ts`:

```ts
  test("endereço auditado sai em colunas separadas, com situação e achados", () => {
    const linha = resultadoParaLinhas(analiseCom({
      endereco: {
        situacao: "a_completar",
        achados: ["sem_bairro"],
        endereco: {
          contatoId: "7", logradouro: "Praça dos Três Poderes", numero: "S/N",
          cidade: "Brasília", uf: "DF", cep: "70160-900", prioritario: true,
        },
        formatado: "Praça dos Três Poderes, S/N\n70160-900 Brasília - DF",
        linhas: 1,
      },
    }))[0];
    expect(linha["Logradouro"]).toBe("Praça dos Três Poderes");
    expect(linha["Número"]).toBe("S/N");
    expect(linha["CEP"]).toBe("70160-900");
    expect(linha["UF"]).toBe("DF");
    expect(linha["Endereço (situação)"]).toBe("a completar");
    expect(linha["Endereço (achados)"]).toBe("sem bairro (sai do CEP)");
  });

  test("sem base de endereços, as colunas novas saem vazias e as antigas não mudam", () => {
    const linha = resultadoParaLinhas(analiseCom({ endereco: { situacao: "sem_base", achados: [] } }))[0];
    expect(linha["Logradouro"]).toBe("");
    expect(linha["Endereço (situação)"]).toBe("");
    expect(linha["Endereço (achados)"]).toBe("");
  });
```

Escreva o helper `analiseCom(over: Partial<ResultadoContato>): ResultadoAnalise` no topo do `describe`, montando um `ResultadoAnalise` mínimo com um grupo e um contato — siga o formato dos literais que já existem no arquivo, incluindo `enderecosAConfirmar: 0` no resumo.

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/export.test.ts`
Expected: FAIL — as colunas não existem.

- [ ] **Step 3: Implemente em `lib/export.ts`**

Acrescente, depois de `CAMPOS`:

```ts
/** Rótulo da situação de endereço na planilha. `sem_base` sai vazio: nada foi auditado. */
const SITUACAO_ENDERECO: Record<SituacaoEndereco, string> = {
  completo: "completo",
  a_completar: "a completar",
  pendente: "a confirmar",
  nao_verificado: "não verificado",
  sem_base: "",
};

/** Colunas do endereço estruturado, na ordem da planilha de origem. */
const COLUNAS_ENDERECO = [
  ["Logradouro", "logradouro"],
  ["Número", "numero"],
  ["Complemento", "complemento"],
  ["Bairro", "bairro"],
  ["CEP", "cep"],
  ["Cidade", "cidade"],
  ["UF", "uf"],
] as const;

function colunasDeEndereco(a: AuditoriaEndereco | undefined): Record<string, string> {
  const e = a?.endereco;
  const linha: Record<string, string> = {};
  for (const [rotulo, campo] of COLUNAS_ENDERECO) linha[rotulo] = e?.[campo] ?? "";
  linha["Endereço (situação)"] = a ? SITUACAO_ENDERECO[a.situacao] : "";
  linha["Endereço (achados)"] = (a?.achados ?? []).map(rotuloAchadoEndereco).join("; ");
  linha["Endereço (montado)"] = a?.formatado ?? "";
  return linha;
}
```

Importe `rotuloAchadoEndereco` de `@/lib/endereco` e os tipos `AuditoriaEndereco`, `SituacaoEndereco` de `@/lib/types`.

No laço dos contatos, **depois** da linha `linha["Coerência"] = …` (para não mudar a posição de nenhuma coluna existente):

```ts
      Object.assign(linha, colunasDeEndereco(c.endereco));
```

E no laço dos "novos", logo antes de `linhas.push(linha)`, para o cabeçalho ficar igual nas duas:

```ts
      Object.assign(linha, colunasDeEndereco(undefined));
```

- [ ] **Step 4: Rode e confirme que passa**

Run: `npx vitest run tests/export.test.ts`
Expected: PASS.

- [ ] **Step 5: Rode a suíte e o typecheck**

Run: `npm test && npm run typecheck`
Expected: verde.

- [ ] **Step 6: Teste do Review Focus 5 — nada muda sem a planilha**

```ts
  test("as colunas que já existiam mantêm nome e ordem com as novas no fim", () => {
    const linha = resultadoParaLinhas(analiseCom({ endereco: { situacao: "sem_base", achados: [] } }))[0];
    const chaves = Object.keys(linha);
    expect(chaves.slice(0, 6)).toEqual([
      "Grupo", "Status", "Divergencias", "Origem", "Fonte", "Observacao",
    ]);
    expect(chaves.indexOf("Coerência")).toBeLessThan(chaves.indexOf("Logradouro"));
  });
```

- [ ] **Step 7: Rode e confirme**

Run: `npx vitest run tests/export.test.ts && npm test`
Expected: PASS. Se a ordem das seis primeiras colunas no arquivo for outra, corrija o **teste** para a ordem real — o que importa é que as colunas antigas não mudem de nome nem venham depois das novas.

- [ ] **Step 8: Commit**

```bash
git add lib/export.ts tests/export.test.ts
git commit -m "feat: endereço em colunas separadas na planilha baixada

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Situação do endereço na tela

**Files:**
- Modify: `components/resultado-tabela.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `ResultadoContato.endereco`, `ResumoAnalise.enderecosAConfirmar`, `rotuloAchadoEndereco`.
- Produces: nada.

Esta tarefa é o mínimo honesto: põe a informação na tela sem redesenhar a tabela. O redesenho completo do mockup (etiquetas por campo, painel lateral) é plano próprio — ver o encerramento deste documento.

- [ ] **Step 1: Contador no resumo**

Em `app/page.tsx`, dentro do `<p>` do resumo, depois do trecho de `gruposViaPesquisaAmpla`:

```tsx
              {analise.resumo.enderecosAConfirmar > 0 && (
                <span className="text-amber-700">
                  {" "}· {analise.resumo.enderecosAConfirmar} endereço(s) a confirmar
                </span>
              )}
```

- [ ] **Step 2: Coluna de endereço na tabela**

Em `components/resultado-tabela.tsx`, acrescente `<th>Endereço</th>` depois de `<th>Cargo</th>` no cabeçalho, e na linha do contato, depois da célula do cargo:

```tsx
                  <td>
                    {c.endereco && c.endereco.situacao !== "sem_base" ? (
                      <span
                        className={
                          c.endereco.situacao === "pendente"
                            ? "text-amber-700"
                            : c.endereco.situacao === "completo"
                              ? "text-gray-600"
                              : "text-gray-700"
                        }
                        title={c.endereco.achados.map(rotuloAchadoEndereco).join("; ")}
                      >
                        {c.endereco.situacao === "completo"
                          ? "completo"
                          : c.endereco.situacao === "a_completar"
                            ? "a completar"
                            : c.endereco.situacao === "pendente"
                              ? "a confirmar"
                              : "não verificado"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
```

Na linha dos "novos", acrescente `<td>—</td>` na mesma posição, para as colunas não desalinharem.

Importe `rotuloAchadoEndereco` de `@/lib/endereco`. O componente continua Server Component: nada de `"use client"`, estado ou efeito.

- [ ] **Step 3: Rode tudo**

Run: `npm test && npm run typecheck && npm run build`
Expected: os três verdes.

- [ ] **Step 4: Confira lendo o JSX**

Sem planilha de endereços, `situacao` é `sem_base` em todos os contatos e a coluna mostra `—` em todas as linhas: nenhuma mudança de comportamento para quem não usa a segunda planilha.

- [ ] **Step 5: Commit**

```bash
git add components/resultado-tabela.tsx app/page.tsx
git commit -m "feat: situação do endereço na tabela e contador no resumo

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Verificação final

- [ ] `npm test` — suíte verde, com os três arquivos novos (`cep`, `planilha-enderecos`, `endereco`).
- [ ] `npm run typecheck` e `npm run build` — sem erro.
- [ ] `git log --oneline origin/main..HEAD` — um commit por tarefa, nenhum `.xlsx`, nenhum `CLAUDE.md`, nenhum arquivo do pnpm.
- [ ] Rodar com as duas planilhas reais de `Bases de comparação -PLANILHAS CONTATOS/` e conferir à mão: 414 contatos recebem endereço, ~30 saem como "a confirmar", os 22 de CEP quebrado aparecem com o achado certo, e nenhum contato muda de semáforo por causa de endereço.
- [ ] `CLAUDE.md`: acrescentar a linha do spec de 2026-10-01 na tabela de documentos de decisão e um princípio sobre a Camada D — **editar sem commitar**, porque o arquivo tem alteração não commitada do usuário.
