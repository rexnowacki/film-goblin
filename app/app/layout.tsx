import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import {
  Bungee,
  DM_Serif_Display,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  IBM_Plex_Serif,
  Rubik_Glitch,
  Rubik_Wet_Paint,
} from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ToastProvider";
import { getServerUser } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import { getPendingAnnouncement, type PendingAnnouncement } from "@/lib/queries/announcements";
import AnnouncementOverlay from "@/components/AnnouncementOverlay";
import { THEME_COOKIE, readTheme } from "@/lib/theme";

const rubikWetPaint = Rubik_Wet_Paint({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display-rubik-wet-paint",
});

const rubikGlitch = Rubik_Glitch({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-display-rubik-glitch",
});

const bungee = Bungee({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-display-bungee",
});

const dmSerifDisplay = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-head-face",
});

const ibmPlexSans = IBM_Plex_Sans({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ui-face",
});

const ibmPlexSerif = IBM_Plex_Serif({
  weight: ["400", "700"],
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
  variable: "--font-serif-face",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-mono-face",
});

export const metadata: Metadata = {
  title: "Film Goblin — Watch Weirder",
  description: "Hunt price drops on Apple TV movies. Join the coven.",
  icons: {
    icon: [
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
  appleWebApp: {
    capable: true,
    title: "Film Goblin",
    statusBarStyle: "black-translucent",
    startupImage: [
      // iPhone 14/15/16 Pro Max & Plus (430×932 @3x)
      { url: "/icons/splash-1290x2796.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone 14/15/16 Pro (393×852 @3x)
      { url: "/icons/splash-1179x2556.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone 14/15/16 + 12/13 (390×844 @3x)
      { url: "/icons/splash-1170x2532.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      // iPhone XR / 11 (414×896 @2x)
      { url: "/icons/splash-828x1792.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      // iPhone SE 2nd/3rd, 8, 7, 6s, 6 (375×667 @2x)
      { url: "/icons/splash-750x1334.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0A0A0A",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser();
  let pending: PendingAnnouncement | null = null;
  if (user) {
    const supabase = await createClient();
    pending = await getPendingAnnouncement(supabase, user.id);
  }
  const theme = readTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="en"
      data-theme={theme}
      className={[
        rubikWetPaint.variable,
        rubikGlitch.variable,
        bungee.variable,
        dmSerifDisplay.variable,
        ibmPlexSans.variable,
        ibmPlexSerif.variable,
        ibmPlexMono.variable,
      ].join(" ")}
    >
      <head>
        {/* Legacy iOS standalone capability declaration. Next.js's metadata API
            emits only the modern `mobile-web-app-capable` tag; older iOS still
            preferentially reads the apple-prefixed form. Belt-and-suspenders. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <ToastProvider>
          {children}
          {pending && <AnnouncementOverlay announcement={pending} />}
        </ToastProvider>
      </body>
    </html>
  );
}
