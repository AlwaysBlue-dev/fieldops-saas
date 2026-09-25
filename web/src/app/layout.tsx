import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaRegister } from "@/components/fieldops/pwa-register";
import { PwaThemeMeta } from "@/components/fieldops/pwa-theme-meta";
import { ThemeProvider } from "@/components/fieldops/theme-provider";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: `${APP_TAGLINE} ${APP_DESCRIPTION}`,
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon", type: "image/png" },
      { url: "/icons/apple-touch-icon.png", sizes: "180x180" },
    ],
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1c2233" },
    { media: "(prefers-color-scheme: dark)", color: "#141821" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-x-hidden antialiased`}
    >
      <body className="min-h-full overflow-x-hidden bg-workspace font-sans text-foreground">
        <ThemeProvider>
          {children}
          <PwaThemeMeta />
          <PwaRegister />
          <Toaster
            richColors
            position="top-center"
            toastOptions={{ className: "font-sans" }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
