import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1c2233",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-x-hidden antialiased`}
    >
      <body className="min-h-full overflow-x-hidden bg-workspace font-sans text-foreground">
        {children}
        <Toaster
          richColors
          position="top-right"
          toastOptions={{ className: "font-sans" }}
        />
      </body>
    </html>
  );
}
