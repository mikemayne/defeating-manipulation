(() => {
 if (window.__dmPatternHighlighter) {
   window.__dmPatternHighlighter.analyseSelection();
   return;
 }
 const MARK = "data-dm-pattern-highlight";
 let tooltip;
 const BLUE = "#2563eb", GREEN = "#16a34a", TURQUOISE = "#0d9488";
 const colour = technique => technique.category === "Positive" ? GREEN :
   technique.category === "Concealed manipulation" ? TURQUOISE : BLUE;
 const eligible = node => node.parentElement &&
   !node.parentElement.closest("script,style,noscript,textarea,input,select,option,button,code,pre,svg,mark,[contenteditable],#dm-pattern-tooltip");
 function show(mark, technique) {
   tooltip.replaceChildren();
   const title = document.createElement("strong");
   title.textContent = technique.title;
   const summary = document.createElement("div");
   summary.textContent = technique.summary || "";
   summary.style.margin = "6px 0 8px";
   const link = document.createElement("a");
   link.textContent = "Read the full explanation";
   link.href = `https://mikemayne.github.io/defeating-manipulation/techniques/${encodeURIComponent(technique.id)}.html`;
   link.target = "_blank";
   link.rel = "noopener noreferrer";
   link.style.color = "#7ee4e7";
   tooltip.append(title, summary, link);
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
   const spans = matches.filter(m => m.start >= 0 && m.end > m.start && m.end <= snapshot.text.length)
     .sort((a, b) => a.start - b.start);
   // Work backwards so earlier text offsets remain valid.
   for (const entry of snapshot.nodes.slice().reverse()) {
     if (!entry.node.isConnected) continue;
     const intersections = spans.filter(m => m.start < entry.textEnd && m.end > entry.textStart)
       .sort((a, b) => b.start - a.start);
     for (const match of intersections) {
       const start = entry.start + Math.max(0, match.start - entry.textStart);
       const end = entry.start + Math.min(entry.textEnd - entry.textStart, match.end - entry.textStart);
       if (end <= start) continue;
       const range = document.createRange();
       range.setStart(entry.node, start);
       range.setEnd(entry.node, end);
       const mark = document.createElement("mark");
       mark.setAttribute(MARK, match.technique.id);
       mark.style.cssText = `background:transparent;color:inherit;text-decoration-line:underline;text-decoration-style:solid;text-decoration-color:${colour(match.technique)};text-decoration-thickness:3px;text-underline-offset:3px;cursor:help;`;
       mark.addEventListener("mouseenter", () => show(mark, match.technique));
       mark.addEventListener("focus", () => show(mark, match.technique));
       mark.tabIndex = 0;
       range.surroundContents(mark);
     }
   }
 }
 async function analyseSelection() {
   const snapshot = selectionSnapshot();
   if (!snapshot) return;
   try {
     const matches = await browser.runtime.sendMessage({ type: "DM_MATCH", text: snapshot.text });
     // Keep captured text nodes intact until the new underlines are applied.
     underline(snapshot, matches || []);
     window.getSelection()?.removeAllRanges();
   } catch (error) {
     console.warn("Defeating Manipulation selected-text matcher:", error);
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
   clearMarks(); tooltip.remove(); delete window.__dmPatternHighlighter;
 } };
 analyseSelection();
})();
