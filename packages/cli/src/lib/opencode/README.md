# OpenCode implementation notes

## Images and vision

Vision support depends on which model is active. The `build` agent's system
prompt is one unified instruction that lets the model self-select by its own
runtime capabilities, so it stays correct even if the user switches models
mid-session:

- Vision-capable primary models (GLM 5.3 Flash, Kimi K3, Kimi K3.1 Pro, Qwen
  3.8 27B): OpenCode sends the image directly to the model. This is the working path
  for images.
- Text-only primary models (GLM 5.3, DeepSeek V4 Pro 0813): OpenCode strips the image
  bytes before they reach the model. The model tells the user plainly that it
  cannot see images, and that they should switch to a vision-capable model via
  `/models` (GLM 5.3 Flash, Kimi K3, or Qwen 3.8 27B) and re-send the image.

### The `@vision` subagent and clipboard images

A `@vision` subagent is still registered and pinned to the vision primary (Nemotron 3.5
Super VL), but it
does not work for clipboard-pasted images today: OpenCode has an open bug
([#25553][oc-25553]) where an image attached with `@vision` is not forwarded to
the subagent. The subagent only errors with `"this model does not support image
input"`.

The build prompt is therefore configured to tell text-only primaries not to
auto-invoke `@vision`. The reliable path is to switch the primary model to a
vision one via `/models`.

A fix for the subagent image-forwarding path is in progress upstream
([PR #32302][oc-32302]); once it merges, `@vision` for clipboard images should
work and the prompt can re-enable auto-delegation.

## Curated `/models`

OpenCode normally shows two extra sources of clutter alongside our declared
Nebius models, both suppressed by the emitted config:

- Nebius's full serverless catalog: OpenCode merges a provider's declared
  `models` block on top of its full [models.dev](https://models.dev) catalog.
  The config sets a `whitelist` (added in OpenCode [PR #3416][oc-3416])
  restricting the Nebius provider to only the current flagships nconnect
  ships.
- Other providers (Anthropic, OpenAI, Gemini, Bedrock, Zen): the config sets
  `enabled_providers: ["nebius"]` so OpenCode ignores every other provider
  entirely, and `disabled_providers: ["opencode"]` to additionally block the Zen
  gateway. The gateway's provider id is `opencode`, not `zen`; see OpenCode
  [issue #6979][oc-6979]. `disabled_providers` takes priority over
  `enabled_providers`.

Note: the built-in "Connect provider" option (`ctrl+a` in the picker) has no
config field to hide it, so it stays visible. With only `nebius` enabled,
there is nothing else active to connect to; connecting another provider would
also be a no-op against this config's intent.

So `/models` shows only the 6 curated flagships. Each model's display name
carries a short tip because OpenCode model entries have no separate description
field. The provider label stays the full `Nebius Token Factory`, and the model names are
kept short so the per-line provider suffix OpenCode appends does not push them
past the picker's truncation width.

| Model id               | Vision | Use case                            |
| ---------------------- | ------ | ----------------------------------- |
| `zai-org/GLM-5.2`      | No     | default, agentic coding (text-only) |
| `MiniMaxAI/MiniMax-M3` | Yes    | cheapest vision, 512K context       |

That's all users see in `/models`. The curated set lives in
[`@nconnect/models`](../../../../models/src/index.ts) (`SELECTABLE_MODELS`).

[oc-25553]: https://github.com/sst/opencode/issues/25553
[oc-32302]: https://github.com/sst/opencode/pull/32302
[oc-3416]: https://github.com/sst/opencode/pull/3416
[oc-6979]: https://github.com/sst/opencode/issues/6979
