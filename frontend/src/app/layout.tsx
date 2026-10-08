import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Boot } from "@/components/providers/Boot";
import { ToastHost } from "@/components/ui/Toast";

import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Signal",
  description: "A Signal Messenger clone: private messaging, recreated for the web.",
};

// Runs before the first paint, so a saved dark theme never flashes light.
// It mirrors applyTheme() in store/ui.ts.
const themeScript = `(function(){try{var t=localStorage.getItem("signal-clone-theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="h-full font-sans">
        <Boot />
        {children}
        <ToastHost />
      </body>
    </html>
  );
}
