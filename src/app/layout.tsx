import type { Metadata } from "next";
import { Inter, Source_Serif_4, JetBrains_Mono, Poppins } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AppFooter } from "@/components/layout/AppFooter";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Poppins - rounded geometric sans, similar to Google Sans for Gemini
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "HistoryRank",
  description: "Comparing historical importance across academic rankings, Wikipedia attention, and AI assessments",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} ${poppins.variable} antialiased hr-texture-fade`}
      >
        <NuqsAdapter>
          {children}
          <AppFooter />
        </NuqsAdapter>
      </body>
    </html>
  );
}
