import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    base: './',
    plugins: [
        tailwindcss(),
    ],
    // The Vite/Electron entry (src/styles/global.css) is Tailwind v4 and is handled by
    // the plugin above. An empty inline config stops Vite from also picking up
    // postcss.config.mjs, which runs Tailwind v3 for the Next.js entry (app/globals.css).
    css: {
        postcss: {
            plugins: [],
        },
    },
    server: {
        proxy: {
            '/api': {
                target: 'https://api.kie.ai',
                changeOrigin: true,
                secure: false
            },
            '/.netlify/functions': {
                target: 'https://higgsfield-matu.netlify.app',
                changeOrigin: true,
                secure: true
            },
            '/download-media': {
                target: 'https://higgsfield-matu.netlify.app',
                changeOrigin: true,
                secure: true
            }
        }
    }
});
