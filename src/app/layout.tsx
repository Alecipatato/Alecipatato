import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import { PLATFORM_NAME } from "@/lib/platform";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: `${PLATFORM_NAME} — Votre boutique en ligne créée par l'IA`, template: `%s · ${PLATFORM_NAME}` },
  description: "Créez gratuitement une boutique de dropshipping complète grâce à l'IA. Vous payez seulement une commission sur vos ventes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
