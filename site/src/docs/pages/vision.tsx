import type { DocPage } from "../types";
import { Callout, Code, CopyBox, P } from "../ui";

export const vision: DocPage = {
  slug: "vision",
  title: "Images and vision",
  navLabel: "Images & vision",
  description:
    "Attach screenshots and images to Codex on Nebius by selecting a vision-capable model such as Kimi K2.6, using the clipboard shortcut or a file path.",
  group: "Models",
  Content() {
    return (
      <>
        <P>
          Select a vision-capable model explicitly when launching Codex. The default GLM model is
          text-only. Image options belong to Codex, not every harness; other agents keep their
          native attachment controls.
        </P>
        <CopyBox text="ncodex --model moonshotai/Kimi-K2.6" />
        <P>
          Use Codex&apos;s clipboard-image shortcut where your terminal supports it. Normal terminal
          paste may paste text only; NConnect does not monitor your clipboard. For a reliable
          file-based alternative, save the image on the machine running Codex:
        </P>
        <CopyBox
          text={
            'ncodex --model moonshotai/Kimi-K2.6 --image "/path/to/screenshot.png" "Describe this image"'
          }
        />
        <Callout>
          A plain file path in prompt text is not the same as attaching image bytes. Use the native
          image option and a model whose catalog lists image input. Clipboard access may be
          unavailable over SSH or in some terminal environments. Claude Code routes image blocks to
          a vision model automatically, so <Code>nclaude</Code> needs no extra flag.
        </Callout>
      </>
    );
  },
};
