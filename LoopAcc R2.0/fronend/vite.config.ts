import { defineConfig } from "vite";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname), "");

  return {
    server: {
      host: env.VITE_DEV_HOST || "::",
      port: Number(env.VITE_DEV_PORT || 8080),
    },
    plugins: [react()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    root: path.resolve(__dirname),
    build: {},
  };
});
