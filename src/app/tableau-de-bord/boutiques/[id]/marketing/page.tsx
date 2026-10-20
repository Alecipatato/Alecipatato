import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { MarketingContent } from "@/lib/ai/marketing";
import { requireUser } from "@/lib/auth";
import { fmt, intlLocale } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { parsePixels, parseSeo, SEO_DESCRIPTION_MAX, truncate } from "@/lib/marketing/settings";
import { parseStoreConfig } from "@/lib/store-config";
import { createUserClient } from "@/lib/supabase/server";
import { publicStoreUrl } from "@/lib/tenant";
import { ApplySeoButton, CopyButton, GenerateForm, PixelsForm, SeoForm } from "./client";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).marketingTools.title };
}

/** Marketing d'une boutique : SEO, pixels publicitaires, contenus générés par l'IA. */
export default async function MarketingPage({ params }: PageProps<"/tableau-de-bord/boutiques/[id]/marketing">) {
  const user = await requireUser();
  const { id } = await params;
  const supabase = await createUserClient();
  const { data: store } = await supabase.from("stores").select("id, name, subdomain, custom_domain, status, config, seo, pixels").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!store) notFound();
  const [{ data: products }, { data: assets }] = await Promise.all([
    supabase.from("products").select("id, title").eq("store_id", store.id).eq("status", "active").order("position"),
    supabase.from("marketing_assets").select("id, content, created_at, products(title)").eq("store_id", store.id).order("created_at", { ascending: false }).limit(10),
  ]);
  const locale = await getLocale();
  const m = await getMessages(locale);
  const t = m.marketingTools;
  const config = parseStoreConfig(store.config);
  const url = publicStoreUrl({ subdomain: store.subdomain, customDomain: store.custom_domain });
  const defaults = {
    title: [store.name, config.content.tagline].filter(Boolean).join(" — "),
    description: truncate(config.content.hero.subtitle || config.content.tagline || store.name, SEO_DESCRIPTION_MAX),
  };
  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const suspended = store.status === "suspended";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={`/tableau-de-bord/boutiques/${store.id}`} className="text-sm font-medium text-muted hover:text-ink">← {store.name}</Link>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-muted">{t.intro}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="font-display text-xl font-bold">{t.seo.title}</h2>
          <p className="mt-1 text-sm text-muted">{t.seo.intro}</p>
          <div className="mt-5"><SeoForm storeId={store.id} seo={parseSeo(store.seo)} defaults={defaults} url={url} /></div>
          <p className="mt-4 text-xs text-muted">{fmt(t.seo.sitemap, { url: `${url}/sitemap.xml` })}</p>
        </section>
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="font-display text-xl font-bold">{t.pixels.title}</h2>
          <p className="mt-1 text-sm text-muted">{t.pixels.intro}</p>
          <div className="mt-5"><PixelsForm storeId={store.id} pixels={parsePixels(store.pixels)} /></div>
        </section>
      </div>

      <section className="rounded-2xl border border-line bg-white p-6">
        <h2 className="font-display text-xl font-bold">{t.ai.title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">{t.ai.intro}</p>
        {!suspended && <div className="mt-5"><GenerateForm storeId={store.id} products={products ?? []} /></div>}
      </section>

      <section>
        <h2 className="mb-4 font-display text-2xl font-bold">{t.ai.history}</h2>
        {!assets || assets.length === 0 ? (
          <p className="text-sm text-muted">{t.ai.empty}</p>
        ) : (
          <div className="flex flex-col gap-6">
            {assets.map((asset) => {
              const c = asset.content as MarketingContent;
              const productTitle = (asset.products as unknown as { title: string } | null)?.title;
              return (
                <article key={asset.id} className="rounded-2xl border border-line bg-white p-6" data-marketing-asset>
                  <p className="text-sm text-muted">{dateFormat.format(new Date(asset.created_at))} · {fmt(t.ai.for, { name: productTitle ?? t.ai.wholeStore })}</p>

                  <h3 className="mt-4 font-semibold">{t.ai.scripts}</h3>
                  <div className="mt-3 grid gap-4 lg:grid-cols-2">
                    {c.tiktokScripts.map((s, i) => {
                      const full = [s.title, `${t.ai.hook} : ${s.hook}`, ...s.scenes.map((sc, n) => `${fmt(t.ai.scene, { n: n + 1 })} — ${t.ai.film} : ${sc.visual} / ${t.ai.voiceover} : ${sc.voiceover}`), `${t.ai.onScreen} : ${s.onScreenText.join(" | ")}`, `${t.ai.caption} : ${s.caption} ${s.hashtags.join(" ")}`].join("\n");
                      return (
                        <div key={i} className="rounded-xl border border-line bg-paper p-4 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-semibold">{s.title}</p>
                            <CopyButton text={full} />
                          </div>
                          <p className="mt-2"><span className="font-medium">{t.ai.hook} :</span> {s.hook}</p>
                          <ol className="mt-2 space-y-1.5">
                            {s.scenes.map((sc, n) => (
                              <li key={n}><span className="font-medium">{fmt(t.ai.scene, { n: n + 1 })} —</span> {sc.visual} <span className="text-muted">« {sc.voiceover} »</span></li>
                            ))}
                          </ol>
                          {s.onScreenText.length > 0 && <p className="mt-2 text-muted">{t.ai.onScreen} : {s.onScreenText.join(" · ")}</p>}
                          <p className="mt-2">{t.ai.caption} : {s.caption} <span className="text-brand">{s.hashtags.join(" ")}</span></p>
                        </div>
                      );
                    })}
                  </div>

                  <h3 className="mt-6 font-semibold">{t.ai.ads}</h3>
                  <div className="mt-3 grid gap-4 lg:grid-cols-3">
                    {c.adCopies.map((ad, i) => (
                      <div key={i} className="rounded-xl border border-line bg-paper p-4 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{ad.platform === "tiktok" ? "TikTok" : "Meta"}</p>
                          <CopyButton text={`${ad.primaryText}\n\n${ad.headline}\n${ad.description}`} />
                        </div>
                        <p className="mt-2 whitespace-pre-line">{ad.primaryText}</p>
                        <p className="mt-2 font-semibold">{ad.headline}</p>
                        <p className="text-muted">{ad.description}</p>
                      </div>
                    ))}
                  </div>

                  {c.seo?.title && (
                    <div className="mt-6 rounded-xl border border-line p-4 text-sm">
                      <p className="font-semibold">{t.ai.seoSuggestion}</p>
                      <p className="mt-1 text-[#1a0dab]">{c.seo.title}</p>
                      <p className="text-[#4d5156]">{c.seo.description}</p>
                      {!suspended && <div className="mt-3"><ApplySeoButton storeId={store.id} seo={c.seo} /></div>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
