import OpenAI from "npm:openai@4.82.0";
import { Converter, Input, OutputItem } from "./index.ts";
import type { ChatCompletionMessageParam } from "npm:openai@4.82.0/resources/chat/completions.d.ts";

export class LLMConverter implements Converter {
  model: string;
  client: OpenAI;
  onFinish: (output: string) => void = () => {};

  constructor(params: {
    model: string;
    apiURL: string;
    apiKey: string;
    onFinish?: (output: string) => void;
  }) {
    this.model = params.model;
    this.client = new OpenAI({
      baseURL: params.apiURL,
      apiKey: params.apiKey,
    });
  }

  async convertForMarkdown(input: Input): Promise<OutputItem[]> {
    const decoder = new TextDecoder();
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
${JSON.stringify(input)}
\`\`\``,
      },
    ];

    let isStreaming = true;
    let outputText = "";

    // TODO: want to use "using"
    try {
      while (isStreaming) {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          messages,
          stream: true,
          temperature: 0,
        });

        for await (const chunk of completion) {
          const choice = chunk.choices[0];
          const { delta, finish_reason } = choice;
          if (!delta || !delta.content) {
            console.log("No content in delta", choice);
            continue;
          }

          outputText += delta.content;

          if (finish_reason === "stop") {
            isStreaming = false;
          } else if (finish_reason === "length") {
            messages.push({ role: "assistant", content: outputText });
            console.log("Continuing conversation");
          } else if (finish_reason) {
            throw `Unexpected finish_reason: ${finish_reason}`;
          }
        }
      }

      const jsonResponse = outputText.match(/{.*}/s)?.[0];
      if (!jsonResponse) {
        throw "No JSON response found";
      }
      const parsedResponse = JSON.parse(jsonResponse);
      const outputItems: OutputItem[] = parsedResponse.items;

      return outputItems;
    } finally {
      this.onFinish(outputText);
    }
  }
}
