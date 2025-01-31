export const generatePrompt = (requestJSON: string) => {
  const prompt = `
Please analyze the provided PDF data and generate a JSON object containing instructions for converting it to Markdown. The JSON object MUST be formatted to be easily embeddable within JavaScript code and stored as \`response.json\`.

The PDF data is structured as follows:

\`\`\`json
{
  "outline": [
    {
      "title": "[string]",
      "items": [
        { "title": "[string]" },
        { "title": "[string]" },
         ...
      ]
    },
    {
      "title": "[string]"
    },
    ...
  ],
  "items": [
    {
      "i": "[string]",
      "h": "[number]",
      "s": "[string]",
      "y": "[number]"
    },
    {
      "i": "[string]",
      "h": "[number]",
      "s": "[string]",
      "y": "[number]"
    },
    ...
  ]
}
\`\`\`

- \`outline\`: An array of objects, each representing a section in the document outline. Each object has a \`title\` property (string) and may have an optional \`items\` property, which is an array of objects with \`title\` properties (strings), forming a nested structure.
- \`items\`: An array of objects, each representing a text item in the PDF content. Each object has the following properties:
    - \`i\`: A unique identifier for the text item (string).
    - \`h\`: The height of the text (number).
    - \`s\`: The text content (string).
    - \`y\`: The y-coordinate of the text (number).

You MUST use the following three **shortened** instructions to process each item:

- \`"o"\`: Output the raw text content associated with the item ID directly. This instruction has no further arguments.
- \`"x"\`: Omit (exclude) the text content associated with the item ID. This instruction has no further arguments.
- \`"r"\`: Replace the text content associated with the item ID with the provided string. This instruction takes exactly one argument, which is the replacement string in Markdown format (for equations, tables, headings etc).

The JSON object MUST have the following structure:

\`\`\`json
{
  "x": ["itemID1", "itemID2", ...],
  "r": [["itemID3", "replaced content"], ...]
}
\`\`\`

Where:

- The JSON object MUST contain two keys: \`"x"\` and \`"r"\`.
- The value associated with the key \`"x"\` MUST be an array of strings. Each string in this array MUST be an \`itemID\` that should be omitted from the output.
- The value associated with the key \`"r"\` MUST be an array of arrays. Each inner array MUST have exactly two elements:
    - The first element MUST be an \`itemID\` that should be replaced.
    - The second element MUST be the replacement string in Markdown format.
- If no instruction is explicitly provided for an \`itemID\`, it MUST be treated as if the instruction \`"o"\` was given. Therefore, no \`itemID\` that will use the \`"o"\` instruction MUST appear in either the \`"x"\` or \`"r"\` arrays.
- When using \`"r"\`, the replacement string provided as an argument MUST be the final Markdown-formatted string, and it MUST not include the original text content associated with the item.
- Each unique \`itemID\` MUST appear at most once in the JSON object (either in the \`"x"\` array or as the first element of an inner array in the \`"r"\` array).
- If a logical content like a paragraph, a heading, or a math expression is constructed by multiple item ids, you MUST apply \`"r"\` to the first item id and add the following item ids to the \`"x"\` array.

Follow these guidelines:

1. You MUST use the \`outline\` data to create appropriate headings (h1, h2, h3, etc.).
2. You MUST identify and convert any structured data (tables, lists, etc.) and special formats (mathematical expressions) to the appropriate Markdown. You MUST enclose mathematical expressions in \`$$...$$\`.
3. If a given item MUST be omitted from the output (such as page numbers, headers, footers, captions or authors), you MUST add its \`itemID\` to the \`"x"\` array.
4. If a given item MUST be replaced with markdown formatted content, you MUST create an inner array with the \`itemID\` and the markdown string as two elements and add this inner array to the \`"r"\` array.
5. The JSON object MUST be minified to reduce the size.
6. You MUST escape any backquotes (\`) within the generated JSON, using \`\\\` characters.

Here's the PDF data (JSON):

\`\`\`json:request.json
${requestJSON}
\`\`\`
`;

  return prompt;
};
