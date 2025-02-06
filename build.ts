import * as esbuild from "esbuild";
import { denoPlugins } from "@luca/esbuild-deno-loader";
import { dirname, fromFileUrl, join, relative } from "@std/path";

const rootDir = relative(Deno.cwd(), dirname(fromFileUrl(import.meta.url)));
const srcDir = join(rootDir, "browser-extension");
const distDir = join(rootDir, "dist");
await Deno.mkdir(distDir, { recursive: true });

Deno.copyFileSync(
  join(srcDir, "manifest.json"),
  join(distDir, "manifest.json"),
);

await esbuild.build({
  plugins: [...denoPlugins()],
  entryPoints: [join(srcDir, "background.ts")],
  bundle: true,
  format: "esm",
  outdir: distDir,
  minify: true,
});

esbuild.stop();
