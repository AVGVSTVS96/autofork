import mdx from "@mdx-js/rollup";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import rehypeSlug from "rehype-slug";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [mdx({ rehypePlugins: [rehypeSlug] }), react(), tailwindcss()],
});
