import OpenAI from "openai";
import * as pdfjs from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

// pdfjs.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

const pdfPath = "./sample.pdf";

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
Please analyze the provided PDF data and generate a JSON object containing instructions for converting it to Markdown. The JSON object MUST be formatted to be easily embeddable within JavaScript code and stored as \`response.json\`.

The PDF data is structured as follows:

- \`outline\`: Document outline containing titles and sections.
- \`pages\`: Content of each page, divided into blocks and items. Each item has an id (\`i\`), text content (\`s\`), height (\`h\`), and y-coordinate (\`y\`).

You MUST use the following three **shortened** instructions to process each item:

- \`"o"\`: Output the raw text content associated with the item ID directly. This instruction has no further arguments.
- \`"x"\`: Omit (exclude) the text content associated with the item ID. This instruction has no further arguments.
- \`"r"\`: Replace the text content associated with the item ID with the provided string. This instruction takes exactly one argument, which is the replacement string in Markdown format (for equations, tables, headings etc).

The JSON object MUST have the following structure:

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

- The JSON object MUST contain a single key named \`"instructions"\` which has an array as its value.
- Each element in the \`instructions\` array MUST be a sub-array which represents an instruction for a single item.
- The first element of the sub-array (\`"[itemID]"\`) MUST be the unique identifier for a text item (e.g., "0-0-0").
- The second element of the sub-array (\`"[instruction]"\`) MUST be a command to process the text item, which MUST be one of the three **shortened** instructions (\`"o"\`, \`"x"\`, or \`"r"\`) described above.
- If the instruction is \`"r"\`, the third element MUST be the replacement string in Markdown format.
- The instructions from this JSON MUST be executed sequentially for each item, and the resulting text MUST be joined together without any separator or new line.
- **If no instruction is explicitly provided for an \`itemID\`, it MUST be treated as if the instruction \`"o"\` was given. Therefore,  the \`"o"\` instruction MUST NEVER appear in the \`instructions\` array. The \`instructions\` array MUST ONLY include items with the \`"x"\` or \`"r"\` instructions.**
- When using \`"r"\`, the replacement string provided as an argument MUST be the final Markdown-formatted string, and it MUST not include the original text content associated with the item.
- Each unique \`itemID\` MUST appear only once in the \`instructions\` array.
- If a logical content like a paragraph, a heading, or a math expression is constructed by multiple item ids, you MUST apply \`"r"\` to the first item id and \`"x"\` to the following items.

Follow these guidelines:

1. You MUST use the \`outline\` data to create appropriate headings (h1, h2, h3, etc.).
2. You MUST identify and convert any structured data (tables, lists, etc.) and special formats (mathematical expressions) to the appropriate Markdown. You MUST enclose mathematical expressions in \`$$...$$\`.
3. If a given item MUST be omitted from the output (such as page numbers, headers, footers, captions or authors), you MUST use the \`"x"\` command.
4. If a given item MUST be replaced with markdown formatted content, you MUST use the \`"r"\` command and pass markdown formatted text as argument.
5. The JSON object MUST be minified to reduce the size.
6. You MUST escape any backquotes (\`) within the generated JSON, using \`\\\` characters.

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
const markdown = items.map((item) => {
  const instruction = instructions.find(([id]) => id === item.i);
  if (!instruction) {
    return " " + item.s;
  }

  const [, command, ...args] = instruction;
  switch (command) {
    case "x":
      return "";
    case "r":
      return "\n" + args[0];
    case "o":
      console.warn("`o` command not expected");
      return " " + item.s;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}).join("");

Deno.writeTextFileSync(`${tempDir}/output.md`, markdown);

console.log(`Output written to ${tempDir}/output.md`);
