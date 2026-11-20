import assert from "node:assert/strict";
import fs from "node:fs";
import { compilePatternRules, matchText } from "../extension/src/matching-core.mjs";

// PR #28 regression cases are entirely fictional, not a private media dataset.
const catalogue=JSON.parse(fs.readFileSync("extension/techniques.json","utf8"));
const patterns=JSON.parse(fs.readFileSync("extension/patterns.json","utf8"));
const contrasts=JSON.parse(fs.readFileSync("evaluation/four-pattern-contrasts.json","utf8")).cases;
assert.ok(contrasts.length>=49,"Preserve original fictional precision controls");
const rules=compilePatternRules(catalogue,patterns);
const failures=[];
for(const item of contrasts){
 const matches=await matchText(item.text,{techniques:catalogue.techniques,rules});
 const expected=[...new Set(item.expected)].sort();
 const predicted=[...new Set(matches.map(m=>m.technique.id))].sort();
 if(JSON.stringify(expected)!==JSON.stringify(predicted))
  failures.push({id:item.id,expected,predicted,text:item.text});
 for(const m of matches)
  assert.ok(m.start>=0&&m.end>m.start&&m.end<=item.text.length,
   "Source offsets preserved: "+item.id);
}
assert.deepEqual(failures,[],
 "Four revived categories must detect positives without flagging neutral reporting");
const combinations=contrasts.filter(x=>x.expected.length);
const mixed=combinations.filter((_,i)=>i%4===0).slice(0,4)
 .map(x=>x.text).join("\n");
const mixedMatches=await matchText(mixed,{techniques:catalogue.techniques,rules});
assert.deepEqual([...new Set(mixedMatches.map(x=>x.technique.id))].sort(),
 ["appeal_to_fear","cherry_picking","loaded_language","red_herring"],
 "Mixed rhetorical categories must remain independent in context");
console.log("PR #28 rebased: "+contrasts.length+" fictional controls and four-category overlap passed.");
