import type { Tom } from "@/lib/painel";

const CLASSES: Record<Tom, string> = {
  ok: "bg-ok-fundo text-ok",
  atencao: "bg-atencao-fundo text-atencao",
  ruim: "bg-ruim-fundo text-ruim",
  neutro: "bg-neutro-fundo text-cinza",
};

/** Etiqueta curta de estado (campo conferido, situação da linha). Só apresentação. */
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
