import { ArrowRight } from "lucide-react";

export const inkling2SmallPlaygroundUrl =
  "https://tokenfactory.nebius.com/playground?models=thinkingmachines/Inkling-2-Small";

/** Thin announcement bar above the nav for the current model launch. */
export function LaunchBanner() {
  return (
    <a
      className="launch-banner"
      href={inkling2SmallPlaygroundUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="launch-banner-tag">New model launch</span>
      <img
        className="launch-banner-logo-chip"
        src="/logos/thinkingmachines.png"
        alt=""
        width={18}
        height={18}
      />
      <span className="launch-banner-text">
        <strong>Inkling 2 Small</strong> by Thinking Machines is live on Nebius Token Factory.
        <span className="launch-banner-detail">
          {" "}
          Use it today: <code>nconnect --model thinkingmachines/Inkling-2-Small claude</code>
        </span>
      </span>
      <span className="launch-banner-cta">
        Try it <ArrowRight size={14} />
      </span>
    </a>
  );
}
