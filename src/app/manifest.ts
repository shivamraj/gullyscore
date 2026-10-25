// Web app manifest (PLT-06): lets phones install GullyScore on the home screen, where it opens
// full screen like an app. Next.js serves this at /manifest.webmanifest and links it from
// every page. Icons: src/app/icon.png (512 px) and src/app/apple-icon.png (192 px).

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "GullyScore: live cricket scores",
    short_name: "GullyScore",
    description: "Live ball-by-ball scoring for local cricket. Follow the score and ask the AI about the match.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0b1210",
    theme_color: "#0b7a4b",
    categories: ["sports"],
    icons: [
      { src: "/apple-icon.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "New match", short_name: "New match", url: "/match/new" }],
  };
}
