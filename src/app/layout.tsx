import type { Metadata, Viewport } from "next";
import { AppProvider } from "@/components/app-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "UseFirst — meals from what you already have",
  description:
    "Take a photo of your produce. Get meal ideas your family will actually eat, before the food goes to waste.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "UseFirst", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#fbf7f0",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
