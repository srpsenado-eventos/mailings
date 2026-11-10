import { notFound } from "next/navigation";
import { EntrarForm } from "@/components/entrar-form";
import { modoDoApp } from "@/lib/modo";

export const dynamic = "force-dynamic";

export default function EntrarPage() {
  if (modoDoApp() !== "web") notFound();
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-serif text-3xl font-semibold">Fiscal de Mailings</h1>
      <p className="mt-2 text-sm text-cinza">Painel do GT Gestão de Convidados. Informe a senha para ver a última varredura publicada.</p>
      <EntrarForm />
    </main>
  );
}
