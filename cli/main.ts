import { resolve } from "@std/path";
import { execute, Setting } from "../src/executor.ts";
import { parseArgs } from "@std/cli";

const args: {
  llm: boolean;
  _: string[];
} = parseArgs(Deno.args);

const pdfPath = args._[0];
if (!pdfPath) {
  throw "Please provide a PDF file path";
}

const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
if (args.llm && !openaiApiKey) {
  throw "Please provide an OpenAI API key";
}

const tempDir = `./output/output_${Date.now()}`;
await Deno.mkdir(tempDir, { recursive: true });

const setting: Setting = {
  pdfURL: new URL(resolve(Deno.cwd(), pdfPath)),
  converter: args.llm
    ? {
      type: "llm",
      model: "gemini-2.0-flash-exp",
      apiURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiKey: openaiApiKey!,
      onFinish: (output: string) => {
        Deno.writeTextFile(`${tempDir}/output.md`, output);
      },
    }
    : {
      type: "rule",
    },
};

const { inputItems, outputItems, markdown } = await execute(setting);

await Promise.all([
  Deno.writeTextFile(
    `${tempDir}/input_items.json`,
    JSON.stringify(inputItems, null, 2),
  ),
  Deno.writeTextFile(
    `${tempDir}/output_items.json`,
    JSON.stringify(outputItems, null, 2),
  ),
  Deno.writeTextFile(`${tempDir}/converted.md`, markdown),
]);
