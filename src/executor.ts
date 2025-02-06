import { InputItem } from "./converter/index.ts";
import { Converter, NopeConverter } from "./converter/index.ts";
import { LLMConverter } from "./converter/llm.ts";
import { constructMarkdown } from "./md_constructor.ts";
import { analyzePDF } from "./pdf_analyzer.ts";

export type Setting = {
  pdfURL: URL;
  converter: {
    type: "llm";
    model: string;
    apiURL: string;
    apiKey: string;
  };
};

export const execute = async (setting: Setting) => {
  const { outline, documentItems } = await analyzePDF(setting.pdfURL);

  const inputItems: InputItem[] = documentItems.flatMap((pageItems, i) =>
    pageItems.map((item, j) => (
      {
        ...item,
        i: `${i}-${j}`,
      }
    ))
  );

  const input = {
    outline,
    items: inputItems,
  };

  const converter: Converter = setting.converter.type === "llm"
    ? new LLMConverter(setting.converter)
    : new NopeConverter();

  const outputItems = await converter.convertForMarkdown(input);
  const markdown = constructMarkdown(inputItems, outputItems);

  return {
    inputItems,
    outputItems,
    markdown,
  };
};
