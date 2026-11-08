import { tratarLista } from "@/lib/convidados/tratar";
import { lerListaPadrao } from "@/lib/convidados/lista";
import { lerPlanilha } from "@/lib/planilha";
import { lerPlanilhaEnderecos } from "@/lib/planilha-enderecos";
import { montarBaseEnderecos, montarBaseGrupos, montarListaPadrao } from "./montar";

export const GRUPO = "Convidados do presidente eleito - Posse 2027";
const df = { BAIRRO: "Zona Cívico-Administrativa", CIDADE: "Brasília", UF: "DF" };
export const CASOS = [
  { NOME: "Ana Beatriz Exemplo Souza", TRATAMENTO: "Senhora", ENDERECAMENTO: "À Senhora", CARGO: "Diretora de Relações Institucionais", CEP: "70165900", LOGRADOURO: "Avenida das Nações", NUMERO: "120", COMPLEMENTO: "Sala 301", BAIRRO: "Asa Sul", CIDADE: "Brasília", UF: "DF" },
  { NOME: "Carlos Eduardo Fictício Ramos", TRATAMENTO: "Senhor", ENDERECAMENTO: "Ao Senhor", CARGO: "Presidente da Associação Exemplo", CEP: "70070600", LOGRADOURO: "Setor de Autarquias Sul Quadra 3 Bloco C Edifício Sede da Associação", NUMERO: "", COMPLEMENTO: "5º andar, Sala 512", BAIRRO: "Asa Sul", CIDADE: "Brasília", UF: "DF" },
  { NOME: "Fernanda Ilustrativa Castro", TRATAMENTO: "Senhora", ENDERECAMENTO: "À Senhora", CARGO: "Coordenadora Exemplo", CEP: "1310100", LOGRADOURO: "Avenida Paulista", NUMERO: "1578", COMPLEMENTO: "", BAIRRO: "Bela Vista", CIDADE: "São Paulo", UF: "SP" },
  { NOME: "Roberto Hipotético Lima", TRATAMENTO: "Senhor", ENDERECAMENTO: "Ao Senhor", CARGO: "", CEP: "71680360", LOGRADOURO: "Condomínio Exemplo Quadra 5", NUMERO: "Lote 12 Casa 3", COMPLEMENTO: "", BAIRRO: "Jardim Botânico", CIDADE: "Brasília", UF: "DF" },
  { NOME: "Maria Auxiliadora da Conceição Exemplo de Almeida Prado", TRATAMENTO: "Senhora", ENDERECAMENTO: "À Senhora", CARGO: "Secretária Executiva do Conselho Exemplo", CEP: "70040020", LOGRADOURO: "Esplanada dos Ministérios Bloco A", NUMERO: "", COMPLEMENTO: "Anexo, 2º andar", ...df },
  { NOME: "João Pedro Simulado Nogueira", TRATAMENTO: "Excelentíssimo Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor", CARGO: "Ministro de Estado da Pasta Exemplo", CEP: "70054900", LOGRADOURO: "Esplanada dos Ministérios Bloco E", NUMERO: "S/N", COMPLEMENTO: "Gabinete", ...df },
  { NOME: "Helena Modelo Barreto", TRATAMENTO: "Senhora", ENDERECAMENTO: "À Senhora", CARGO: "Assessora Especial", CEP: "70160900", LOGRADOURO: "Praça dos Três Poderes", NUMERO: "S/N", COMPLEMENTO: "Anexo 2, Ala A", ...df },
  { NOME: "Luciana Protótipo Andrade", TRATAMENTO: "Excelentíssimo Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor", CARGO: "Senadora", CEP: "70165900", LOGRADOURO: "Praça dos Três Poderes", NUMERO: "S/N", COMPLEMENTO: "Anexo 1, 9º andar", ...df },
  { NOME: "Paulo Amostra Teixeira", TRATAMENTO: "Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor", CARGO: "Deputado Federal", CEP: "70160900", LOGRADOURO: "Câmara dos Deputados, Edifício Anexo 4", NUMERO: "S/N", COMPLEMENTO: "Gabinete nº 999", BAIRRO: "Praça dos Três Poderes", CIDADE: "Brasília", UF: "DF" },
  { NOME: "Ana Beatriz Exemplo Souza", TRATAMENTO: "Senhora", ENDERECAMENTO: "À Senhora", CARGO: "Diretora de Relações Institucionais", CEP: "70165900", LOGRADOURO: "Avenida das Nações", NUMERO: "120", COMPLEMENTO: "Sala 301", BAIRRO: "Asa Sul", CIDADE: "Brasília", UF: "DF" },
  { NOME: "Marcos Genérico Vieira", TRATAMENTO: "Senhor", ENDERECAMENTO: "Ao Senhor", CARGO: "Prefeito do Município Exemplo", CEP: "ABC12345", LOGRADOURO: "Rua das Flores", NUMERO: "45", COMPLEMENTO: "", BAIRRO: "Centro", CIDADE: "Município Exemplo", UF: "BR" },
];
export const BASE = [
  { id: "12345", nome: "João Pedro Simulado Nogueira", grupo: "Ministros de Estado" },
  { id: "23456", nome: "Helena Modelo Barreto", grupo: GRUPO },
  { id: "34567", nome: "Marcos Vieira", grupo: "Prefeitos" },
];
export const ENDERECOS = [
  { contatoId: "12345", logradouro: "Esplanada dos Ministérios Bloco E", numero: "S/N", complemento: "Gabinete", bairro: "Zona Cívico-Administrativa", cidade: "Brasília", uf: "DF", cep: "70054900", prioritario: true },
  { contatoId: "23456" },
];
export const REFERENCIAS = { deputados: [{ uf: "DF", nomeParlamentar: "Paulo Amostra Teixeira", nomeCivil: "Paulo Amostra Teixeira" }], eleitos: [], governadores: [] };

export function rodadaDoExemplo() {
  return tratarLista({
    linhas: lerListaPadrao(montarListaPadrao(CASOS)),
    grupo: GRUPO,
    base: lerPlanilha(montarBaseGrupos(BASE)),
    enderecos: lerPlanilhaEnderecos(montarBaseEnderecos(ENDERECOS)),
    referencias: REFERENCIAS,
  });
}
