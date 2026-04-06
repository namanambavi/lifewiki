import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "lifewiki",
  description: "lifewiki — your life, as a Wikipedia. mylife.wiki",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
