import { ResolvedItem } from "./pdf_analyzer.ts";

export type OutputItem = {
  ids: string[];
  text?: string;
};

export const constructMarkdown = (
  inputItems: (ResolvedItem & { i: string })[],
  outputItems: OutputItem[],
) =>
  outputItems.map((outputItem) => {
    if (outputItem.text) {
      return outputItem.text;
    }
    return outputItem.ids.map((id) => {
      const item = inputItems.find((inputItem) => inputItem.i === id);
      return item?.s ?? "";
    }).join("");
  }).join("\n");
