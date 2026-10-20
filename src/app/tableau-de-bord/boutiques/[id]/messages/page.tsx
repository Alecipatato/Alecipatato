import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { fmt, intlLocale } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { createUserClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).emails.inbox.title };
}

/** Messages envoyés par les acheteurs depuis la page « Nous joindre » de la boutique. */
export default async function StoreMessagesPage({ params }: PageProps<"/tableau-de-bord/boutiques/[id]/messages">) {
  const user = await requireUser();
  const { id } = await params;
  const supabase = await createUserClient();
  const { data: store } = await supabase.from("stores").select("id, name").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!store) notFound();
  const { data: messages } = await supabase.from("contact_messages").select("id, name, email, order_number, message, created_at").eq("store_id", store.id).order("created_at", { ascending: false }).limit(100);
  const locale = await getLocale();
  const t = (await getMessages(locale)).emails.inbox;
  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={`/tableau-de-bord/boutiques/${store.id}`} className="text-sm font-medium text-muted hover:text-ink">← {store.name}</Link>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 max-w-2xl text-muted">{t.intro}</p>
      </div>
      {messages && messages.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {messages.map((msg) => (
            <li key={msg.id} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{msg.name} <span className="font-normal text-muted">· {msg.email}</span></p>
                <p className="text-sm text-muted">{dateFormat.format(new Date(msg.created_at))}</p>
              </div>
              {msg.order_number && <p className="mt-1 text-sm text-muted">{fmt(t.order, { number: msg.order_number })}</p>}
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{msg.message}</p>
              <a href={`mailto:${msg.email}?subject=${encodeURIComponent(store.name)}`} className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">{t.reply}</a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center text-muted">{t.empty}</div>
      )}
    </div>
  );
}
