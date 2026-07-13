import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });
// exposed as a CSS variable so globals.css can use it for numeric text (.num)
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "TCB Sales System",
  description: "The Credit Brothers — sales reporting and operations",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // theme is read from a cookie so SSR renders the chosen theme with no flash
  const theme = (await cookies()).get("tcb_theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang="en" data-theme={theme}>
      <body className={`${geist.className} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
