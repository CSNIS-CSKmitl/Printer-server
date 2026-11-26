import { readFileSync } from "node:fs";
import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  compilerOptions: {
    // ย้าย runes mode จาก vite.config.ts มาไว้ตรงนี้
    runes: ({ filename }) =>
      filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
  },

  kit: {
    adapter: adapter(),
    version: {
      name: pkg.version,
    },
  },
};

export default config;
