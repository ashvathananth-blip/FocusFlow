import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
const inter = Inter({ subsets: ["latin"] });
export const metadata: Metadata = { title: "Focus Flow", description: "Private visual-attention tracking and study history" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className={inter.className}><AppShell>{children}</AppShell></body></html>;
}
