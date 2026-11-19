import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const out = path.join(root, '_site');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const config = JSON.parse(read('site-config.json'));
const catalogue = JSON.parse(read('techniques.json'));
const refsData = JSON.parse(read('references.json'));
const repository = config.repository || process.env.GITHUB_REPOSITORY || 'mikemayne/defeating-manipulation';
const [owner, repo] = repository.split('/');
if (!owner || !repo) throw new Error('Repository must be owner/name');
const base = config.siteUrl ? config.siteUrl.replace(/\/$/, '') + '/' : `https://${owner}.github.io/${repo}/`;
fs.rmSync(out, {recursive:true, force:true});
fs.mkdirSync(path.join(out, 'techniques'), {recursive:true});
for (const name of ['index.html','questionnaire.html','techniques.json','positive-patterns.json','references.json','site-config.json','README.md','CONTRIBUTING.txt','CONTENT-LICENSE.txt','LICENSE']) {
  if (fs.existsSync(path.join(root,name))) fs.copyFileSync(path.join(root,name),path.join(out,name));
}
const index = read('index.html')
  .replace('<title>Defeating Manipulation</title>', `<title>${esc(config.title)}</title>`)
  .replace('<h1>Understand how the message works.</h1>', `<h1>${esc(config.heroHeading)}</h1>`)
  .replace('<p>Online writing can shape what we notice, how we interpret events and what we feel compelled to do. Learn to recognise the techniques, inspect the evidence and make up your own mind.</p>', `<p>${esc(config.heroLead)}</p>`);
fs.writeFileSync(path.join(out,'index.html'),index);
const links = [];
for (const t of catalogue.techniques) {
  if (!/^[a-z0-9_-]+$/.test(t.id)) throw new Error('Unsafe technique id: '+t.id);
  const file = `techniques/${t.id}.html`;
  links.push(base+file);
  const featureList = (t.observable_features || []).map(x => '<li>'+esc(x)+'</li>').join('');
  const refs = (t.references || []).map(id => refsData.references.find(r => r.id === id)).filter(Boolean).map(r => '<li><a href="'+esc(r.url)+'">'+esc(r.title)+'</a> ('+esc(r.year)+')</li>').join('');
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${esc(t.summary)}"><title>${esc(t.title)} — Defeating Manipulation</title><style>body{max-width:780px;margin:50px auto;padding:0 22px;font:17px/1.7 system-ui;background:#f7f6f0;color:#23302d}a{color:#356a60}h1{font:normal clamp(2.5rem,7vw,4rem)/1.1 Georgia}.tag{color:#94502a;text-transform:uppercase;font-size:.75rem;font-weight:800;letter-spacing:.12em}.note{padding:18px;border-left:4px solid #356a60;background:#fffef9}footer{margin-top:50px;border-top:1px solid #ddd;padding-top:20px;color:#606c65;font-size:.9rem}</style></head><body><p><a href="../">← Defeating Manipulation</a></p><p class="tag">${esc(t.category)}</p><h1>${esc(t.title)}</h1><p>${esc(t.summary)}</p><h2>What it is</h2><p>${esc(t.definition || t.summary)}</p><h2>Recognising the pattern</h2><ul>${featureList || '<li>Review the surrounding passage and the wider article before deciding whether the description fits.</li>'}</ul>${t.example ? '<h2>Example</h2><blockquote>'+esc(t.example)+'</blockquote>' : ''}${t.reader_effect ? '<h2>Effect on the reader</h2><p>'+esc(t.reader_effect)+'</p>' : ''}<div class="note"><strong>Scope:</strong> this entry describes a textual pattern. It does not establish why the author used it or whether the article's claims are true.</div><h2>Related terms</h2><p>${(t.tags || []).map(esc).join(' · ')}</p><h2>References</h2><ul>${refs || '<li>References for this entry are being developed.</li>'}</ul><footer>Open project · <a href="https://github.com/${esc(repository)}/blob/main/techniques.json">View catalogue source</a></footer></body></html>`;
  fs.writeFileSync(path.join(out,file),page);
}

const positiveCatalogue = JSON.parse(read('positive-patterns.json'));
fs.mkdirSync(path.join(out, 'positive-patterns'), {recursive:true});
const positiveLinks = [];
for (const p of positiveCatalogue.patterns) {
  if (!/^[a-z0-9_-]+$/.test(p.id)) throw new Error('Unsafe positive pattern id: '+p.id);
  const file = `positive-patterns/${p.id}.html`;
  positiveLinks.push(base+file);
  const features = (p.observable_features || []).map(x => '<li>'+esc(x)+'</li>').join('');
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${esc(p.summary)}"><title>${esc(p.title)} — Positive communication patterns</title><style>body{max-width:780px;margin:50px auto;padding:0 22px;font:17px/1.7 system-ui;background:#e4f6e7;color:#173d24}a{color:#26743a}h1{font:normal clamp(2.5rem,7vw,4rem)/1.1 Georgia}.tag{color:#26743a;text-transform:uppercase;font-size:.75rem;font-weight:800;letter-spacing:.12em}.note{padding:18px;border-left:4px solid #39844b;background:#f3fff4}footer{margin-top:50px;border-top:1px solid #a8d5b0;padding-top:20px;color:#315d3b;font-size:.9rem}</style></head><body><p><a href="../">← All pattern libraries</a></p><p class="tag">${esc(p.category)}</p><h1>${esc(p.title)}</h1><p>${esc(p.summary)}</p><h2>What it is</h2><p>${esc(p.definition || p.summary)}</p><h2>Recognising the pattern</h2><ul>${features}</ul>${p.example ? '<h2>Example</h2><blockquote>'+esc(p.example)+'</blockquote>' : ''}${p.reader_effect ? '<h2>Why it helps</h2><p>'+esc(p.reader_effect)+'</p>' : ''}<div class="note"><strong>Scope:</strong> this entry describes a constructive communication behaviour. A phrase alone does not establish that the wider interaction is positive; consider its context and whether the behaviour is sustained.</div><footer>Positive communication patterns · <a href="https://github.com/${esc(repository)}/blob/main/positive-patterns.json">View library source</a></footer></body></html>`;
  fs.writeFileSync(path.join(out,file),page);
}
if (positiveCatalogue.patterns.length < 1) throw new Error('Positive pattern library must not be empty');
const positiveIds = new Set();
for (const p of positiveCatalogue.patterns) {
  if (positiveIds.has(p.id)) throw new Error('Duplicate positive pattern id: '+p.id);
  positiveIds.add(p.id);
  if (!p.title || !p.summary || !Array.isArray(p.tags)) throw new Error('Incomplete positive pattern: '+p.id);
}

const sitemap = [base,base+'questionnaire.html',base+'techniques.json',base+'positive-patterns.json',...links,...positiveLinks].map(u=>'<url><loc>'+esc(u)+'</loc></url>').join('');
fs.writeFileSync(path.join(out,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemap}</urlset>`);
fs.writeFileSync(path.join(out,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${base}sitemap.xml\n`);
fs.writeFileSync(path.join(out,'llms.txt'),`# ${config.title}\n\n${config.description}\n\n- Catalogue: ${base}techniques.json\n- Questionnaire: ${base}questionnaire.html\n- Source: https://github.com/${repository}\n`);
if (catalogue.techniques.length < 1) throw new Error('Catalogue must not be empty');
const ids = new Set();
for (const t of catalogue.techniques) {
  if (ids.has(t.id)) throw new Error('Duplicate technique id: '+t.id);
  ids.add(t.id);
  if (!t.title || !t.summary || !Array.isArray(t.tags)) throw new Error('Incomplete technique: '+t.id);
}
console.log(`Built ${catalogue.techniques.length} technique pages in _site for ${repository}`);
