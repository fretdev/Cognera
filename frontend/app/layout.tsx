import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Load Inter with the full weight range so headings, body, and captions
// all have proper typographic hierarchy without pulling in extra fonts.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Cognera", template: "%s | Cognera" },
  description: "Your AI-powered study companion. Upload your course materials and get instant, grounded answers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
