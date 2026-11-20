(() => {
 if (window.__dmPatternHighlighter) {
   window.__dmPatternHighlighter.analyseSelection();
   return;
 }
 const MARK = "data-dm-pattern-highlight";
 let activeAnalyses = 0, progressBadge, progressMessage;
 function setProgress(message) {
   if (activeAnalyses && progressMessage) progressMessage.textContent = message;
 }
 function setBusy(busy) {
   activeAnalyses = Math.max(0, activeAnalyses + (busy ? 1 : -1));
   if (busy && activeAnalyses === 1) {
     // A non-blocking progress badge, not a fake percentage or busy pointer.
     progressBadge = document.createElement("div");
     progressBadge.id = "dm-pattern-status";
     progressBadge.setAttribute("role", "status");
     progressBadge.setAttribute("aria-live", "polite");
     Object.assign(progressBadge.style, {
       position: "fixed", bottom: "16px", right: "16px", zIndex: "2147483646",
       padding: "10px 14px", borderRadius: "7px", background: "#102b46",
       color: "#f4fbff", boxShadow: "0 3px 18px #0005",
       font: "13px/1.45 system-ui,sans-serif", pointerEvents: "none",
       minWidth: "185px", maxWidth: "275px"
     });
     progressMessage = document.createElement("div");
     progressMessage.textContent = "Analysing selected text…";
     const bar = document.createElement("progress");
     bar.max = 100; // Missing value makes this indeterminate, not 0%.
     Object.assign(bar.style, { width: "100%", height: "7px",
       marginTop: "5px", accentColor: "#dc2626" });
     progressBadge.append(progressMessage, bar);
     document.documentElement.append(progressBadge);
   } else if (!busy && activeAnalyses === 0) {
     progressBadge?.remove();
     progressBadge = progressMessage = null;
   }
 }

 let tooltip;
 const BLUE = "#2563eb", GREEN = "#16a34a", TURQUOISE = "#12B6CF", RED = "#dc2626";
 const colour = technique => technique.category === "Inconsistency" ? RED :
   technique.category === "Positive" ? GREEN :
   technique.category === "Concealed manipulation" ? TURQUOISE : BLUE;
 // A positive phrase must never visually cover an overlapping negative
 // finding; this is not yet a concealed-manipulation judgement.
 const priority = match => match.kind === "argument_support" ? 5 :
   match.kind === "inconsistency" ? 4 :
   match.kind === "spelling" ? 3.5 :
   match.technique.category === "Concealed manipulation" ? 3 :
   match.technique.category === "Positive" ? 1 : 2;
 const eligible = node => node.parentElement &&
   !node.parentElement.closest("script,style,noscript,textarea,input,select,option,button,code,pre,svg,mark,[contenteditable],#dm-pattern-tooltip,#dm-pattern-status");
 function show(mark, match) {
   const technique = match.technique;
   tooltip.replaceChildren();
   const title = document.createElement("strong");
   title.textContent = technique.title;
   const summary = document.createElement("div");
   summary.textContent = match.kind === "spelling" ?
     "Possible correction bait — don\u2019t take it. Correcting a typo creates engagement; insulting the author may also make people who agree with them defensive. The error may be accidental." :
     technique.summary || "";
   if (match.kind === "inconsistency") {
     const other = document.createElement("div");
     other.textContent = "Conflicting passage: “" + match.otherText + "”";
     other.style.cssText = "margin-top:8px;padding:7px;border-left:3px solid #f87171;";
     summary.append(other);
   } else if (match.kind === "argument_support") {
     const evidence = document.createElement("div");
     evidence.textContent = "Premises provided: “" + match.otherText + "”";
     evidence.style.cssText = "margin-top:8px;padding:7px;border-left:3px solid #f87171;";
     summary.append(evidence);
   } else if (match.kind === "concealed") {
     const opening = document.createElement("div");
     opening.textContent = "Positive opening: “" + match.positiveText + "”";
     opening.style.cssText = `margin-top:8px;padding:7px;border-left:3px solid ${TURQUOISE};`;
     summary.append(opening);
     if (match.negativePattern) {
       const relation = document.createElement("div");
       relation.textContent = "Related negative pattern: " + match.negativePattern;
       relation.style.marginTop = "7px";
       summary.append(relation);
     }
   }
   summary.style.margin = "6px 0 8px";
   const strength = document.createElement("div");
   strength.textContent = match.kind === "spelling" ? "Spelling: possible error, intent unknown" :
     match.kind === "inconsistency" ? "Inference: possible contradiction" :
     match.kind === "concealed" ? "Relationship: positive wording followed by pressure (check context)" :
     match.kind === "argument_support" ? "Inference: premise-to-conclusion support (check context)" :
     match.method === "pattern" ? "Match: Rule" :
     "Match strength: " + (match.strength || "Low");
   strength.style.cssText = "margin:0 0 8px;font-size:12px;color:#b5d0e5;";
   strength.title = "Match strength is an experimental estimate, not the probability that the text is manipulative.";
   const link = document.createElement("a");
   link.textContent = "Read the full explanation";
   link.href = `https://mikemayne.github.io/defeating-manipulation/${technique.category === "Positive" ? "positive-patterns" : technique.category === "Inconsistency" ? "inconsistency-patterns" : "techniques"}/${encodeURIComponent(technique.id)}.html`;
   link.target = "_blank";
   link.rel = "noopener noreferrer";
   link.style.color = "#7ee4e7";
   tooltip.append(title, summary, strength);
   if (match.kind !== "inconsistency" && match.kind !== "concealed") tooltip.append(link);
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
   // Resolve overlaps before wrapping DOM ranges; red has priority.
   const valid = matches.filter(m => m.start >= 0 && m.end > m.start && m.end <= snapshot.text.length);
   const edges = [...new Set(valid.flatMap(m => [m.start, m.end]))].sort((a, b) => a - b);
   const spans = [];
   for (let i = 0; i + 1 < edges.length; i++) {
     const start = edges[i], end = edges[i + 1];
     const candidates = valid.filter(m => m.start <= start && m.end >= end)
       .sort((a, b) => priority(b) - priority(a) ||
         (b.score || 0) - (a.score || 0));
     if (candidates.length) spans.push({ ...candidates[0], start, end });
   }
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
       mark.addEventListener("mouseenter", () => show(mark, match));
       mark.addEventListener("focus", () => show(mark, match));
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
   maxWidth: "340px", maxHeight: "60vh", overflowY: "auto", padding: "12px 14px", borderRadius: "8px", background: "#102b46",
   color: "#f4fbff", boxShadow: "0 5px 24px #0005", font: "14px/1.45 system-ui,sans-serif",
   pointerEvents: "auto" });
 document.documentElement.append(tooltip);
 document.addEventListener("mouseover", event => {
   if (!event.target.closest?.("mark[" + MARK + "]") && !tooltip.contains(event.target))
     tooltip.style.display = "none";
 }, true);
 browser.runtime.onMessage.addListener(message => {
   if (message?.type === "DM_PROGRESS" && typeof message.message === "string")
     setProgress(message.message);
 });
 document.addEventListener("keydown", event => {
   if (event.key === "Escape") tooltip.style.display = "none";
 });
 window.__dmPatternHighlighter = { analyseSelection, disable() {
   clearMarks(); tooltip.remove(); activeAnalyses = 1; setBusy(false); delete window.__dmPatternHighlighter;
 } };
 analyseSelection();
})();
