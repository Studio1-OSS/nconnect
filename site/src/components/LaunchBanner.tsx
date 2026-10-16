import { ArrowRight } from "lucide-react";

export const museSparkOpenPlaygroundUrl =
  "https://tokenfactory.nebius.com/playground?models=meta-models/muse-spark-open";

/** Thin announcement bar above the nav for the current model launch. */
export function LaunchBanner() {
  return (
    <a
      className="launch-banner"
      href={museSparkOpenPlaygroundUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="launch-banner-tag">New model launch</span>
      <img src="/logos/meta.svg" alt="" width={18} height={18} />
      <span className="launch-banner-text">
        <strong>Muse Spark Open</strong> by Meta is live on Nebius Token Factory.
        <span className="launch-banner-detail">
          {" "}
          Use it today: <code>nconnect --model meta-models/muse-spark-open claude</code>
        </span>
      </span>
      <span className="launch-banner-cta">
        Try it <ArrowRight size={14} />
      </span>
    </a>
  );
}
