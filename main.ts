import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import * as pdfjs from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { z } from "zod";

// pdfjs.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

const pdfPath = "./sample2.pdf";

const pdfDocument = await pdfjs.getDocument(pdfPath).promise;
const outline = await pdfDocument.getOutline();

const pages: {
  s: string;
  h: number;
  y: number;
}[][][] = [];
const pageOperators: unknown[][][] = [];

for (let i = 1; i <= pdfDocument.numPages; i++) {
  const page = await pdfDocument.getPage(i);

  const operators = await page.getOperatorList();
  const operationCommands = operators.fnArray.map((fn, i) => {
    const args = fn === pdfjs.OPS.showText
      ? operators.argsArray[i]
        .flatMap((arg: { unicode: string }[]) => arg.map((arg) => arg.unicode))
        .join("")
      : operators.argsArray[i];

    // const fnName =
    //   Object.entries(pdfjs.OPS).find(([_, value]) => value === fn)?.[0] || fn;

    return [fn, args];
  });
  pageOperators.push(operationCommands);

  const textContent = await page.getTextContent();
  const textItems = textContent.items as TextItem[];

  const lineBlocks: TextItem[][] = [[]];
  for (const item of textItems) {
    const lastBlock = lineBlocks[lineBlocks.length - 1];
    if (lastBlock.length === 0) {
      lastBlock.push(item);
      if (item.hasEOL) {
        lineBlocks.push([]);
      }
      continue;
    }

    if (item.str.trim().length === 0) {
      continue;
    }

    const lastItem = lastBlock[lastBlock.length - 1];

    if (item.height !== 0 && item.height !== lastItem.height) {
      lastBlock.push(item);
      continue;
    }

    const delimeter = /^[a-zA-Z]/.test(item.str) ? " " : "";
    lastItem.str += delimeter + item.str.trimStart();

    if (item.hasEOL) {
      lineBlocks.push([]);
    }
  }

  pages.push(
    lineBlocks.map((blockItems) =>
      blockItems.map((item) => ({
        s: item.str,
        h: item.height,
        y: parseFloat(item.transform[5].toFixed(1)),
      }))
    ),
  );
}

// Use the most common height as the text height
const heights = pages
  .flat()
  .flat()
  .map((block) => block.h)
  .reduce((acc, h) => {
    acc[h] = (acc[h] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);
const textHeight = Object.entries(heights).reduce(
  (acc, [h, count]) => {
    if (count > acc.count) {
      return { height: Number(h), count };
    }
    return acc;
  },
  { height: 0, count: 0 },
).height;

for (const page of pages) {
  for (const lineBlocks of page) {
    for (const block of lineBlocks) {
      block.h = parseFloat((block.h / textHeight).toFixed(3));
    }
  }
}

// Merge consecutive lineBlocks with a single element and height equal to textHeight
const mergedPages: typeof pages = [];
for (const page of pages) {
  const mergedPage: typeof page = [];
  for (let i = 0; i < page.length; i++) {
    const currentBlocks = page[i];
    if (currentBlocks.length !== 1 || currentBlocks[0].h !== 1) {
      mergedPage.push(currentBlocks);
      continue;
    }

    const prevBlocks = mergedPage[mergedPage.length - 1];
    if (!prevBlocks || prevBlocks.length !== 1 || prevBlocks[0].h !== 1) {
      mergedPage.push(currentBlocks);
      continue;
    }

    const delimeter = /^[a-zA-Z]/.test(currentBlocks[0].s) ? " " : "";
    prevBlocks[0].s += delimeter + currentBlocks[0].s.trimStart();
  }

  mergedPages.push(mergedPage);
}

const tempDir = `./output/output_${Date.now()}`;
await Deno.mkdir(tempDir, { recursive: true });

const pagesWithItemID = mergedPages.map((page, i) =>
  page.map((block, j) =>
    block.map((item, k) => ({
      i: `${i}-${j}-${k}`,
      ...item,
    }))
  )
);
Deno.writeTextFileSync(
  `${tempDir}/pages.json`,
  JSON.stringify(pagesWithItemID, null, 2),
);

console.log(`Pages written to ${tempDir}/pages.json`);

function simplifyOutline(documentOutline: typeof outline): {
  title: string;
  items?: ReturnType<typeof simplifyOutline>;
}[] {
  if (!documentOutline) return [];

  return documentOutline.map((item) => {
    const simplifiedItem: ReturnType<typeof simplifyOutline>[number] = {
      title: item.title,
    };
    if (item.items && item.items.length > 0) {
      simplifiedItem.items = simplifyOutline(item.items);
    }
    return simplifiedItem;
  });
}

const simplifiedOutline = simplifyOutline(outline);
Deno.writeTextFileSync(
  `${tempDir}/outline.json`,
  JSON.stringify(simplifiedOutline, null, 2),
);

const openai = new OpenAI({
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  apiKey: Deno.env.get("OPENAI_API_KEY")!,
});

const requestJSON = JSON.stringify({
  outline: simplifiedOutline,
  pages: pagesWithItemID,
});

const prompt = `
Please analyze the provided PDF data and generate a JSON object containing instructions for converting it to Markdown. The JSON object should be formatted to be easily embeddable within JavaScript code and stored as \`response.json\`.

The PDF data is structured as follows:

- \`outline\`: Document outline containing titles and sections.
- \`pages\`: Content of each page, divided into blocks and items. Each item has an id (\`i\`), text content (\`s\`), height (\`h\`), and y-coordinate (\`y\`).

The JSON object should have the following structure:

\`\`\`json
{
  "instructions": [
    [ "[itemID]", "[instruction]", "[argument1]", "[argument2]", ... ],
     [ "[itemID]", "[instruction]", "[argument1]", "[argument2]", ... ],
     ...
  ]
}
\`\`\`

Where:

- The JSON object contains a single key named \`"instructions"\` which has an array as its value.
- Each element in the \`instructions\` array is a sub-array which represents an instruction for a single item.
- The first element of the sub-array (\`"[itemID]"\`) is the unique identifier for a text item (e.g., "0-0-0").
- The second element of the sub-array (\`"[instruction]"\`) is a command to process the text item, which can be one of the following:
  - \`"out"\`: Output the raw text content associated with the item ID directly. This instruction has no further arguments in the sub-array.
  - \`"omit"\`: Omit the text content associated with the item ID. This instruction has no further arguments in the sub-array.
  - \`"replace"\`: Replace the text content associated with the item ID with the provided string. This instruction takes exactly one argument, which is the replacement string in Markdown format (for equations, tables, headings etc). This argument should be the third element of the sub-array.
- If a logical content like paragraph, a heading or a math expression is constructed by multiple item ids, please apply \`replace\` to the first item id and \`omit\` to the following items.

Follow these guidelines:

1. Use the \`outline\` data to create appropriate headings (h1, h2, h3, etc.).
2. Identify and convert any structured data (tables, lists, etc.) and special formats (mathematical expressions) to the appropriate Markdown. Enclose mathematical expressions in \`$$...$$\`.
3. If a given item should be omitted from the output (such as page numbers, headers, footers, captions or authors), use the \`"omit"\` command.
4. Use the \`"out"\` command to output an item's raw text content if no special formatting or omission is required.
5. If a given item should be replaced with markdown formatted content, use \`"replace"\` command and pass markdown formatted text as argument.
6. The JSON object should be minified to reduce the size.
7. Escape any backquotes (\`) within the generated JSON, using \`\\\` characters.

Here's the PDF data (JSON):

\`\`\`json:request.json
${requestJSON}
\`\`\`
`;
Deno.writeTextFileSync(`${tempDir}/prompt.md`, prompt);

// const responseSchema = z.object({
//   instructions: z.array(z.array(z.string())),
// });
// type Response = z.infer<typeof responseSchema>;

const completion = await openai.chat.completions.create({
  model: "gemini-2.0-flash-exp",
  messages: [
    {
      role: "system",
      content: "You are a PDF to Markdown converter.",
    },
    {
      role: "user",
      content: prompt,
    },
  ],
  stream: true,
  temperature: 0,
  // response_format: zodResponseFormat(
  //   responseSchema,
  //   "response",
  // ),
});

const filename = `${tempDir}/response.json`;
for await (const chunk of completion) {
  Deno.writeTextFile(
    filename,
    chunk.choices[0].delta.content ?? "❓",
    { append: true },
  );
}

console.log(`Response written to ${filename}`);

// constcution step

const decoder = new TextDecoder();
const response = decoder.decode(Deno.readFileSync(filename));
const jsonResponse = response.match(/{.*}/s)?.[0] ?? "";
if (!jsonResponse) {
  console.error("No JSON response found");
  Deno.exit(1);
}
const { instructions }: { instructions: string[][] } = JSON.parse(jsonResponse);

const items = pagesWithItemID.flat().flat();
const markdown = instructions.map(([itemID, instruction, ...args]) => {
  switch (instruction) {
    case "out":
      return " " + (items.find((item) => item.i === itemID)?.s ?? "");
    case "omit":
      return "";
    case "replace":
      return "\n" + args[0];
    default:
      return "";
  }
}).join("");

Deno.writeTextFileSync(`${tempDir}/output.md`, markdown);

console.log(`Output written to ${tempDir}/output.md`);
