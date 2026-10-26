import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),

    compilerOptions: {
        // ย้าย runes mode จาก vite.config.ts มาไว้ตรงนี้
        runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
    },

    kit: {
        adapter: adapter()
    }
};

export default config;
