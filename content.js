(() => {
  if (window.__dmPatternHighlighter) return;
  const MARK = "data-dm-pattern-highlight";
  let tooltip;
  const colour = id => {
    let hash=0; for(const c of id) hash=(hash*31+c.charCodeAt(0))>>>0;
    return `hsl(${195+hash%21} 78% 86%)`;
  };
  function makeTooltip() {
    tooltip=document.createElement("div");
    Object.assign(tooltip.style,{position:"fixed",zIndex:"2147483647",display:"none",maxWidth:"340px",padding:"12px 14px",borderRadius:"8px",background:"#102b46",color:"#f4fbff",boxShadow:"0 5px 24px #0005",font:"14px/1.45 system-ui,sans-serif",pointerEvents:"auto"});
    document.documentElement.appendChild(tooltip);
  }
  function showTooltip(mark,technique,score) {
    tooltip.replaceChildren();
    const title=document.createElement("strong"); title.textContent=technique.title;
    const summary=document.createElement("div"); summary.textContent=technique.summary; summary.style.margin="6px 0 8px";
    const link=document.createElement("a"); link.textContent="Read the full explanation";
    link.href=`https://mikemayne.github.io/defeating-manipulation/techniques/${encodeURIComponent(technique.id)}.html`;
    link.target="_blank"; link.rel="noopener noreferrer"; link.style.color="#7ee4e7";
    tooltip.append(title,summary,link);
    const rect=mark.getBoundingClientRect(); tooltip.style.display="block";
    tooltip.style.left=Math.min(Math.max(8,rect.left),window.innerWidth-350)+"px";
    tooltip.style.top=rect.bottom+tooltip.offsetHeight+8<window.innerHeight?rect.bottom+8:Math.max(8,rect.top-tooltip.offsetHeight-8)+"px";
  }
  function eligible(node) {
    const p=node.parentElement;
    return !!p && !p.closest("script,style,noscript,textarea,input,select,option,button,code,pre,svg,mark,[contenteditable=true]");
  }
  function markMatches(node,matches) {
    if(!node.isConnected || !matches.length) return;
    const source=node.nodeValue, chosen=matches.filter(m=>m.start>=0&&m.end<=source.length&&m.end>m.start).sort((a,b)=>a.start-b.start);
    if(!chosen.length) return;
    const fragment=document.createDocumentFragment(); let cursor=0;
    for(const match of chosen) {
      if(match.start<cursor) continue;
      if(match.start>cursor) fragment.append(document.createTextNode(source.slice(cursor,match.start)));
      const mark=document.createElement("mark"); mark.setAttribute(MARK,match.technique.id);
      mark.textContent=source.slice(match.start,match.end);
      mark.style.cssText=`background:${colour(match.technique.id)};color:#102b46;border-radius:2px;padding:0 1px;cursor:help;`;
      mark.addEventListener("mouseenter",()=>showTooltip(mark,match.technique,match.score));
      mark.addEventListener("focus",()=>showTooltip(mark,match.technique,match.score));
      mark.tabIndex=0; fragment.append(mark); cursor=match.end;
    }
    if(cursor<source.length) fragment.append(document.createTextNode(source.slice(cursor)));
    if(cursor>0) node.parentNode.replaceChild(fragment,node);
  }
  async function start() {
    makeTooltip();
    const walker=document.createTreeWalker(document.body||document.documentElement,NodeFilter.SHOW_TEXT);
    const nodes=[]; while(walker.nextNode()) if(eligible(walker.currentNode)) nodes.push(walker.currentNode);
    for(const node of nodes) {
      if(!node.isConnected) continue;
      const text=node.nodeValue;
      if(text.trim().length<20) continue;
      try {
        const matches=await browser.runtime.sendMessage({type:"DM_MATCH",text});
        markMatches(node,matches||[]);
      } catch(error) { console.warn("Defeating Manipulation local matcher:",error); }
    }
    document.addEventListener("mouseover",event=>{
      if(!event.target.closest?.("mark["+MARK+"]")&&!tooltip?.contains(event.target)) tooltip.style.display="none";
    },true);
    document.addEventListener("keydown",event=>{if(event.key==="Escape"&&tooltip)tooltip.style.display="none";});
  }
  window.__dmPatternHighlighter={disable(){
    document.querySelectorAll("mark["+MARK+"]").forEach(mark=>mark.replaceWith(document.createTextNode(mark.textContent)));
    if(tooltip)tooltip.remove(); delete window.__dmPatternHighlighter;
  }};
  start().catch(error=>console.warn("Defeating Manipulation highlighter:",error));
})();
