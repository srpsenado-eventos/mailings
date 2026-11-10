export interface RegraEmTexto {
  titulo: string;
  texto: string;
}

/** Regras em linguagem do GT, na ordem em que são aplicadas; alimentam a aba Regras do arquivo de conferência. */
export const REGRAS_TEXTO: readonly RegraEmTexto[] = [
  {
    titulo: "Limites dos Correios",
    texto:
      "A etiqueta sai do Contatos e segue o leiaute dos Correios: Nome 50, Logradouro 50, Número 6, Complemento 30, Bairro 30, Cidade 30, UF 2 e CEP 8 caracteres. O valor recebido nunca se perde: fica na coluna RECEBIDO.",
  },
  {
    titulo: "Logradouro acima de 50",
    texto:
      "Abreviações aplicadas só até caber, na ordem: expressões compostas do DF (SAS, SAFS, SES, SHS, SCN, SCS, SBN, SBS), depois Quadra, Bloco, Conjunto, Lote, Edifício, Avenida e demais palavras, sem ponto. O pedaço de andar fica só no Complemento. O que ainda não couber vai para 'Trecho que não coube' e a linha fica em REVISAR; nenhum trecho é descartado em silêncio.",
  },
  {
    titulo: "Complemento acima de 30",
    texto:
      "Abreviação em dois níveis, só até caber: primeiro as palavras do logradouro (Lt, Bl, Ed, Gab, Pav), depois Sala = Sl, andar = And e Térreo = Ter, sem 'de/do/da'. O que não couber vai para 'Trecho que não coube' e a linha fica em REVISAR.",
  },
  {
    titulo: "Número vazio",
    texto:
      "Em endereço do DF (UF = DF, ou UF vazia com cidade Brasília), Número vazio vira S/N. Se o Logradouro traz Lote, Casa ou Chácara seguidos de número ou de letra isolada (Lote 12, Casa B), cada trecho vai ao Complemento abreviado; seguidos de nome (Casa Civil, Chácara Santa Luzia), ficam no Logradouro. Fora do DF, S/N só quando o logradouro já traz 'S/N' ou 'sem número'; senão a linha fica em REVISAR (número não informado).",
  },
  {
    titulo: "Número acima de 6 (regra A)",
    texto:
      "Número com mais de 6 caracteres e com Lote, Casa, Chácara ou Bloco: o Número vira S/N e o trecho vai ao Complemento abreviado (Lt, Cs, Ch, Bl), respeitando o limite de 30. Sem marca conhecida, a linha fica em REVISAR.",
  },
  {
    titulo: "CEP com 7 dígitos",
    texto:
      "Pontos e traços são removidos. CEP de 7 dígitos em São Paulo recebe zero à esquerda e fica em VALIDAR (confirmar nos Correios). Nas demais UFs, fica em REVISAR.",
  },
  {
    titulo: "CEP com letras, UF inexistente, campo obrigatório vazio",
    texto:
      "CEP com letras, de tamanho diferente de 8 ou fora da faixa da UF fica em REVISAR, com o valor como veio; a ferramenta não troca a UF nem o CEP. UF fora das 27 do país, Cidade ou Bairro vazios também ficam em REVISAR.",
  },
  {
    titulo: "Nome acima de 50",
    texto:
      "A ferramenta nunca corta nome sozinha. Nome com mais de 50 caracteres fica como veio, em REVISAR, com uma sugestão mais curta (patente abreviada, depois sem os nomes do meio) e a contagem de caracteres. Caixa alta integral vira iniciais maiúsculas, marcada como alterada.",
  },
  {
    titulo: "Título no nome",
    texto:
      "Dr., Dra., Exmo., Sr., Sra. e SE Sr. no início do nome saem (alterado), também quando vêm seguidos (Exma. Sra.). Patente e cargo (General, Senador, Ministro) ficam: fazem parte do nome pelas regras do GT.",
  },
  {
    titulo: "Tratamento e Endereçamento",
    texto:
      "São obrigatórios em toda linha e nunca são alterados pela ferramenta. Quando o cargo tem regra na tabela de tratamentos v02, os dois valores são conferidos; divergência fica em REVISAR, com a forma da tabela no gênero da pessoa como sugestão. Gênero incoerente entre tratamento, endereçamento e cargo também é apontado. Linha nova com um dos dois vazios fica fora do arquivo até ser preenchida.",
  },
  {
    titulo: "Duplicidade",
    texto:
      "Comparada só com a BASE GRUPOS POSSE, os grupos que serão convidados. Nome igual a um contato da base: 'Já no Contatos' (no grupo escolhido ou em outro grupo), com Id e grupo, e a linha não entra no arquivo. Nome parcial: 'Conferir duplicidade'; a linha entra no arquivo e o GT decide. Para quem já está cadastrado, o endereço recebido é comparado com o da BASE ENDERECO.",
  },
  {
    titulo: "Referência Câmara / TSE",
    texto:
      "Só informativa: indica se o nome consta na lista de deputados em exercício da Câmara ou entre os eleitos de 2026 (senadores, deputados federais e governadores). Não altera nenhum valor nem a situação da linha.",
  },
  {
    titulo: "Repetida na própria lista",
    texto:
      "Mesmo nome em mais de uma linha: só a primeira entra no arquivo; as demais saem como 'Repetida na própria lista', com a indicação da linha que vale e, se o endereço difere, os dois endereços.",
  },
];
