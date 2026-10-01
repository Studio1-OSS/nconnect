import type { DocPage } from "../types";
import { Code, CodeBlock, CopyBox, H2, P } from "../ui";

export const costMetering: DocPage = {
  slug: "cost-metering",
  title: "Cost metering",
  description:
    "Track what every coding session costs on Nebius. See local spend by model and tool, and route spawned harnesses through the daemon for metering and fallback.",
  group: "Features",
  Content() {
    return (
      <>
        <P>
          Proxied harnesses go through the daemon, so every turn is metered. Spawned harnesses hold
          the key and call Nebius directly, which is why they report $0.00.
        </P>
        <H2 id="usage-report">See your spend</H2>
        <CopyBox text="nconnect usage --last 7d" />
        <P>The report is built from local data and is never uploaded.</P>

        <H2 id="meter-spawned">Meter spawned harnesses</H2>
        <P>
          <Code>NCONNECT_METER=1</Code> points a spawned harness at the daemon instead:
        </P>
        <CopyBox text={'NCONNECT_METER=1 npi --print "..."'} />
        <CodeBlock label="Output">
          {
            "NConnect ▸ Launching Pi Code with Nebius Token Factory.\n[nconnect cost] session total: $0.0056 (1,518 in, 69 out)"
          }
        </CodeBlock>
        <P>
          The harness then shares the same client as everyone else: automatic model fallback, the
          per-model circuit breaker and transient-fault retries. The real Nebius key stays inside
          the daemon, since the harness only ever sees a local session token. If the daemon is
          unreachable the launcher says so and connects directly, so metering can never be the
          reason a session fails to start.
        </P>
      </>
    );
  },
};
