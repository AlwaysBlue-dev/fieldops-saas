import type { Metadata } from "next";
import { PlatformLayoutClient } from "./platform-layout-client";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PlatformLayout({
  children,
}: LayoutProps<"/platform">) {
  return <PlatformLayoutClient>{children}</PlatformLayoutClient>;
}
