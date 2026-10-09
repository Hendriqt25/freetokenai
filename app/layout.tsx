import type { Metadata } from "next";
import Script from "next/script";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "FreeTokenAI",
  description: "Dashboard Token AI pelanggan RestoAI (Chat, Image, Video, Developer API).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: className "dark" ditambahkan oleh script di bawah
    // sebelum React hydrate, jadi mismatch di elemen <html> ini memang diharapkan
    // (lihat next-themes docs untuk pola yang sama).
    <html lang="id" className={dmSans.variable} suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          // Set the theme class before paint to avoid a light/dark flash.
        >{`try{if(localStorage.getItem('theme')==='dark'||(!('theme' in localStorage)&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`}</Script>
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
