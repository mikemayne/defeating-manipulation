(() => {
  if (window.__dmPatternHighlighter) return;

  const SOURCE = "https://raw.githubusercontent.com/mikemayne/defeating-manipulation/main/techniques.json";
  const MARK = "data-dm-pattern-highlight";
  let tooltip;
  let active = true;
  const touched = [];

  const clean = value => String(value || "").replace(/\s+/g, " ").trim();

  function colour(id) {
    let hash = 0;
    for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const hue = 195 + (hash % 21);
    return `hsl(${hue} 78% 86%)`;
  }

  function makeTooltip() {
    tooltip = document.createElement("div");
    tooltip.id = "dm-pattern-tooltip";
    Object.assign(tooltip.style, {
      position: "fixed", zIndex: "2147483647", display: "none",
      maxWidth: "340px", padding: "12px 14px", borderRadius: "8px",
      background: "#102b46", color: "#f4fbff", boxShadow: "0 5px 24px #0005",
      font: "14px/1.45 system-ui,sans-serif", pointerEvents: "auto"
    });
    document.documentElement.appendChild(tooltip);
  }

  function showTooltip(mark, technique) {
    tooltip.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = technique.title;
    const summary = document.createElement("div");
    summary.textContent = technique.summary;
    summary.style.margin = "6px 0 8px";
    const link = document.createElement("a");
    link.textContent = "Read the full explanation";
    link.href = `https://mikemayne.github.io/defeating-manipulation/techniques/${encodeURIComponent(technique.id)}.html`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.color = "#7ee4e7";
    tooltip.append(heading, summary, link);
    const rect = mark.getBoundingClientRect();
    tooltip.style.display = "block";
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - 350);
    const top = rect.bottom + 8 + 150 < window.innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - tooltip.offsetHeight - 8);
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
  }

  function hideTooltip() {
    if (tooltip) tooltip.style.display = "none";
  }

  function highlightTextNode(node, rules, techniques) {
    const text = node.nodeValue;
    if (!text || !text.trim()) return;
    const matches = [];
    for (const rule of rules) {
      const technique = techniques.get(rule.id);
      if (!technique) continue;
      for (const expression of rule.expressions || []) {
        let regex;
        try { regex = new RegExp(expression, "gi"); } catch (_) { continue; }
        let match;
        while ((match = regex.exec(text)) !== null) {
          if (!match[0].length) { regex.lastIndex++; continue; }
          matches.push({start: match.index, end: match.index + match[0].length, technique});
        }
      }
    }
    if (!matches.length) return;
    matches.sort((a,b) => a.start - b.start || (b.end-b.start) - (a.end-a.start));
    const chosen = [];
    let end = -1;
    for (const match of matches) {
      if (match.start >= end) { chosen.push(match); end = match.end; }
    }
    if (!chosen.length) return;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of chosen) {
      if (match.start > cursor) fragment.append(document.createTextNode(text.slice(cursor, match.start)));
      const mark = document.createElement("mark");
      mark.setAttribute(MARK, match.technique.id);
      mark.textContent = text.slice(match.start, match.end);
      mark.style.cssText = `background:${colour(match.technique.id)};color:#102b46;border-radius:2px;padding:0 1px;cursor:help;`;
      mark.addEventListener("mouseenter", () => showTooltip(mark, match.technique));
      mark.addEventListener("focus", () => showTooltip(mark, match.technique));
      mark.tabIndex = 0;
      fragment.append(mark);
      cursor = match.end;
    }
    if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
    node.parentNode.replaceChild(fragment, node);
  }

  function eligible(node) {
    const parent = node.parentElement;
    if (!parent || parent.closest("script,style,noscript,textarea,input,select,option,button,code,pre,svg,mark,[contenteditable=true]")) return false;
    return true;
  }

  async function start() {
    const [patternResponse, catalogueResponse] = await Promise.all([
      fetch(browser.runtime.getURL("patterns.json")),
      fetch(SOURCE)
    ]);
    if (!patternResponse.ok || !catalogueResponse.ok) throw new Error("Could not load the pattern library.");
    const patternData = await patternResponse.json();
    const catalogue = await catalogueResponse.json();
    const techniques = new Map((catalogue.techniques || []).map(item => [item.id, item]));
    makeTooltip();

    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) if (eligible(walker.currentNode)) nodes.push(walker.currentNode);
    for (const node of nodes) if (node.isConnected) highlightTextNode(node, patternData.patterns, techniques);

    document.addEventListener("mouseover", event => {
      if (!event.target.closest?.("mark[" + MARK + "]")) hideTooltip();
    }, true);
    document.addEventListener("keydown", event => { if (event.key === "Escape") hideTooltip(); });

    window.__dmPatternHighlighter = {
      disable() {
        active = false;
        document.querySelectorAll("mark[" + MARK + "]").forEach(mark => {
          mark.replaceWith(document.createTextNode(mark.textContent));
        });
        if (tooltip) tooltip.remove();
        delete window.__dmPatternHighlighter;
      }
    };
  }

  window.__dmPatternHighlighter = {disable() {
    active = false;
    document.querySelectorAll("mark[" + MARK + "]").forEach(mark => mark.replaceWith(document.createTextNode(mark.textContent)));
    if (tooltip) tooltip.remove();
    delete window.__dmPatternHighlighter;
  }};
  start().catch(error => {
    console.warn("Defeating Manipulation highlighter:", error);
    if (window.__dmPatternHighlighter) window.__dmPatternHighlighter.disable();
  });
})();
