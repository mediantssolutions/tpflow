export const API_BASE = 'https://api-production-c98b.up.railway.app';
export const API_PATHS = Object.freeze({ context: '/api/public/surveys/v1/context', submit: '/api/public/surveys/v1/submit' });
export const CHOICES = Object.freeze({
  ease: ['Very easy', 'Easy', 'Neutral', 'Difficult'],
  decision: ['Price', 'Product quality', 'Design', 'Reviews', 'Social media', 'Other'],
  improve: ['Website experience', 'Product information', 'Checkout process', 'Communication / emails', 'Nothing — everything was good']
});
const REWARD_STATUSES = new Set(['pending_review', 'not_offered', 'fulfilled']);

export class SurveyApiError extends Error {
  constructor(status = 0) { super('Survey request could not be completed.'); this.status = status; }
}

// Deliberately accepts the fragment alone. Query parameters are never identity.
export function tokenFromFragment(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const values = params.getAll('invite');
  if (values.length !== 1 || !values[0] || values[0] !== values[0].trim() || values[0].length > 4096) return null;
  return values[0];
}

export function createApi(fetchImpl = globalThis.fetch) {
  return async function request(path, body) {
    if (!Object.values(API_PATHS).includes(path)) throw new SurveyApiError();
    let response;
    try {
      response = await fetchImpl(API_BASE + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body), credentials: 'omit', cache: 'no-store',
        redirect: 'error', referrerPolicy: 'no-referrer'
      });
    } catch { throw new SurveyApiError(); }
    if (!response.ok) throw new SurveyApiError(response.status);
    try { return await response.json(); } catch { throw new SurveyApiError(); }
  };
}

export function validatedAnswers(raw = {}) {
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const errors = {};
  if (!name || name.length > 200) errors.name = 'Please enter your name (up to 200 characters)';
  for (const key of Object.keys(CHOICES)) if (!CHOICES[key].includes(raw[key])) errors[key] = 'Please select an option';
  if (!Number.isInteger(raw.stars) || raw.stars < 1 || raw.stars > 5) errors.stars = 'Please select a rating';
  return { errors, answers: { name, ease: raw.ease, decision: raw.decision, improve: raw.improve, stars: raw.stars } };
}

function rewardFrom(value) {
  if (!value || !REWARD_STATUSES.has(value.status) || !(value.description === null || typeof value.description === 'string')) throw new SurveyApiError();
  return { status: value.status, description: value.description };
}
function reviewUrlFrom(value, expected) {
  let url;
  try { url = new URL(value); } catch { throw new SurveyApiError(); }
  if (url.protocol !== 'https:' || !['www.trustpilot.com', 'uk.trustpilot.com', 'trustpilot.com'].includes(url.hostname) || !['/evaluate/' + expected.review_domain, '/review/' + expected.review_domain].includes(url.pathname) || url.search || url.hash || url.username || url.password || url.port) throw new SurveyApiError();
  return url.href;
}
function storeFrom(value, expected) {
  if (!value || value.key !== expected.key || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120) throw new SurveyApiError(400);
  let home;
  try { home = new URL(value.home_url); } catch { throw new SurveyApiError(); }
  const canonical = new URL(expected.home_url);
  if (home.protocol !== 'https:' || home.hostname !== canonical.hostname || home.username || home.password || home.port || home.search || home.hash) throw new SurveyApiError();
  if (typeof value.support_email !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.support_email) || value.support_email.length > 254) throw new SurveyApiError();
  return { key: value.key, name: value.name.trim(), home_url: home.href, support_email: value.support_email, review_url: reviewUrlFrom(value.review_url, expected) };
}
const invalidHelp = 'This invitation cannot be used. Please open the survey from your invitation email, or contact the store for help.';
const retryHelp = 'We could not save your feedback. Your answers are still here. Please try again.';

export function createSurveyController({ expectedStore, inviteToken, api = createApi(), onState }) {
  let phase = 'preview';
  let currentStore = expectedStore;
  let reward = null;
  let inFlight = null;
  let disposed = false;
  const emit = (next, extra = {}) => {
    phase = next;
    if (!disposed) onState({ phase, store: currentStore, reward, ...extra });
  };
  async function load() {
    if (disposed) return false;
    if (!inviteToken) {
      emit('preview', { notice: 'Please use the link in your survey invitation. This preview cannot be submitted.' });
      return false;
    }
    emit('loading', { notice: 'Checking your invitation…' });
    try {
      const result = await api(API_PATHS.context, { invite_token: inviteToken });
      if (disposed) return false;
      if (result.form_version !== 1 || !['open', 'submitted'].includes(result.status)) throw new SurveyApiError();
      currentStore = storeFrom(result.store, expectedStore);
      reward = rewardFrom(result.reward);
      if (result.status === 'submitted') emit('submitted', { review_url: currentStore.review_url, acknowledged: true });
      else emit('open', { notice: '' });
      return true;
    } catch (error) {
      if (disposed) return false;
      if (error.status >= 400 && error.status < 500) emit('invalid', { notice: invalidHelp });
      else emit('retry_context', { notice: 'We could not check your invitation. Please try again.' });
      return false;
    }
  }
  function submit(raw) {
    if (inFlight) return inFlight;
    if (disposed || phase !== 'open' || !inviteToken) return Promise.resolve(false);
    const { answers, errors } = validatedAnswers(raw);
    if (Object.keys(errors).length) { emit('open', { errors, notice: 'Please complete all five questions.' }); return Promise.resolve(false); }
    emit('submitting', { notice: 'Submitting…' });
    inFlight = (async () => {
      try {
        const result = await api(API_PATHS.submit, { invite_token: inviteToken, form_version: 1, answers });
        if (disposed) return false;
        const receiptValid = (typeof result.receipt_id === 'string' && result.receipt_id.length > 0) || (Number.isSafeInteger(result.receipt_id) && result.receipt_id > 0);
        if (result.status !== 'submitted' || !receiptValid) throw new SurveyApiError();
        const nextReward = rewardFrom(result.reward);
        const review = reviewUrlFrom(result.review_url, expectedStore);
        reward = nextReward;
        emit('submitted', { review_url: review, acknowledged: true, newly_submitted: true });
        return true;
      } catch (error) {
        if (disposed) return false;
        if (error.status >= 400 && error.status < 500) emit('invalid', { notice: invalidHelp });
        else emit('open', { notice: retryHelp });
        return false;
      } finally { inFlight = null; }
    })();
    return inFlight;
  }
  return { load, submit, dispose() { disposed = true; }, get phase() { return phase; } };
}
