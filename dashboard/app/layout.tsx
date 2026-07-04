import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TCB Sales System",
  description: "The Credit Brothers — sales reporting and operations",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // theme is read from a cookie so SSR renders the chosen theme with no flash
  const theme = (await cookies()).get("tcb_theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang="en" data-theme={theme}>
      <body className={`${geist.className} antialiased`}>{children}</body>
    </html>
  );
}
