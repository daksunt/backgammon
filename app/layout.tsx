import type { Metadata } from "next";
import "./globals.css";

const title = "Backgammon Studio — Classic strategy, your rules";
const description = "A refined single-player backgammon game with adaptive AI, custom dice, deterministic rolls, and undo.";

export const metadata: Metadata = {
  metadataBase: new URL("https://daksunt.github.io/backgammon/"),
  title,
  description,
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title, description, images: [{ url: "og.png", width: 1200, height: 630, alt: "Backgammon Studio game table" }] },
  twitter: { card: "summary_large_image", title, description, images: ["og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
