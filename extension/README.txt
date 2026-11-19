# Browser extension — planned

The extension is not implemented yet. This directory records its intended behaviour.

## User interaction
- The reader explicitly invokes analysis.
- The reader can analyse selected text or request extraction of the current article.
- No automatic scanning of every page.
- No background monitoring or browsing-history collection.

## Permissions
Request the minimum permissions needed. Prefer active-tab and user-triggered scripting over broad host permissions. Explain permissions before installation.

## Processing
Text stays on the device. Local inference is optional and replaceable. The extension must remain useful without a model.

## Safety
Treat page text as untrusted input. Never execute page instructions, follow links suggested by page text, or send text to a remote service without explicit informed consent.
