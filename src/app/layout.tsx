import type { Metadata } from "next";
import WikiHeader from "@/components/WikiHeader";
import WikiTabs from "@/components/WikiTabs";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "WikiPeople",
  description: "Your own Wikipedia, generated from LinkedIn",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WikiHeader encyclopediaName="WikiPeople" />
        <WikiTabs />
        <main>{children}</main>
      </body>
    </html>
  );
}
