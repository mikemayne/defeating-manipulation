(() => {
 if (window.__dmPatternHighlighter) {
   window.__dmPatternHighlighter.analyseSelection();
   return;
 }
 const MARK = "data-dm-pattern-highlight";
 const BUSY_CURSOR_STYLE_ID = "dm-pattern-busy-cursor";
 let activeAnalyses = 0;
 function setBusy(busy) {
   activeAnalyses = Math.max(0, activeAnalyses + (busy ? 1 : -1));
   if (busy && activeAnalyses === 1) {
     const style = document.createElement("style");
     style.id = BUSY_CURSOR_STYLE_ID;
     style.textContent = "html[data-dm-analysing], html[data-dm-analysing] * { cursor: wait !important; }";
     document.documentElement.append(style);
     document.documentElement.setAttribute("data-dm-analysing", "");
   } else if (!busy && activeAnalyses === 0) {
     document.documentElement.removeAttribute("data-dm-analysing");
     document.getElementById(BUSY_CURSOR_STYLE_ID)?.remove();
   }
 }

 let tooltip;
 const BLUE = "#2563eb", GREEN = "#16a34a", TURQUOISE = "#0d9488", RED = "#dc2626";
 const colour = technique => technique.category === "Inconsistency" ? RED :
   technique.category === "Positive" ? GREEN :
   technique.category === "Concealed manipulation" ? TURQUOISE : BLUE;
 const eligible = node => node.parentElement &&
   !node.parentElement.closest("script,style,noscript,textarea,input,select,option,button,code,pre,svg,mark,[contenteditable],#dm-pattern-tooltip");
 function show(mark, matches) {
   tooltip.replaceChildren();
   const heading = document.createElement("strong");
   heading.textContent = matches.length === 1 ? matches[0].technique.title : matches.length + " findings";
   tooltip.append(heading);
   for (const match of matches) {
     const technique = match.technique;
     const section = document.createElement("section");
     section.style.cssText = "margin-top:9px;padding-top:8px;border-top:1px solid #53708a;";
     const title = document.createElement("strong");
     title.textContent = technique.title;
     title.style.color = colour(technique);
     const summary = document.createElement("div");
     summary.textContent = technique.summary || "";
     if (match.kind === "inconsistency") {
       const other = document.createElement("div");
       other.textContent = "Conflicting passage: “" + match.otherText + "”";
       other.style.cssText = "margin-top:8px;padding:7px;border-left:3px solid #f87171;";
       summary.append(other);
     }
     summary.style.margin = "6px 0 8px";
     const strength = document.createElement("div");
     strength.textContent = match.kind === "inconsistency" ? "Inference: possible contradiction" :
       match.method === "pattern" ? "Match: Rule" : "Match strength: " + (match.strength || "Low");
     strength.style.cssText = "margin:0 0 8px;font-size:12px;color:#b5d0e5;";
     section.append(title, summary, strength);
     if (match.kind !== "inconsistency") {
       const link = document.createElement("a");
       link.textContent = "Read the full explanation";
       link.href = `https://mikemayne.github.io/defeating-manipulation/techniques/${encodeURIComponent(technique.id)}.html`;
       link.target = "_blank";
       link.rel = "noopener noreferrer";
       link.style.color = "#7ee4e7";
       section.append(link);
     }
     tooltip.append(section);
   }
   const r = mark.getBoundingClientRect();
   tooltip.style.display = "block";
   tooltip.style.left = Math.min(Math.max(8, r.left), Math.max(8, innerWidth - 350)) + "px";
   tooltip.style.top = r.bottom + tooltip.offsetHeight + 8 < innerHeight
     ? r.bottom + 8 + "px" : Math.max(8, r.top - tooltip.offsetHeight - 8) + "px";
 }
 function clearMarks() {
   for (const mark of document.querySelectorAll("mark[" + MARK + "]")) {
     mark.replaceWith(document.createTextNode(mark.textContent));
   }
   document.body.normalize();
   tooltip.style.display = "none";
 }
 const BLOCKS = "p,div,section,article,li,ul,ol,blockquote,h1,h2,h3,h4,h5,h6,pre,table,tr,td,th";
 function blockAncestor(node) {
   return node.parentElement?.closest(BLOCKS) || document.body;
 }
 function textBoundary(previous, current) {
   if (!previous) return "";
   const a = previous.node, b = current.node;
   if (blockAncestor(a) !== blockAncestor(b)) return "\n";
   // <br> has no text children, so checking the text nodes' ancestors
   // misses explicit line breaks within a paragraph.
   const between = document.createRange();
   between.setStartAfter(a);
   between.setEndBefore(b);
   return between.cloneContents().querySelector("br") ? "\n" : "";
 }
 function selectionSnapshot() {
   const selection = window.getSelection();
   if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
   const range = selection.getRangeAt(0).cloneRange();
   if (!document.body.contains(range.commonAncestorContainer)) return null;
   const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
     ? range.commonAncestorContainer.parentElement : range.commonAncestorContainer;
   const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
   const nodes = [];
   let text = "";
   while (walker.nextNode()) {
     const node = walker.currentNode;
     if (!eligible(node) || !range.intersectsNode(node)) continue;
     // Intersect the selection with each text node; selection endpoints can be elements.
     const nodeRange = document.createRange();
     nodeRange.selectNodeContents(node);
     if (range.compareBoundaryPoints(Range.START_TO_START, nodeRange) > 0)
       nodeRange.setStart(range.startContainer, range.startOffset);
     if (range.compareBoundaryPoints(Range.END_TO_END, nodeRange) < 0)
       nodeRange.setEnd(range.endContainer, range.endOffset);
     if (nodeRange.collapsed) continue;
     const start = nodeRange.startOffset, end = nodeRange.endOffset;
     if (nodeRange.startContainer !== node || nodeRange.endContainer !== node) continue;
     text += textBoundary(nodes[nodes.length - 1], { node });
     nodes.push({ node, start, end, textStart: text.length, textEnd: text.length + end - start });
     text += node.nodeValue.slice(start, end);
   }
   return text.trim() ? { text, nodes } : null;
 }
 function underline(snapshot, matches) {
   const valid = matches.filter(m => m.start >= 0 && m.end > m.start && m.end <= snapshot.text.length);
   const edges = [...new Set(valid.flatMap(m => [m.start, m.end]))].sort((a, b) => a - b);
   const spans = [];
   for (let i = 0; i + 1 < edges.length; i++) {
     const start = edges[i], end = edges[i + 1];
     const covering = valid.filter(m => m.start <= start && m.end >= end);
     if (covering.length) spans.push({ start, end, matches: covering });
   }
   // Each text fragment is wrapped once, even when multiple findings overlap.
   // CSS backgrounds draw parallel coloured lines below the baseline.
   for (const entry of snapshot.nodes.slice().reverse()) {
     if (!entry.node.isConnected) continue;
     const intersections = spans.filter(m => m.start < entry.textEnd && m.end > entry.textStart)
       .sort((a, b) => b.start - a.start);
     for (const span of intersections) {
       const start = entry.start + Math.max(0, span.start - entry.textStart);
       const end = entry.start + Math.min(entry.textEnd - entry.textStart, span.end - entry.textStart);
       if (end <= start) continue;
       const range = document.createRange();
       range.setStart(entry.node, start);
       range.setEnd(entry.node, end);
       const mark = document.createElement("mark");
       mark.setAttribute(MARK, span.matches.map(m => m.technique.id).join(" "));
       const colours = [...new Set(span.matches.map(m => colour(m.technique)))];
       const layers = colours.map((color, index) =>
         `linear-gradient(${color},${color}) 0 calc(100% - ${index * 4}px) / 100% 3px no-repeat`);
       mark.style.cssText = `background:${layers.join(",")};color:inherit;text-decoration:none;cursor:help;box-decoration-break:clone;-webkit-box-decoration-break:clone;`;
       mark.addEventListener("mouseenter", () => show(mark, span.matches));
       mark.addEventListener("focus", () => show(mark, span.matches));
       mark.tabIndex = 0;
       range.surroundContents(mark);
     }
   }
 }
 async function analyseSelection() {
   const snapshot = selectionSnapshot();
   if (!snapshot) return;
   setBusy(true);
   try {
     const matches = await browser.runtime.sendMessage({ type: "DM_MATCH", text: snapshot.text });
     // Keep captured text nodes intact until the new underlines are applied.
     underline(snapshot, matches || []);
     window.getSelection()?.removeAllRanges();
   } catch (error) {
     console.warn("Defeating Manipulation selected-text matcher:", error);
   } finally {
     setBusy(false);
   }
 }
 tooltip = document.createElement("div");
 tooltip.id = "dm-pattern-tooltip";
 Object.assign(tooltip.style, { position: "fixed", zIndex: "2147483647", display: "none",
   maxWidth: "340px", padding: "12px 14px", borderRadius: "8px", background: "#102b46",
   color: "#f4fbff", boxShadow: "0 5px 24px #0005", font: "14px/1.45 system-ui,sans-serif",
   pointerEvents: "auto" });
 document.documentElement.append(tooltip);
 document.addEventListener("mouseover", event => {
   if (!event.target.closest?.("mark[" + MARK + "]") && !tooltip.contains(event.target))
     tooltip.style.display = "none";
 }, true);
 document.addEventListener("keydown", event => {
   if (event.key === "Escape") tooltip.style.display = "none";
 });
 window.__dmPatternHighlighter = { analyseSelection, disable() {
   clearMarks(); tooltip.remove(); activeAnalyses = 1; setBusy(false); delete window.__dmPatternHighlighter;
 } };
 analyseSelection();
})();
