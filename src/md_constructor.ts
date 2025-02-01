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

    switch (outputItem.ids.length) {
      case 1: {
        return inputItems.find((inputItem) => inputItem.i === outputItem.ids[0])
          ?.s ?? "";
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
        return ids.map((id) => {
          const item = inputItems.find((inputItem) => inputItem.i === id);
          return item?.s ?? "";
        }).join("");
      }
      default: {
        throw new Error("Not implemented");
      }
    }
  }).join("\n");
