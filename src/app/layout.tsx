import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

// Fonts come from the bundled `geist` package, so the build needs no network access to Google Fonts.

export const metadata: Metadata = {
  title: "Thai Talk Breaks",
  description: "Spoken-Thai Telegram learning product — application infrastructure.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
