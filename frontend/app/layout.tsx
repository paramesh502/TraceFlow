import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TraceFlow — Visualize DSA Code",
  description:
    "TraceFlow converts data-structure and algorithm code into interactive, step-by-step visual animations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
