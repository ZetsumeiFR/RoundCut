import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "../index.css";
import Header from "@/components/header";
import Providers from "@/components/providers";
import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/messages";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  description: "roundcut",
  title: "roundcut",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = getMessages(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <div className="grid h-svh grid-rows-[auto_1fr]">
            <Header menuMessages={messages.account.menu} />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
