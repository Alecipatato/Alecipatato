"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/config";
import { formatPrice } from "@/lib/store-config";
import type { StoreProduct } from "@/lib/types";
import { BuyBox } from "./cart";

/**
 * Haut de la fiche produit « comme Amazon » : galerie (vignettes, zoom au survol, visionneuse),
 * titre, prix, choix de la variante, points forts et encadré d'achat. Le prix, l'image et le stock
 * suivent la variante choisie ; le paiement relit toujours ces valeurs en base.
 */
export function ProductView({
  storeId,
  storeName,
  currency,
  product,
  categoryHref,
  delivery,
  initialVariant,
}: {
  storeId: string;
  storeName: string;
  currency: string;
  product: StoreProduct;
  categoryHref: string | null;
  delivery: string;
  initialVariant: string | null;
}) {
  const { locale, m } = useI18n();
  const t = m.storefront;
  const variants = product.variants ?? [];
  const defaultVariant =
    variants.find((v) => v.vid === initialVariant && v.inStock) ??
    variants.find((v) => v.inStock && v.priceCents === product.priceCents) ??
    variants.find((v) => v.inStock) ??
    null;
  const [selectedVid, setSelectedVid] = useState<string | null>(defaultVariant?.vid ?? null);
  const selected = variants.find((v) => v.vid === selectedVid) ?? null;

  // Images : la photo de la variante choisie d'abord si elle n'est pas déjà dans la galerie.
  const images = product.images.length ? product.images : [];
  const [active, setActive] = useState(() => Math.max(0, selected?.image ? images.indexOf(selected.image) : 0));
  const [viewer, setViewer] = useState<number | null>(null);

  const priceCents = selected?.priceCents ?? product.priceCents;
  const inStock = selected ? selected.inStock : product.stock === null || product.stock > 0;
  const price = formatPrice(priceCents, currency, locale);

  function choose(vid: string) {
    setSelectedVid(vid);
    const image = variants.find((v) => v.vid === vid)?.image;
    if (image && images.includes(image)) setActive(images.indexOf(image));
    // Adresse partageable de la variante (sans recharger la page).
    const url = new URL(window.location.href);
    url.searchParams.set("v", vid);
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="mt-6 grid gap-10 lg:grid-cols-[1.15fr_1fr_300px]">
      <Gallery
        title={product.title}
        images={images}
        active={active}
        onActive={setActive}
        onOpen={(i) => setViewer(i)}
        initial={product.title.charAt(0)}
      />

      <div className="min-w-0">
        {product.category && categoryHref && (
          <Link href={categoryHref} className="text-sm font-medium text-[var(--store-primary)] hover:underline">
            {product.category}
          </Link>
        )}
        <h1 className="sf-heading mt-1 text-3xl leading-tight sm:text-4xl">{product.title}</h1>
        <p className="mt-4 text-3xl font-semibold tabular-nums text-[var(--store-price)]" data-product-price>{price}</p>
        {product.description && <p className="mt-4 leading-relaxed text-[var(--sf-muted)]">{product.description}</p>}

        {variants.length > 1 && (
          <fieldset className="mt-6 border-t border-[var(--sf-line)] pt-6">
            <legend className="text-sm font-semibold">
              {selected ? fmt(t.product.selected, { label: selected.label }) : t.product.option}
            </legend>
            <div className="mt-3 flex flex-wrap gap-2" data-variants>
              {variants.map((v) => (
                <button
                  key={v.vid}
                  type="button"
                  disabled={!v.inStock}
                  aria-pressed={v.vid === selectedVid}
                  onClick={() => choose(v.vid)}
                  data-variant={v.vid}
                  className="flex items-center gap-2 rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--store-bg)] px-2.5 py-1.5 text-sm transition hover:border-[var(--store-primary)] aria-pressed:border-[var(--store-primary)] aria-pressed:ring-2 aria-pressed:ring-[var(--store-primary)]/25 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {v.image && (
                    // eslint-disable-next-line @next/next/no-img-element -- images du fournisseur
                    <img src={v.image} alt="" className="h-9 w-9 rounded object-cover" loading="lazy" />
                  )}
                  <span className={v.inStock ? "" : "line-through"}>{v.label}</span>
                  {v.priceCents !== product.priceCents && <span className="text-xs tabular-nums text-[var(--sf-muted)]">{formatPrice(v.priceCents, currency, locale)}</span>}
                  {!v.inStock && <span className="text-xs">({t.product.soldOut})</span>}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {product.highlights.length > 0 && (
          <div className="mt-6 border-t border-[var(--sf-line)] pt-6">
            <h2 className="font-semibold">{t.aboutItem}</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
              {product.highlights.map((h) => <li key={h}>{h}</li>)}
            </ul>
          </div>
        )}
      </div>

      <aside className="h-fit rounded-[var(--sf-radius)] border border-[var(--sf-line)] p-5 lg:sticky lg:top-32">
        <p className="text-2xl font-semibold tabular-nums">{price}</p>
        {selected && <p className="mt-1 text-sm text-[var(--sf-muted)]">{selected.label}</p>}
        <p className="mt-2 flex items-center gap-2 text-sm font-medium">
          <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${inStock ? "bg-emerald-500" : "bg-red-500"}`} />
          {inStock ? t.inStock : t.outOfStock}
        </p>
        <p className="mt-1 text-sm text-[var(--sf-muted)]">{delivery}</p>
        <div className="mt-5">
          <BuyBox
            storeId={storeId}
            disabled={!inStock}
            product={{ id: product.id, title: product.title, priceCents, variantId: selected?.vid, variantLabel: selected?.label }}
          />
        </div>
        <p className="mt-4 text-xs text-[var(--sf-muted)]">{fmt(t.soldBy, { store: storeName })}</p>
      </aside>

      {viewer !== null && images.length > 0 && (
        <Viewer title={product.title} images={images} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}

function Gallery({
  title,
  images,
  active,
  onActive,
  onOpen,
  initial,
}: {
  title: string;
  images: string[];
  active: number;
  onActive: (i: number) => void;
  onOpen: (i: number) => void;
  initial: string;
}) {
  const t = useI18n().m.storefront.product;
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const src = images[active];

  if (!src) {
    return (
      <div aria-hidden className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-surface)]">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,var(--store-primary),var(--store-accent))] opacity-15" />
        <span className="sf-heading relative text-6xl text-[var(--store-primary)] opacity-70">{initial}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row" aria-label={t.gallery} role="group">
      {images.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto sm:max-h-[520px] sm:w-16 sm:flex-col sm:overflow-y-auto sm:overflow-x-visible">
          {images.map((img, i) => (
            <li key={img} className="shrink-0">
              <button
                type="button"
                onClick={() => onActive(i)}
                onMouseEnter={() => onActive(i)}
                aria-label={fmt(t.showImage, { n: i + 1 })}
                aria-current={i === active}
                className="block h-16 w-16 overflow-hidden rounded-[calc(var(--sf-radius)*0.6)] border border-[var(--sf-line)] aria-[current=true]:border-[var(--store-primary)] aria-[current=true]:ring-2 aria-[current=true]:ring-[var(--store-primary)]/30"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- images du fournisseur */}
                <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpen(active)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
          }}
          onMouseLeave={() => setZoom(null)}
          aria-label={fmt(t.enlarge, { n: active + 1 })}
          data-main-image
          className="relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-white"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- images du fournisseur */}
          <img src={src} alt={title} className="h-full w-full object-contain" />
          {zoom && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 hidden bg-no-repeat sm:block"
              style={{ backgroundImage: `url("${src}")`, backgroundSize: "220%", backgroundPosition: `${zoom.x}% ${zoom.y}%`, backgroundColor: "white" }}
            />
          )}
        </button>
        <p className="mt-2 text-center text-xs text-[var(--sf-muted)]">{t.zoomHint}</p>
      </div>
    </div>
  );
}

/** Visionneuse plein écran : flèches, Échap pour fermer. */
function Viewer({ title, images, index, onIndex, onClose }: { title: string; images: string[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const t = useI18n().m.storefront.product;
  const go = (delta: number) => onIndex((index + delta + images.length) % images.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((index + 1) % images.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [index, images.length, onClose, onIndex]);

  return (
    <div role="dialog" aria-modal="true" aria-label={title} data-viewer className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4 text-white">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm tabular-nums">{fmt(t.imageOf, { n: index + 1, total: images.length })}</p>
        <button type="button" onClick={onClose} autoFocus className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25">
          {t.close} ✕
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center py-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- images du fournisseur */}
        <img src={images[index]} alt={`${title} — ${fmt(t.imageOf, { n: index + 1, total: images.length })}`} className="max-h-full max-w-full object-contain" />
        {images.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label={t.previous} className="absolute left-0 grid h-12 w-12 place-items-center rounded-full bg-white/15 text-2xl hover:bg-white/25">‹</button>
            <button type="button" onClick={() => go(1)} aria-label={t.next} className="absolute right-0 grid h-12 w-12 place-items-center rounded-full bg-white/15 text-2xl hover:bg-white/25">›</button>
          </>
        )}
      </div>
    </div>
  );
}
