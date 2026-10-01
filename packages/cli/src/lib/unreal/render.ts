/**
 * unreal-agent-runner has no human-readable mode: it writes one JSON record
 * per line to stdout (`{ Sequence, RecordedAt, Kind, Data }`) and expects to
 * be piped. In a terminal that is a wall of JSON, so when stdout is a TTY the
 * relay renders the records people care about - the assistant's messages and
 * the tools it calls - and drops the bookkeeping (inputs, turn markers,
 * operation state). Piped output is passed through untouched.
 */

type OutputItem = {
  Type?: string;
  Data?: { Text?: string; Name?: string; Arguments?: string };
};

type RunnerRecord = {
  Kind?: string;
  Data?: {
    Response?: { Output?: OutputItem[]; Failure?: { Message?: string } | null };
    Status?: { Error?: string };
  };
};

/** Show the one argument a tool call is really about, else the raw JSON. */
function describeToolCall(name: string, rawArguments: string | undefined): string {
  if (!rawArguments) {
    return name;
  }
  try {
    const args = JSON.parse(rawArguments) as Record<string, unknown>;
    const primary = args.command ?? args.path ?? args.file ?? args.skill;
    if (typeof primary === "string") {
      return `${name}: ${primary}`;
    }
  } catch {
    // Not JSON - fall through and show it as-is.
  }
  return `${name}: ${rawArguments}`;
}

/**
 * Render one stdout line. Returns the text to print (with its newline), or
 * undefined for records that carry nothing a person needs to see. Lines that
 * are not runner records are returned as they came.
 */
export function renderUnrealLine(line: string): string | undefined {
  if (!line.trim()) {
    return undefined;
  }
  let record: RunnerRecord;
  try {
    record = JSON.parse(line) as RunnerRecord;
  } catch {
    return `${line}\n`;
  }
  if (typeof record !== "object" || record === null || typeof record.Kind !== "string") {
    return `${line}\n`;
  }
  switch (record.Kind) {
    case "model_response": {
      const out: string[] = [];
      for (const item of record.Data?.Response?.Output ?? []) {
        if (item.Type === "message" && item.Data?.Text?.trim()) {
          out.push(`${item.Data.Text.trim()}\n`);
        } else if (item.Type === "tool_call" && item.Data?.Name) {
          out.push(`▸ ${describeToolCall(item.Data.Name, item.Data.Arguments)}\n`);
        }
      }
      const failure = record.Data?.Response?.Failure?.Message;
      if (failure) {
        out.push(`✗ ${failure}\n`);
      }
      return out.length ? out.join("") : undefined;
    }
    case "tool_call_status": {
      const error = record.Data?.Status?.Error;
      return error ? `✗ ${error}\n` : undefined;
    }
    default:
      return undefined;
  }
}
