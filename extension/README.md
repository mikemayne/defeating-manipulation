# Firefox pattern highlighter

A small Firefox WebExtension for the Defeating Manipulation catalogue.

## Install for testing

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on…**.
3. Select `extension/manifest.json`.

The toolbar button toggles highlighting on the current tab. The badge reads **ON** while highlighting is enabled. Reloading a page keeps the current tab's setting; switching the button off removes highlights and popups.

## What it does

- Reads text already present in the current page.
- Checks it against the phrase-pattern rules in `patterns.json`.
- Highlights matched phrases in a blue/turquoise shade assigned to the technique.
- Shows the technique name, catalogue summary and link to its full explanation when a highlight is hovered or focused.
- Loads technique names and summaries from the public `techniques.json` catalogue.

Page text is processed locally. It is not sent to the catalogue repository or any server. The extension downloads only the public pattern catalogue. It does not assess author intent or judge an article.

## Matching coverage

The catalogue currently contains descriptive definitions and observable features, not executable matching rules for every technique. This first version therefore highlights only explicit phrase patterns that can be matched reliably in text. It does not claim to detect every instance of a technique. Add or refine expressions in `patterns.json` as the catalogue develops.

## Notes

- Browser-internal pages, the Add-ons site and other restricted pages cannot be modified by extensions.
- The extension requires an internet connection to load the current technique descriptions.
- Full explanations link to the project's GitHub Pages site.
