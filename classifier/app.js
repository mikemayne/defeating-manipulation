import { loadClassifier, loadManifest } from './inference.js';

const form = document.querySelector('form');
const phrase = document.querySelector('#phrase');
const topic = document.querySelector('#topic');
const select = document.querySelector('#model');
const button = document.querySelector('#analyse');
const status = document.querySelector('#status');
const timing = document.querySelector('#timing');
const scores = document.querySelector('#scores');
const titles = { match: 'Patterns detected', no_match: 'No match in the supported catalogue',
  insufficient_context: 'Insufficient context' };

let manifest;
let classifier;
let loadedName;
try {
  manifest = await loadManifest();
  for (const model of manifest.models) select.add(new Option(model.name, model.name));
  select.value = manifest.defaultModel;
  button.disabled = false;
  status.textContent = 'Ready';
} catch (error) {
  status.textContent = error.message;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  button.disabled = true;
  scores.replaceChildren();
  timing.textContent = '';
  try {
    const name = select.value;
    if (name !== loadedName) {
      status.textContent = 'Loading encoder…';
      await classifier?.release();
      classifier = null;
      loadedName = null;
      classifier = await loadClassifier(manifest, name);
      loadedName = name;
    }
    const start = performance.now();
    const result = await classifier.analyse(phrase.value, topic.value);
    timing.textContent = Math.round(performance.now() - start) + ' ms';
    status.textContent = titles[result.status];
    for (const label of result.scores.sort((a, b) => b.score - a.score)) {
      const item = document.createElement('li');
      item.textContent = label.title + ' · ' + Math.round(label.score * 100) + '%' +
        (label.detected ? ' · detected' : '');
      item.title = label.summary;
      scores.append(item);
    }
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
