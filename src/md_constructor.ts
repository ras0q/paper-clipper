import { z } from "zod";
import { ResolvedItem } from "./pdf_analyzer.ts";

export const instructionsSchema = z.object({
  x: z.array(z.string()),
  r: z.array(z.array(z.string())),
});
export type Instructions = z.infer<typeof instructionsSchema>;

export const constructMarkdown = (
  instructions: Instructions,
  flattenItems: (ResolvedItem & { i: string })[],
) => {
  const { x, r } = instructions;

  const markdown = flattenItems
    .map((item) => {
      if (x.includes(item.i)) {
        return "";
      }

      const replacement = r.find(([id]) => id === item.i);
      if (replacement) {
        return "🍇\n" + replacement[1];
      }

      return "🍎 " + item.s;
    })
    .join("");

  return markdown;
};
