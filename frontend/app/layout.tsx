import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Haggle — AI negotiation, settled with PayPal",
    template: "%s · Haggle",
  },
  description:
    "One buyer agent negotiates with every seller at once, then settles the best deal through PayPal.",
  applicationName: "Haggle",
};

export const viewport: Viewport = {
  themeColor: "#08080c",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-dvh antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
