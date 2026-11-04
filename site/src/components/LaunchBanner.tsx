import { ArrowRight } from "lucide-react";

export const kimiK31ProPlaygroundUrl =
  "https://tokenfactory.nebius.com/playground?models=moonshotai/Kimi-K3.1-Pro";

/** Thin announcement bar above the nav for the current model launch. */
export function LaunchBanner() {
  return (
    <a
      className="launch-banner"
      href={kimiK31ProPlaygroundUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="launch-banner-tag">New model launch</span>
      <img
        className="launch-banner-logo-chip"
        src="/logos/kimi.png"
        alt=""
        width={18}
        height={18}
      />
      <span className="launch-banner-text">
        <strong>Kimi K3.1 Pro</strong> by Moonshot AI is live on Nebius Token Factory.
        <span className="launch-banner-detail">
          {" "}
          Use it today: <code>nconnect --model moonshotai/Kimi-K3.1-Pro claude</code>
        </span>
      </span>
      <span className="launch-banner-cta">
        Try it <ArrowRight size={14} />
      </span>
    </a>
  );
}
