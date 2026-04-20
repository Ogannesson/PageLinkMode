import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build as viteBuild } from "vite";
import esbuild from "esbuild";

const rootDir = process.cwd();
const distDir = resolve(rootDir, "dist");

async function cleanDist() {
  await rm(distDir, { recursive: true, force: true });
}

async function copyStaticFiles() {
  await cp(resolve(rootDir, "public"), distDir, { recursive: true });
}

async function buildExtensionScripts() {
  await esbuild.build({
    entryPoints: {
      background: resolve(rootDir, "src/background/index.ts"),
      content: resolve(rootDir, "src/content/index.ts"),
      "page-bridge": resolve(rootDir, "src/content/page-bridge.ts"),
    },
    bundle: true,
    format: "iife",
    minify: false,
    platform: "browser",
    target: ["chrome114"],
    outdir: resolve(distDir, "js"),
    entryNames: "[name]",
    logLevel: "info",
  });
}

async function buildUiPages() {
  await viteBuild({
    configFile: resolve(rootDir, "vite.config.ts"),
  });
}

async function main() {
  await cleanDist();
  await copyStaticFiles();
  await buildExtensionScripts();
  await buildUiPages();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
