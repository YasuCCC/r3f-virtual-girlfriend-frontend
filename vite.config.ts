import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, Plugin } from "vite";

// Viteのasset変換は new URL("data:...", import.meta.url) のdata URIを
// ファイルパスとして誤結合するため、変換後に元のdata URIへ戻す
const fixSparkWasmDataUri = (): Plugin => ({
  name: "fix-spark-wasm-data-uri",
  enforce: "post",
  transform(code, id) {
    if (!id.includes("@sparkjsdev/spark")) return null;
    if (!code.includes("data:application/wasm")) return null;
    return code.replace(
      /new URL\("[^"]*?(?=data:application\/wasm)/g,
      'new URL("'
    );
  },
});

// ArrivalのCDNはlocalhostからの直接fetchをCORSで拒否するため、
// 開発サーバ経由で中継する
const arrivalProxy = {
  "/arrival-cdn": {
    target: "https://dzrmwng2ae8bq.cloudfront.net",
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/arrival-cdn/, ""),
  },
  "/arrival-ugc": {
    target: "https://ugc.arrival.space",
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/arrival-ugc/, ""),
  },
};

// https://vitejs.dev/config/
export default defineConfig({
  // GitHub Pagesなどサブパス配信でも動くよう相対パスでビルドする
  base: "./",
  plugins: [react(), fixSparkWasmDataUri()],
  optimizeDeps: {
    // 事前バンドルされると上記transformを通らないため除外する
    exclude: ["@sparkjsdev/spark"],
  },
  server: { proxy: arrivalProxy },
  preview: { proxy: arrivalProxy },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        space: fileURLToPath(new URL("./space.html", import.meta.url)),
      },
    },
  },
});
