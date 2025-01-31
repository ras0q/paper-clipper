import * as pdfjs from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

export type ResolvedItem = {
  s: string;
  h: number;
  y: number;
};

export const analyzePDF = async (path: string) => {
  // pdfjs.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

  const pdfDocument = await pdfjs.getDocument(path).promise;
  const outline = simplifyOutline(await pdfDocument.getOutline());

  const documentItems: ResolvedItem[][][] = [];
  const operationCommands: unknown[][][] = [];

  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);

    const pageOperators = await page.getOperatorList();
    const pageOperationCommands = pageOperators.fnArray.map((fn, i) => {
      const args = fn === pdfjs.OPS.showText
        ? pageOperators.argsArray[i]
          .flatMap((arg: { unicode: string }[]) =>
            arg.map((arg) => arg.unicode)
          )
          .join("")
        : pageOperators.argsArray[i];

      return [fn, args];
    });
    operationCommands.push(pageOperationCommands);

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

    documentItems.push(
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
  const heights = documentItems
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

  return { outline, documentItems, operationCommands, textHeight };
};

export type Outline = {
  title: string;
  items?: Outline[];
};

const simplifyOutline = (outline: Outline[]) => {
  if (!outline) return [];

  return outline.map((item) => {
    const simplifiedItem: Outline = {
      title: item.title,
    };
    if (item.items && item.items.length > 0) {
      simplifiedItem.items = simplifyOutline(item.items);
    }
    return simplifiedItem;
  });
};

export const mergeDocumentItems = (
  documentItems: ResolvedItem[][][],
) => {
  const mergedDocumentItems: ResolvedItem[][][] = [];
  for (const pageItems of documentItems) {
    const mergedPageItems: ResolvedItem[][] = [];
    for (let i = 0; i < pageItems.length; i++) {
      const items = pageItems[i];
      if (items.length !== 1 || items[0].h !== 1) {
        mergedPageItems.push(items);
        continue;
      }

      const lastItems = mergedPageItems[mergedPageItems.length - 1];
      if (!lastItems || lastItems.length !== 1 || lastItems[0].h !== 1) {
        mergedPageItems.push(items);
        continue;
      }

      const delimeter = /^[a-zA-Z]/.test(items[0].s) ? " " : "";
      lastItems[0].s += delimeter + items[0].s.trimStart();
    }

    mergedDocumentItems.push(mergedPageItems);
  }

  return mergedDocumentItems;
};
