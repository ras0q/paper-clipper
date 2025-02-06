import { OutputItem } from "./converter/index.ts";
import { ResolvedItem } from "./pdf_analyzer.ts";

export const constructMarkdown = (
  inputItems: (ResolvedItem & { i: string })[],
  outputItems: OutputItem[],
) =>
  outputItems.map((outputItem) => {
    if (outputItem.text) {
      return outputItem.text;
    }

    switch (outputItem.ids.length) {
      case 1: {
        const item = inputItems.find(({ i }) => i === outputItem.ids[0]);
        if (!item) return "";
        return item.s + (item.eol ? "\n" : "");
      }
      case 2: {
        const [startID, endID] = outputItem.ids;
        const [startPage, _startItem] = startID.split("-");
        const [endPage, _endItem] = endID.split("-");
        const startItem = Number(_startItem);
        const endItem = Number(_endItem);

        const ids = [];
        if (startPage === endPage) {
          for (let i = startItem; i <= endItem; i++) {
            ids.push(`${startPage}-${i}`);
          }
        } else {
          const startItemMax = inputItems
            .filter(({ i }) => i.startsWith(startPage)).length;
          for (let i = startItem; i < startItemMax; i++) {
            ids.push(`${startPage}-${i}`);
          }
          for (let i = 0; i <= endItem; i++) {
            ids.push(`${endPage}-${i}`);
          }
        }
        const items = ids.flatMap((id) =>
          inputItems.find((inputItem) => inputItem.i === id) ?? []
        );

        return items.map((item) => item.s + (item.eol ? "\n" : "")).join("");
      }
      default: {
        throw new Error("Not implemented");
      }
    }
  })
    .map((line) => line.endsWith("\n") ? line : line + " ")
    .join("");
