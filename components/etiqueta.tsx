import type { Tom } from "@/lib/painel";

const CLASSES: Record<Tom, string> = {
  ok: "bg-ok-fundo text-ok",
  atencao: "bg-atencao-fundo text-atencao",
  ruim: "bg-ruim-fundo text-ruim",
  neutro: "bg-neutro-fundo text-cinza",
};

/** Etiqueta curta de estado (campo conferido, situação da linha). Só apresentação. */
/** `quebra`: deixa o texto longo quebrar linha em vez de invadir a coluna ao lado. */
export function Etiqueta({ texto, tom, explicacao, quebra = false }: { texto: string; tom: Tom; explicacao?: string; quebra?: boolean }) {
  return (
    <span
      title={explicacao}
      className={`${quebra ? "inline whitespace-normal" : "inline-block whitespace-nowrap"} cursor-default rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASSES[tom]}`}
    >
      {texto}
    </span>
  );
}
