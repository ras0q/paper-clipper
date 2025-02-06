import { Outline, ResolvedItem } from "../pdf_analyzer.ts";

export type Input = {
  outline: Outline[];
  items: InputItem[];
};

export type InputItem = ResolvedItem & { i: string };

export type OutputItem = {
  ids: string[];
  text?: string;
};

export interface Converter {
  convertForMarkdown(
    input: Input,
  ): Promise<OutputItem[]> | OutputItem[];
}

export class NopeConverter implements Converter {
  convertForMarkdown(
    input: Input,
  ): Promise<OutputItem[]> {
    return new Promise((resolve) => {
      resolve(input.items.map((item) => ({
        ids: [item.i],
        text: item.s,
      })));
    });
  }
}
