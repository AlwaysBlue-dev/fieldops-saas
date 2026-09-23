import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaRegister } from "@/components/fieldops/pwa-register";
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
    default: "FieldOps Cloud",
    template: "%s · FieldOps Cloud",
  },
  description:
    "Field-service operations for dispatch, jobs, crews, time, and approvals.",
  applicationName: "FieldOps Cloud",
  appleWebApp: {
    capable: true,
    title: "FieldOps",
    statusBarStyle: "default",
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
    { media: "(prefers-color-scheme: dark)", color: "#1c2233" },
  ],
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-x-hidden antialiased`}
    >
      <body className="min-h-full overflow-x-hidden bg-workspace font-sans text-foreground">
        {children}
        <PwaRegister />
        <Toaster
          richColors
          position="top-center"
          toastOptions={{ className: "font-sans" }}
        />
      </body>
    </html>
  );
}
