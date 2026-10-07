"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { formatPrice } from "@/lib/store-config";

/**
 * Panier enregistré dans le navigateur de l'acheteur (un panier par boutique).
 * Le paiement (phase 5) recalculera toujours les prix côté serveur.
 */

interface CartItem {
  id: string;
  title: string;
  priceCents: number;
  quantity: number;
}

const EVENT = "store-cart-change";
const storageKey = (storeId: string) => `cart:${storeId}`;

function readRaw(storeId: string): string {
  try {
    return localStorage.getItem(storageKey(storeId)) ?? "[]";
  } catch {
    return "[]";
  }
}

function parse(raw: string): CartItem[] {
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (i): i is CartItem =>
        typeof i?.id === "string" && typeof i?.title === "string" &&
        Number.isInteger(i?.priceCents) && Number.isInteger(i?.quantity) && i.quantity > 0,
    );
  } catch {
    return [];
  }
}

function save(storeId: string, items: CartItem[]) {
  try {
    localStorage.setItem(storageKey(storeId), JSON.stringify(items));
  } catch {
    // Stockage indisponible (navigation privée stricte) : le panier reste vide.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function useCart(storeId: string) {
  const raw = useSyncExternalStore(subscribe, () => readRaw(storeId), () => "[]");
  const items = useMemo(() => parse(raw), [raw]);

  return {
    items,
    count: items.reduce((n, i) => n + i.quantity, 0),
    subtotalCents: items.reduce((n, i) => n + i.priceCents * i.quantity, 0),
    add(item: Omit<CartItem, "quantity">, quantity = 1) {
      const current = parse(readRaw(storeId));
      const existing = current.find((i) => i.id === item.id);
      if (existing) existing.quantity = Math.min(existing.quantity + quantity, 20);
      else current.push({ ...item, quantity });
      save(storeId, current);
    },
    setQuantity(id: string, quantity: number) {
      const current = parse(readRaw(storeId));
      save(storeId, quantity <= 0 ? current.filter((i) => i.id !== id) : current.map((i) => (i.id === id ? { ...i, quantity } : i)));
    },
  };
}

function CartIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.5" cy="19.5" r="1.3" />
      <circle cx="17" cy="19.5" r="1.3" />
    </svg>
  );
}

export function CartLink({ storeId, href }: { storeId: string; href: string }) {
  const { count } = useCart(storeId);
  return (
    <Link href={href} className="relative inline-flex items-center gap-2 px-1 py-1 text-sm font-medium" aria-label={`Panier, ${count} article${count > 1 ? "s" : ""}`}>
      <CartIcon />
      <span className="hidden sm:inline">Panier</span>
      {count > 0 && (
        <span className="absolute -top-1 left-4 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--store-accent)] px-1 text-[11px] font-bold text-[var(--store-on-accent)]">
          {count}
        </span>
      )}
    </Link>
  );
}

type ProductRef = { id: string; title: string; priceCents: number };

export function AddToCartButton({ storeId, product, compact = false }: { storeId: string; product: ProductRef; compact?: boolean }) {
  const { add } = useCart(storeId);
  const [added, setAdded] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        add(product);
        setAdded(true);
        setTimeout(() => setAdded(false), 1600);
      }}
      className={`sf-btn ${compact ? "px-3 py-2 text-xs" : "w-full px-6 py-3 text-sm"}`}
    >
      {added ? "Ajouté ✓" : "Ajouter au panier"}
    </button>
  );
}

export function BuyBox({ storeId, product }: { storeId: string; product: ProductRef }) {
  const { add } = useCart(storeId);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-3 text-sm">
        Quantité
        <select
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          className="rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--store-bg)] px-3 py-2"
        >
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => {
          add(product, quantity);
          setAdded(true);
          setTimeout(() => setAdded(false), 1800);
        }}
        className="sf-btn w-full px-6 py-3.5 text-sm"
      >
        {added ? "Ajouté au panier ✓" : "Ajouter au panier"}
      </button>
    </div>
  );
}

export function CartView({ storeId, currency, base }: { storeId: string; currency: string; base: string }) {
  const { items, subtotalCents, setQuantity } = useCart(storeId);

  if (items.length === 0) {
    return (
      <div className="rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-surface)] px-6 py-16 text-center">
        <p className="sf-heading text-2xl">Votre panier est vide</p>
        <p className="mt-2 text-[var(--sf-muted)]">Parcourez nos produits pour trouver votre bonheur.</p>
        <Link href={base || "/"} className="sf-btn mt-6 px-6 py-3 text-sm">Voir les produits</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <ul className="divide-y divide-[var(--sf-line)] border-y border-[var(--sf-line)]">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-4 py-5">
            <div className="min-w-0 flex-1">
              <Link href={`${base}/produit/${item.id}`} className="font-medium hover:underline">{item.title}</Link>
              <p className="mt-1 text-sm text-[var(--sf-muted)]">{formatPrice(item.priceCents, currency)} l&apos;unité</p>
            </div>
            <select
              aria-label={`Quantité pour ${item.title}`}
              value={item.quantity}
              onChange={(e) => setQuantity(item.id, Number(e.target.value))}
              className="rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--store-bg)] px-3 py-2 text-sm"
            >
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="w-24 text-right font-semibold tabular-nums">{formatPrice(item.priceCents * item.quantity, currency)}</span>
            <button type="button" onClick={() => setQuantity(item.id, 0)} className="text-sm text-[var(--sf-muted)] underline hover:text-[var(--store-text)]">
              Retirer
            </button>
          </li>
        ))}
      </ul>
      <aside className="h-fit rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-surface)] p-6">
        <div className="flex justify-between text-sm">
          <span>Sous-total</span>
          <span className="font-semibold tabular-nums">{formatPrice(subtotalCents, currency)}</span>
        </div>
        <p className="mt-1 text-xs text-[var(--sf-muted)]">Livraison et taxes calculées à l&apos;étape du paiement.</p>
        <button type="button" disabled className="sf-btn mt-5 w-full px-6 py-3 text-sm">Passer à la caisse</button>
        <p className="mt-3 text-center text-xs text-[var(--sf-muted)]">Le paiement en ligne sera bientôt disponible.</p>
      </aside>
    </div>
  );
}
