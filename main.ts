import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import {
  constructMarkdown,
  Instructions,
  instructionsSchema,
} from "./src/md_constructor.ts";
import { analyzePDF, mergeDocumentItems } from "./src/pdf_analyzer.ts";
import { generatePrompt } from "./src/prompt.ts";

const pdfPath = Deno.args[0];
if (!pdfPath) {
  throw "Please provide a PDF file path";
}

const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
if (!openaiApiKey) {
  throw "Please provide an OpenAI API key";
}

const tempDir = `./output/output_${Date.now()}`;
await Deno.mkdir(tempDir, { recursive: true });

const { outline, documentItems, textHeight } = await analyzePDF(pdfPath);

const mergedDocumentItems = mergeDocumentItems(documentItems);
const flattenItems = mergedDocumentItems.flatMap((pageItems, i) =>
  pageItems.flatMap((items, j) =>
    items.map((item, k) => ({
      ...item,
      i: `${i}-${j}-${k}`,
      h: parseFloat((item.h / textHeight).toFixed(3)),
    }))
  )
);
Deno.writeTextFileSync(`${tempDir}/items.json`, JSON.stringify(flattenItems));
console.log("Items written");

const openai = new OpenAI({
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  apiKey: openaiApiKey,
});

const completion = await openai.chat.completions.create({
  model: "gemini-2.0-flash-exp",
  messages: [
    {
      role: "system",
      content: "You are a PDF to Markdown converter.",
    },
    {
      role: "user",
      content: generatePrompt(JSON.stringify({
        outline,
        items: flattenItems,
      })),
    },
  ],
  stream: true,
  temperature: 0,
  response_format: zodResponseFormat(
    instructionsSchema,
    "response",
  ),
});

const responseFilePath = `${tempDir}/response.json`;
for await (const chunk of completion) {
  Deno.writeTextFile(
    responseFilePath,
    chunk.choices[0].delta.content ?? "❓",
    { append: true },
  );
}
console.log("API Response written");

const decoder = new TextDecoder();
const response = decoder.decode(Deno.readFileSync(responseFilePath));
const jsonResponse = response.match(/{.*}/s)?.[0] ?? "";
if (!jsonResponse) {
  throw "No JSON response found";
}
const instructions: Instructions = JSON.parse(jsonResponse);

const markdown = constructMarkdown(instructions, flattenItems);
Deno.writeTextFileSync(`${tempDir}/output.md`, markdown);
console.log("Output written");
