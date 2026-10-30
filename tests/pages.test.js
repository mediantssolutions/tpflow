import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ROUTES } from '../assets/stores.js';
const labels = ["Q1. What's your name? (Same as used when placing the order)", 'Q2. How easy was it to place your order?', 'Q3. What made you decide to buy from us?', 'Q4. Is there anything we could improve?', 'Q5. How many stars would you give this experience?'];

test('all twelve routes contain exact original five questions, disabled preview, no-referrer and ACK-only success', async () => {
  for (const slug of Object.keys(ROUTES)) {
    const html = await readFile(new URL('../' + slug + '/index.html', import.meta.url), 'utf8');
    assert.equal((html.match(/class="question-label"/g) || []).length, 5);
    for (const label of labels) assert.ok(html.includes(label), slug + ': ' + label);
    assert.ok(html.includes('name="referrer" content="no-referrer"'));
    assert.ok(html.includes('id="thankYouPanel" class="ty-wrap" hidden'));
    assert.ok(html.includes('<button disabled type="submit"'));
    assert.ok(html.includes('Any survey reward is independent'));
    assert.ok(html.includes('rel="noopener noreferrer"'));
    assert.equal(html.includes('24–48'), false);
    assert.equal(/window\.open|sendBeacon|starRating\s*>=/.test(html), false);
    assert.equal(await readFile(new URL('../' + slug + '/thankyou.html', import.meta.url), 'utf8'), html);
  }
});

test('runtime contains no legacy external delivery, no token query fallback or browser storage', async () => {
  for (const file of ['app.js', 'controller.js', 'stores.js', 'view.js']) {
    const source = await readFile(new URL('../assets/' + file, import.meta.url), 'utf8');
    assert.equal(/discord|webhook|sendBeacon|window\.open|localStorage|sessionStorage|location\.search/i.test(source), false);
  }
});
