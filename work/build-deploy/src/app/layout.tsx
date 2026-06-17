import type { Metadata } from "next";

// Force dynamic rendering — prevent CDN cache (Firebase/GCP)
export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { ThemeProvider } from "next-themes";
import { PWARegister } from "@/components/pwa-register";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "CaixaFácil - Gestão de Máquinas",
  description: "Sistema de gestão financeira de máquinas de entretenimento. Micro SaaS para controle de leituras, máquinas e clientes.",
  keywords: ["CaixaFácil", "caixafacil", "máquinas", "entretenimento", "gestão", "leituras", "música", "sinuca"],
  authors: [{ name: "CaixaFácil" }],
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/logo-caixafacil-icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "CaixaFácil",
    description: "Sistema de gestão de máquinas de entretenimento",
    siteName: "CaixaFácil",
    type: "website",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "CaixaFácil",
    "theme-color": "#1e3a5f",
    "msapplication-TileColor": "#1e3a5f",
    // Prevent long CDN caching for HTML
    "Cache-Control": "no-cache, no-store, must-revalidate",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
          <Toaster />
          <SonnerToaster position="top-center" richColors />
          <PWARegister />

        </ThemeProvider>
      </body>
    </html>
  );
}
