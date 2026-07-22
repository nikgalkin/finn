# Local AI Assistant (Experimental)

Finn can connect to a model served locally by [LM Studio](https://lmstudio.ai/). Download and load an instruction-tuned model, then start the local server:

```shell
lms server start
lms load <model-key> --context-length 32768 --gpu max
```

The chat interface also works without a connected model: choose the context and tone, write a request, then preview and copy the prepared prompt to any AI tool.

Open the optional **Local AI** section at the bottom of **Settings** to configure the connection and select a chat model. The default endpoint is `http://127.0.0.1:1234/v1`. For privacy, Finn accepts only loopback server addresses.

LM Studio mode uses its native stateful chat API with reasoning disabled for responsive everyday analysis. The first message processes the complete financial context; subsequent messages reuse the local conversation state. Finn automatically starts a new context when the financial dataset changes.

The Assistant page lets you limit context to the latest 1, 2, 3, 6, 12, or 24 months, use the complete history, or select an exact month range. You can choose a strict, balanced, or playful response tone. Connected local models answer directly in the Markdown chat; without one, the composer opens the same context and request as a copyable prompt.

[Back to the README](../README.md)
