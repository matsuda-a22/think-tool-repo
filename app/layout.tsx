import type { Metadata } from "next";
import { Geist, Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/store";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const notoSansJP = Noto_Sans_JP({ variable: "--font-noto-sans-jp", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "思考整理ツール",
  description: "頭の中の思考をスッキリ可視化するツール",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className={`${geist.variable} ${notoSansJP.variable} h-full overflow-hidden antialiased`}>
      <body className="h-full overflow-hidden flex flex-col bg-background text-foreground">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
