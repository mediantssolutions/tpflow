import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurveyController, createApi, API_PATHS, API_BASE, tokenFromFragment, SurveyApiError } from '../assets/controller.js';
import { STORES, ROUTES, storeForPath } from '../assets/stores.js';
const store = STORES.nosura;
const reward = { status: 'pending_review', description: null };
const reviewUrl = 'https://www.trustpilot.com/evaluate/nonali.com';
const context = (overrides = {}) => ({ form_version: 1, status: 'open', reward, store: { ...store, review_url: reviewUrl }, ...overrides });
const receipt = (overrides = {}) => ({ status: 'submitted', receipt_id: 'offline-receipt', reward, review_url: reviewUrl, ...overrides });
const answers = stars => ({ name: 'Offline QA', ease: 'Easy', decision: 'Design', improve: 'Product information', stars });
function setup(api, token = 'offline-only-not-a-real-invitation') {
  const states = [];
  const controller = createSurveyController({ expectedStore: store, inviteToken: token, api, onState: state => states.push(state) });
  return { controller, states };
}

test('fragment-only identity rejects missing/duplicate invite and ignores query identity', async () => {
  assert.equal(tokenFromFragment(''), null);
  assert.equal(tokenFromFragment('#other=value'), null);
  assert.equal(tokenFromFragment('#invite=a&invite=b'), null);
  assert.equal(tokenFromFragment('#invite=%20a'), null);
  assert.equal(tokenFromFragment('#invite=opaque.signed-token'), 'opaque.signed-token');
  let calls = 0;
  const { controller, states } = setup(() => { calls++; }, null);
  await controller.load();
  await controller.submit(answers(5));
  assert.equal(calls, 0);
  assert.equal(controller.phase, 'preview');
  assert.equal(states.at(-1).acknowledged, undefined);
});

test('all eight routes and five aliases resolve the expected store, including both page steps', () => {
  assert.equal(Object.keys(ROUTES).length, 13);
  for (const [slug, key] of Object.entries(ROUTES)) {
    for (const suffix of ['/', '/index.html', '/thankyou.html']) assert.equal(storeForPath('/' + slug + suffix).key, key);
  }
  assert.equal(storeForPath('/unknown/'), null);
  assert.equal(storeForPath('/nonali/other/file.html'), null);
});

test('transport has two fixed POST endpoints and never puts invitation in URL/referrer/cookies', async () => {
  const calls = [];
  const request = createApi(async (...args) => { calls.push(args); return { ok: true, json: async () => ({ ok: true }) }; });
  await request(API_PATHS.context, { invite_token: 'offline-token' });
  const [url, init] = calls[0];
  assert.equal(url, API_BASE + API_PATHS.context);
  assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.referrerPolicy, 'no-referrer');
  assert.equal(init.redirect, 'error');
  assert.equal(init.cache, 'no-store');
  assert.equal(JSON.parse(init.body).invite_token, 'offline-token');
  assert.equal(url.includes('offline-token'), false);
  await assert.rejects(request('https://example.invalid/other', {}));
  assert.equal(calls.length, 1);
});

test('context errors are safe: expired/mismatched invitations cannot submit', async () => {
  for (const api of [async () => { throw new SurveyApiError(410); }, async () => context({ store: { ...STORES.vicancio, review_url: 'https://www.trustpilot.com/evaluate/muupa.com' } })]) {
    const { controller, states } = setup(api);
    await controller.load();
    assert.equal(controller.phase, 'invalid');
    assert.match(states.at(-1).notice, /invitation cannot be used/);
    assert.equal(await controller.submit(answers(5)), false);
    assert.equal(states.some(state => state.phase === 'submitted'), false);
  }
});

test('context network failure stays retryable; a later server context can open the same form', async () => {
  let calls = 0;
  const { controller, states } = setup(async () => { if (++calls === 1) throw new SurveyApiError(503); return context(); });
  await controller.load();
  assert.equal(controller.phase, 'retry_context');
  await controller.load();
  assert.equal(controller.phase, 'open');
  assert.equal(states.some(state => state.acknowledged), false);
});

test('network/5xx submit does not show thanks, preserves retry state, and reuses the same answers', async () => {
  for (const failure of [new SurveyApiError(), new SurveyApiError(503)]) {
    let submits = 0;
    const payloads = [];
    const { controller, states } = setup(async (path, body) => {
      if (path === API_PATHS.context) return context();
      payloads.push(body);
      if (++submits === 1) throw failure;
      return receipt();
    });
    await controller.load();
    assert.equal(await controller.submit(answers(2)), false);
    assert.equal(controller.phase, 'open');
    assert.match(states.at(-1).notice, /answers are still here/);
    assert.equal(states.some(state => state.phase === 'submitted'), false);
    assert.equal(await controller.submit(answers(2)), true);
    assert.deepEqual(payloads[0], payloads[1]);
    assert.equal(controller.phase, 'submitted');
  }
});

test('every rating 1–5 submits exactly once with the same reward; only 4–5 stars get the Trustpilot link', async () => {
  const received = [];
  for (let stars = 1; stars <= 5; stars++) {
    const calls = [];
    // The server sends no link for 1–3 stars (owner 2026-11-12).
    const { controller, states } = setup(async (path, body) => {
      calls.push({ path, body });
      return path === API_PATHS.context ? context() : receipt(stars >= 4 ? {} : { review_url: null });
    });
    await controller.load();
    assert.equal(await controller.submit(answers(stars)), true);
    assert.equal(calls.filter(call => call.path === API_PATHS.submit).length, 1);
    assert.equal(calls.at(-1).body.answers.stars, stars);
    assert.equal(calls.at(-1).body.form_version, 1);
    received.push({ url: states.at(-1).review_url, reward: states.at(-1).reward });
  }
  assert.deepEqual(received.map(result => result.url), [null, null, null, reviewUrl, reviewUrl]);
  assert.ok(received.every(result => JSON.stringify(result.reward) === JSON.stringify(reward)));
});

test('double click and a later resubmit cannot create duplicate client requests', async () => {
  let resolveSubmit;
  let submits = 0;
  const { controller } = setup(async path => {
    if (path === API_PATHS.context) return context();
    submits++;
    return new Promise(resolve => { resolveSubmit = resolve; });
  });
  await controller.load();
  const first = controller.submit(answers(1));
  const second = controller.submit(answers(1));
  assert.equal(first, second);
  assert.equal(submits, 1);
  resolveSubmit(receipt());
  assert.equal(await first, true);
  assert.equal(await controller.submit(answers(5)), false);
  assert.equal(submits, 1);
});

test('already-submitted context shows server-confirmed completion without another submit', async () => {
  let calls = 0;
  const { controller, states } = setup(async () => { calls++; return context({ status: 'submitted', reward: { status: 'fulfilled', description: 'Server-confirmed description' } }); });
  await controller.load();
  assert.equal(controller.phase, 'submitted');
  assert.equal(states.at(-1).acknowledged, true);
  assert.equal(states.at(-1).newly_submitted, undefined);
  assert.equal(await controller.submit(answers(5)), false);
  assert.equal(calls, 1);
});

test('invalid answers and malformed success never become successful feedback', async () => {
  let submits = 0;
  const { controller, states } = setup(async path => { if (path === API_PATHS.context) return context(); submits++; return { status: 'submitted' }; });
  await controller.load();
  assert.equal(await controller.submit({ ...answers(5), stars: 0, ease: 'invented choice' }), false);
  assert.equal(submits, 0);
  assert.ok(states.at(-1).errors.stars);
  assert.equal(await controller.submit(answers(5)), false);
  assert.equal(controller.phase, 'open');
  assert.equal(states.some(state => state.acknowledged), false);
});

test('token/store changes dispose stale responses and forbid review redirects with a selected rating', async () => {
  let resolveContext;
  const { controller, states } = setup(() => new Promise(resolve => { resolveContext = resolve; }));
  const pending = controller.load();
  controller.dispose();
  resolveContext(context());
  await pending;
  assert.equal(states.some(state => state.phase === 'open' || state.phase === 'submitted'), false);
  const bad = setup(async path => path === API_PATHS.context ? context() : receipt({ review_url: reviewUrl + '?stars=5' }));
  await bad.controller.load();
  assert.equal(await bad.controller.submit(answers(5)), false);
  assert.equal(bad.controller.phase, 'open');
});

test('server-authorized official review/evaluate routes work without rating-prefill parameters', async () => {
  for (const target of ['https://www.trustpilot.com/review/nonali.com', 'https://uk.trustpilot.com/evaluate/nonali.com', 'https://trustpilot.com/review/nonali.com']) {
    const { controller, states } = setup(async path => path === API_PATHS.context ? context({ store: { ...store, review_url: target } }) : receipt({ review_url: target }));
    await controller.load();
    assert.equal(controller.phase, 'open');
    assert.equal(await controller.submit(answers(5)), true);
    assert.equal(states.at(-1).review_url, target);
  }
});

test('an older server that sends the link for every rating still shows it for 4–5 stars only', async () => {
  const received = [];
  for (let stars = 1; stars <= 5; stars++) {
    const { controller, states } = setup(async path => path === API_PATHS.context ? context() : receipt());
    await controller.load();
    assert.equal(await controller.submit(answers(stars)), true);
    received.push(states.at(-1).review_url);
  }
  assert.deepEqual(received, [null, null, null, reviewUrl, reviewUrl]);
});

test('reopening a submitted invitation shows the link only when the server says so', async () => {
  for (const [given, shown] of [[reviewUrl, reviewUrl], [null, null], [undefined, null]]) {
    const { controller, states } = setup(async () => context({ status: 'submitted', review_url: given }));
    assert.equal(await controller.load(), true);
    assert.equal(states.at(-1).phase, 'submitted');
    assert.equal(states.at(-1).review_url, shown);
  }
});

test('a 4–5 star link for another store or with extra parts is refused', async () => {
  const { controller, states } = setup(async path => path === API_PATHS.context ? context() : receipt({ review_url: 'https://www.trustpilot.com/evaluate/muupa.com' }));
  await controller.load();
  assert.equal(await controller.submit(answers(5)), false);
  assert.notEqual(states.at(-1).phase, 'submitted');
});

test('Selzari (was Nonali): its own route, and the old /nonali/ and /nosu/ invitation links, open the same store', () => {
  for (const slug of ['selzari', 'nonali', 'nosu']) assert.equal(storeForPath('/' + slug + '/').key, 'nosura');
  assert.equal(STORES.nosura.name, 'Selzari');
  assert.equal(STORES.nosura.support_email, 'support@selzari.com');
});

test('Selzari accepts its own home host with or without www and the old nonali.com one, nothing else', async () => {
  for (const home of ['https://selzari.com', 'https://www.selzari.com/', 'https://nonali.com', 'https://www.nonali.com/']) {
    const { controller } = setup(async () => context({ store: { ...store, home_url: home, review_url: reviewUrl } }));
    assert.equal(await controller.load(), true, home);
    assert.equal(controller.phase, 'open', home);
  }
  for (const home of ['https://muupa.com', 'https://selzari.com.evil.example', 'http://selzari.com']) {
    const { controller } = setup(async () => context({ store: { ...store, home_url: home, review_url: reviewUrl } }));
    await controller.load();
    assert.notEqual(controller.phase, 'open', home);
  }
});

test('Selzari review links may name its Trustpilot page on selzari.com or the older nonali.com one', async () => {
  for (const target of ['https://www.trustpilot.com/evaluate/selzari.com', 'https://www.trustpilot.com/evaluate/nonali.com']) {
    const { controller, states } = setup(async path => path === API_PATHS.context ? context({ store: { ...store, review_url: target } }) : receipt({ review_url: target }));
    await controller.load();
    assert.equal(await controller.submit(answers(5)), true, target);
    assert.equal(states.at(-1).review_url, target);
  }
});

