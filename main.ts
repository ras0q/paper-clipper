import OpenAI from "openai";
import { analyzePDF } from "./src/pdf_analyzer.ts";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.d.ts";
import { constructMarkdown, OutputItem } from "./src/md_constructor.ts";

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
const decoder = new TextDecoder();

const { outline, documentItems } = await analyzePDF(pdfPath);

const inputItems = documentItems.flatMap((pageItems, i) =>
  pageItems.map((item, j) => (
    {
      ...item,
      i: `${i}-${j}`,
    }
  ))
);
Deno.writeTextFileSync(`${tempDir}/items.json`, JSON.stringify(inputItems));
console.log("Items written");

const openai = new OpenAI({
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  apiKey: openaiApiKey,
});

const prompt = decoder.decode(Deno.readFileSync("./src/prompt.md"));
const messages: ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: "You are a PDF to Markdown converter.",
  },
  {
    role: "user",
    content: prompt,
  },
  {
    role: "user",
    content: `Here's the PDF data (JSON):
\`\`\`json:request.json
${JSON.stringify({ outline, items: inputItems })}
\`\`\``,
  },
];

const responseFilePath = `${tempDir}/response.json`;
let isStreaming = true;
while (isStreaming) {
  const completion = await openai.chat.completions.create({
    model: "gemini-2.0-flash-exp",
    messages,
    stream: true,
    temperature: 0,
    // response_format: zodResponseFormat(
    //   instructionsSchema,
    //   "response",
    // ),
  });

  for await (const chunk of completion) {
    const choice = chunk.choices[0];
    const { delta, finish_reason } = choice;
    if (!delta || !delta.content) {
      console.log("No content in delta", choice);
      continue;
    }

    Deno.writeTextFile(responseFilePath, delta.content, { append: true });

    if (finish_reason === "stop") {
      isStreaming = false;
    } else if (finish_reason === "length") {
      const decoder = new TextDecoder();
      const response = decoder.decode(Deno.readFileSync(responseFilePath));
      messages.push({ role: "assistant", content: response });
      console.log("Continuing conversation");
    } else if (finish_reason) {
      throw `Unexpected finish_reason: ${finish_reason}`;
    }
  }
}
console.log("API Response written");

const response = decoder.decode(Deno.readFileSync(responseFilePath));
const jsonResponse = response.match(/{.*}/s)?.[0];
if (!jsonResponse) {
  throw "No JSON response found";
}
const parsedResponse = JSON.parse(jsonResponse);
const outputItems: OutputItem[] = parsedResponse.items;
const markdown = constructMarkdown(inputItems, outputItems);

Deno.writeTextFileSync(`${tempDir}/output.md`, markdown);
console.log("Output written");
