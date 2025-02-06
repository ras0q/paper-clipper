import { InputItem } from "./converter/index.ts";
import { Converter, NopeConverter } from "./converter/index.ts";
import { LLMConverter, LLMConverterParams } from "./converter/llm.ts";
import { RuleBasedConverter } from "./converter/rulebased.ts";
import { constructMarkdown } from "./md_constructor.ts";
import { analyzePDF } from "./pdf_analyzer.ts";

export type Setting = {
  pdfURL: URL;
  converter:
    | ({ type: "llm" } & LLMConverterParams)
    | { type: "rule" };
};

export const execute = async (setting: Setting) => {
  const { outline, documentItems, pageHeights } = await analyzePDF(
    setting.pdfURL,
  );

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
    pageHeights,
  };

  const { type } = setting.converter;
  const converter: Converter = type === "llm"
    ? new LLMConverter(setting.converter)
    : type === "rule"
    ? new RuleBasedConverter()
    : new NopeConverter();

  const outputItems = await converter.convertForMarkdown(input);
  const markdown = constructMarkdown(inputItems, outputItems);

  return {
    inputItems,
    outputItems,
    markdown,
  };
};
