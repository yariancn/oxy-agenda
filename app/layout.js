import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PWARegister from "../components/PWARegister";
import InstallGuide from "../components/InstallGuide";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata = {
  title: "OXY Agenda",
  description: "Sistema Empresarial de Agenda y Auditoría Clínica",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "OXY Agenda",
    statusBarStyle: "black",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PWARegister />
        <InstallGuide />
        {children}
      </body>
    </html>
  );
}