import * as pdfjs from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

export type ResolvedItem = {
  s: string;
  h: number;
  y: number;
  f: string;
  eol: boolean;
};

export const analyzePDF = async (path: string) => {
  // pdfjs.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

  const pdfDocument = await pdfjs.getDocument(path).promise;
  const outline = simplifyOutline(await pdfDocument.getOutline());

  const documentItems: ResolvedItem[][] = [];
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

    // Reduce the number of elements by grouping textItems into blocks to some extent
    const pageItems: TextItem[] = [];
    for (const item of textItems) {
      if (item.height === 0 && item.str.length === 0) {
        continue;
      }

      if (pageItems.length === 0) {
        pageItems.push(item);
        continue;
      }

      const lastItem = pageItems[pageItems.length - 1];
      const isSameBlock =
        (item.height === 0 || item.height === lastItem.height) &&
        item.fontName === lastItem.fontName;
      if (!isSameBlock) {
        pageItems.push(item);
        continue;
      }

      const delimeter = /^[a-zA-Z]/.test(item.str) ? " " : "";
      lastItem.str += delimeter + item.str.trimStart();
    }

    documentItems.push(
      pageItems.map((item) => ({
        s: item.str,
        h: item.height,
        y: parseFloat(item.transform[5].toFixed(1)),
        f: item.fontName,
        eol: item.hasEOL,
      })),
    );
  }

  // Use the most common height as the text height
  const heights = documentItems
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

  documentItems.forEach((pageItems) => {
    pageItems.forEach((item) => {
      item.h = parseFloat((item.h / textHeight).toFixed(3));
    });
  });

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
