import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"], variable: "--font-display",
  weight: ["400", "500", "600", "700", "800"], display: "swap",
});
const inter = Inter({
  subsets: ["latin"], variable: "--font-sans",
  weight: ["300", "400", "500"], display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Cognera", template: "%s · Cognera" },
  description: "The AI study companion that knows your course material.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${jakarta.variable} ${inter.variable}`}>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
