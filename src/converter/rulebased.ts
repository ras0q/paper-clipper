import { Converter, Input, OutputItem } from "./index.ts";

export class RuleBasedConverter implements Converter {
  convertForMarkdown(input: Input): Promise<OutputItem[]> {
    const outputItems: OutputItem[] = [];
    let referenceCount = 0;
    let isInReferences = false;
    let isInMath = false;
    let currentText = "";

    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      const { s, h, y, i: id } = item;
      const pageIndex = parseInt(id.split("-")[0]);
      const pageHeight = input.pageHeights[pageIndex];

      const yPercent = y / pageHeight;
      const isFooter = h < 0.8 && Math.abs(yPercent - 0.5) > 0.35;
      if (isFooter) continue;

      const isHeader = h > 1.1;
      if (isHeader) {
        const headerLevel = h > 1.5 ? 1 : 2;
        const headerText = `${"#".repeat(headerLevel)} ${s}\n`;
        outputItems.push({ ids: [id], text: headerText });

        if (s.trim() === "References") {
          isInReferences = true;
        }

        continue;
      }

      if (isInReferences) {
        referenceCount++;
        outputItems.push({ ids: [id], text: `[^${referenceCount}]` });
        continue;
      }

      if (s.startsWith("Figure")) {
        const figureNumber = outputItems.filter((item) =>
          item.text?.startsWith("![")
        ).length + 1;
        const altText = s.replace(/Figure\s*\d+\.\s*/, "");
        const markdownImage = `![${altText}](Figure${figureNumber}.png)`;
        outputItems.push({ ids: [id], text: markdownImage });
        continue;
      }

      if (s.startsWith("Table")) {
        const tableRows = [];
        let tableHeaders = [];
        let tableContent = "";
        let tableHeaderStr = "";
        let tableAlignStr = "";
        let start = i;
        while (start < input.items.length) {
          const { y, h, s } = input.items[start];
          const pageIndex = parseInt(input.items[start].i.split("-")[0]);
          const pageHeight = input.pageHeights[pageIndex];
          const yPercent = y / pageHeight;
          const isHooter = h < 0.9 || yPercent > 0.95 || yPercent < 0.05;
          if (isHooter) break;

          tableRows.push(s);
          start++;
        }
        if (tableRows.length > 0) {
          tableHeaders = tableRows[0].split(/\s{2,}/);
          tableHeaderStr = "|" + tableHeaders.join("|") + "|\\n";
          tableAlignStr = "|" +
            Array(tableHeaders.length).fill("---").join("|") + "|\\n";
          for (let j = 1; j < tableRows.length; j++) {
            const row = tableRows[j].split(/\s{2,}/);
            tableContent += "|" + row.join("|") + "|\\n";
          }
          outputItems.push({
            ids: [id, input.items[start - 1].i],
            text: tableHeaderStr + tableAlignStr + tableContent,
          });
          i = start - 1;
        }
        continue;
      }

      // TODO: Math Detection
      if (s.length < 4 && h < 0.9) {
        isInMath = true;
        currentText += s + " ";
        continue;
      }

      if (isInMath) {
        isInMath = false;
        outputItems.push({ ids: [id], text: "$" + currentText + "$" });
        currentText = "";
      }

      outputItems.push({ ids: [id] });
    }

    return Promise.resolve(outputItems);
  }
}
