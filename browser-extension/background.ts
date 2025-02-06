import { execute, Setting } from "../src/executor.ts";

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url === undefined) return;

  const url = new URL(tab.url);
  if (url.protocol !== "file:") {
    return;
  }

  const setting: Setting = {
    pdfPath: url.pathname,
    converter: {
      type: "llm",
      model: "gemini-2.0-flash-exp",
      apiURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiKey: Deno.env.get("OPENAI_API_KEY") || "",
    },
  };

  const { inputItems, outputItems, markdown } = await execute(setting);
  console.table({ inputItems, outputItems, markdown });
});
