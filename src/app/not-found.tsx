import { getMessages } from "@/lib/i18n/server";

export default async function NotFound() {
  const m = await getMessages();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-3xl font-semibold">{m.common.notFound.title}</h1>
      <p className="opacity-70">{m.common.notFound.body}</p>
    </main>
  );
}
