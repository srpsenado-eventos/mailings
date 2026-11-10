# Tela do PRODASEN, bloco do endereço: ajuste do Número acima de 6

Data: 2026-10-06. Adendo ao spec `2026-10-05-eleitos-2026-e-ajustes-prodasen-design.md`, §6.2, que ele **substitui** no formato dos arquivos. O §6.1 (cadastro em lote) continua valendo e fica para depois.

## 1. O que motivou

Em 05/10/2026 o Clovis rodou o script `GT Posse/Contatos/_script/numero_mais_de_6.py` sobre a base de endereços do dia e obteve **129 endereços** com Número acima de 6 caracteres (128 contatos). O painel mostrava **101**. As duas bases (a do script e a da varredura) são idênticas no campo Número; a diferença é de universo:

| | Script | Painel |
|---|---|---|
| Unidade | endereço (`Endereço Id`) | contato da Posse |
| Universo | a base de endereços inteira | os contatos da planilha de grupos da Posse |
| Endereço olhado | todos | só o escolhido (prioritário) |

Das 28 linhas que o painel não mostra, 26 são de contatos fora dos grupos da Posse e 2 são endereços não prioritários de contatos que estão no painel. Para a carga do PRODASEN vale o universo do script: a carga é por `Endereço Id`, sobre a base inteira.

## 2. Decisões (Clovis, 2026-10-06)

1. **Painel**: o filtro "Número acima de 6" continua contando os contatos da Posse. Ao lado aparece o total da base inteira e quantos ficam fora do painel, separados em "fora da Posse" e "endereço não prioritário".
2. **Onde gerar**: tela local `/prodasen`, com link no cabeçalho do painel local. Em modo web, 404, como `/nova-varredura`. Agora entra só o bloco do endereço.
3. **Só o que passa de 6.** Número que já cabe e foge do padrão ("Lote 1") não entra. A saída do app tem de bater com a do script: na base de 05/10, 129 linhas de 128 contatos, com os mesmos propostos por `Endereço Id`.

## 3. Dados

A base de endereços passa a ser guardada **inteira e como foi lida** no retrato local, em `baseEnderecos: { cabecalho: string[]; linhas: (string | number | null)[][] }`: todas as colunas, na ordem e com o tipo da planilha (Ids e CEP numéricos, a primeira coluna de HTML da exportação incluída), descartadas só as linhas sem nenhum valor da segunda coluna em diante. É o que permite gerar a carga idêntica à base, com só o Número trocado.

O retrato também ganha `numeroNaBase` (só contagens, sem dado pessoal): endereços na base, endereços acima de 6, contatos distintos afetados, e quantos dos acima de 6 o painel não mostra (`foraDaPosse`, `naoPrioritarios`). Calculado em `montarRetrato`.

O retrato publicado (`lib/publicar.ts`) vai **sem** `baseEnderecos` e **com** `numeroNaBase`. A resposta de `/api/analise` também volta sem `baseEnderecos`.

## 4. Regra da proposta (`lib/ajuste-numero.ts`)

Porte literal de `propor()` do script de 05/10, a regra validada em 23/09 mais o Bloco:

1. O valor inteiro tem de ser `Lote`/`Lotes`/`Casa`/`Chácara` (com ou sem acento)/`Bloco` seguido do resto; sem isso, não há proposta.
2. Sigla: Lote → `LT`, Casa → `CS`, Chácara → `CH`, Bloco → `BL`. No resto, vírgula ou barra (com espaços em volta) vira `/`. Proposta: `<sigla> <resto>`.
3. Se passar de 6: tira zeros à esquerda de cada parte separada por `/` (`05/06` → `5/6`).
4. Se ainda passar de 6: tira o espaço (`LT 9/10` → `LT9/10`).
5. Bloco leva a observação "Valor novo desde 23/09: Bloco não é número; conferir se BL A é aceito ou se vira S/N".

Comprimento do Número: o valor como texto, sem espaços nas pontas (`texto()` do script).

## 5. Arquivos

Sufixo `<DD><MÊS><AAAA>` da data da varredura em Brasília (`05OUT2026`).

**`BASE DE ENDERECO - <sufixo> - carga PRODASEN.xlsx`**: aba `Folha1`, o cabeçalho e todas as linhas de `baseEnderecos`, na ordem, com só a coluna `Numero` trocada pela proposta nos endereços ajustados.

**`Numero mais de 6 caracteres - ajustes <sufixo>.xlsx`**, como o do script:
- `Resumo`: título com a data, fonte (nome da planilha), endereços na base, endereços acima de 6, contatos afetados, valores distintos a trocar, propostos que ainda passam de 6, casos sem proposta, e a regra impressa.
- `Ajustes`: `Contato Id`, `Endereço Id`, `Tratamento`, `Nome`, `Logradouro`, `Número ATUAL`, `Caracteres (atual)`, `Número PROPOSTO`, `Caracteres (proposto)`, `Observação`, `Complemento`, `Bairro`, `Cidade`, `UF`, `CEP`, mais `Grupo na Posse` (apoio: grupos do contato no retrato, separados por "; ", vazio se fora da Posse). Ordem: nome em minúsculas.
- `De-Para`: `Número ATUAL`, `Número PROPOSTO`, `Qtd de endereços`, ordenado pelo atual.
- `Sem proposta`: `Contato Id`, `Endereço Id`, `Nome`, `Número ATUAL`, os casos acima de 6 que a regra não resolve (só cabeçalho se não houver).

Diferença deliberada do script: contagens e caracteres saem como **valores**, não fórmulas (o SheetJS não grava valor calculado).

Os dois arquivos são gerados no navegador, a partir do retrato, só no modo local. Nada vai para log, serviço externo ou IA.

## 6. Validação

Antes do PR, um script local (fora do repositório, porque lê dados pessoais) gera os dois arquivos pelo código do app a partir da base de 05/10 e compara com os do script: mesmas 129 linhas de ajuste, mesmos propostos por `Endereço Id`, carga idêntica célula a célula. Divergência é investigada, não ajustada no teste.
