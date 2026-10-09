import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    // Lovable hosting runs a Cloudflare Worker (needs an exported fetch handler).
    // The Docker/Railway build sets NITRO_PRESET=node-server.
    nitro({
      preset: process.env.NITRO_PRESET || "cloudflare-module",
      output: { dir: "dist" },
    }),
    mcpPlugin(),
  ],
});
