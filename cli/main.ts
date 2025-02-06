import { resolve } from "jsr:@std/path@1.0.8";
import { execute, Setting } from "../src/executor.ts";

const pdfPath = Deno.args[0];
if (!pdfPath) {
  throw "Please provide a PDF file path";
}

const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
if (!openaiApiKey) {
  throw "Please provide an OpenAI API key";
}

const setting: Setting = {
  pdfURL: new URL(resolve(Deno.cwd(), pdfPath)),
  converter: {
    type: "llm",
    model: "gemini-2.0-flash-exp",
    apiURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKey: openaiApiKey,
  },
};

const { inputItems, outputItems, markdown } = await execute(setting);

const tempDir = `./output/output_${Date.now()}`;
await Deno.mkdir(tempDir, { recursive: true });
await Promise.all([
  Deno.writeTextFile(
    `${tempDir}/input_items.json`,
    JSON.stringify(inputItems, null, 2),
  ),
  Deno.writeTextFile(
    `${tempDir}/output_items.json`,
    JSON.stringify(outputItems, null, 2),
  ),
  Deno.writeTextFile(`${tempDir}/output.md`, markdown),
]);
