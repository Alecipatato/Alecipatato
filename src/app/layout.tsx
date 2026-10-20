import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import { I18nProvider } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/config";
import { getLocale, getMessages } from "@/lib/i18n/server";
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

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages();
  return {
    title: { default: fmt(m.common.meta.title, { platform: PLATFORM_NAME }), template: `%s · ${PLATFORM_NAME}` },
    description: m.common.meta.description,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${geistSans.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
