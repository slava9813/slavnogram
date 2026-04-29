import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slavnogram",
  description: "Local-first social network with public access through IP or tunnels.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
