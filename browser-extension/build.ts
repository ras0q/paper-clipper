import * as esbuild from "npm:esbuild@0.24.2";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@0.11.1";
import { dirname, fromFileUrl, join } from "jsr:@std/path@1.0.8";

const srcDir = dirname(fromFileUrl(import.meta.url));
const rootDir = join(srcDir, "../");
const distDir = join(rootDir, "dist");
await Deno.mkdir(distDir, { recursive: true });

Deno.copyFileSync(
  join(srcDir, "manifest.json"),
  join(distDir, "manifest.json"),
);

await esbuild.build({
  plugins: [...denoPlugins({
    configPath: join(rootDir, "deno.json"),
    lockPath: join(rootDir, "deno.lock"),
  })],
  entryPoints: [join(srcDir, "background.ts")],
  bundle: true,
  format: "esm",
  outdir: distDir,
  minify: true,
});

esbuild.stop();
