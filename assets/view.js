const REWARD_LABELS = Object.freeze({ pending_review: 'Pending review', not_offered: 'Not offered', fulfilled: 'Fulfilled' });

export function createSurveyView(document, { onRetry = () => {}, onSubmit = () => {} } = {}) {
  const byId = id => document.getElementById(id);
  const form = byId('surveyForm');
  const controls = [...form.querySelectorAll('input, button')];
  const starButtons = [...byId('starsGroup').querySelectorAll('.star-btn')];
  function clearErrors(errors = {}) {
    for (const key of ['name', 'ease', 'decision', 'improve', 'stars']) {
      const error = byId(key + 'Error');
      error.classList.toggle('is-visible', Boolean(errors[key]));
      if (errors[key]) error.textContent = errors[key];
    }
    byId('nameInput').setAttribute('aria-invalid', String(Boolean(errors.name)));
    byId('starsGroup').setAttribute('aria-invalid', String(Boolean(errors.stars)));
  }
  function setReward(prefix, reward) {
    const section = byId(prefix + 'Reward');
    section.hidden = !reward;
    if (!reward) return;
    byId(prefix + 'RewardStatus').textContent = 'Reward status: ' + REWARD_LABELS[reward.status] + '.';
    const description = byId(prefix + 'RewardDescription');
    description.textContent = reward.description || '';
    description.hidden = !reward.description;
  }
  function updateStore(store) {
    byId('storeName').textContent = store.name;
    document.title = store.name + ' Survey';
    for (const id of ['supportLink', 'completeSupportLink']) {
      byId(id).textContent = store.support_email;
      byId(id).href = 'mailto:' + store.support_email;
    }
    byId('homeLink').href = store.home_url;
    byId('homeLink').textContent = 'Return to ' + store.name;
  }
  starButtons.forEach(button => button.addEventListener('click', () => {
    if (button.disabled) return;
    byId('starsInput').value = button.dataset.stars;
    starButtons.forEach(star => {
      const selected = star === button;
      star.classList.toggle('selected', selected);
      star.setAttribute('aria-pressed', String(selected));
    });
    byId('starsError').classList.remove('is-visible');
    byId('starsGroup').setAttribute('aria-invalid', 'false');
  }));
  byId('retryContext').addEventListener('click', onRetry);
  form.addEventListener('submit', event => {
    event.preventDefault();
    onSubmit({
      name: byId('nameInput').value,
      ease: form.querySelector('input[name="ease"]:checked')?.value,
      decision: form.querySelector('input[name="decision"]:checked')?.value,
      improve: form.querySelector('input[name="improve"]:checked')?.value,
      stars: Number(byId('starsInput').value)
    });
  });
  return {
    reset(store) {
      form.reset();
      starButtons.forEach(button => { button.classList.remove('selected'); button.setAttribute('aria-pressed', 'false'); });
      clearErrors();
      updateStore(store);
      controls.forEach(control => { control.disabled = true; });
      byId('surveyPanel').hidden = false;
      byId('thankYouPanel').hidden = true;
      document.body.classList.remove('survey-complete');
      setReward('form', null);
      setReward('complete', null);
    },
    render(state) {
      updateStore(state.store);
      const completed = state.phase === 'submitted' && state.acknowledged === true;
      byId('surveyPanel').hidden = completed;
      byId('thankYouPanel').hidden = !completed;
      document.body.classList.toggle('survey-complete', completed);
      controls.forEach(control => { control.disabled = state.phase !== 'open'; });
      byId('submitButton').textContent = state.phase === 'submitting' ? 'Submitting…' : 'Submit';
      byId('invitationNotice').textContent = state.notice || '';
      byId('invitationNotice').hidden = !state.notice;
      byId('retryContext').hidden = state.phase !== 'retry_context';
      clearErrors(state.errors);
      setReward('form', state.phase === 'open' || state.phase === 'submitting' ? state.reward : null);
      if (completed) {
        document.title = state.store.name + ' — Thank you';
        byId('completionText').textContent = 'Thank you for sharing your feedback with ' + state.store.name + '. Your survey has been submitted.';
        setReward('complete', state.reward);
        // Owner 2026-11-12: the Trustpilot invite shows for a 4–5 star answer only.
        byId('reviewInvite').hidden = !state.review_url;
        if (state.review_url) byId('reviewLink').href = state.review_url;
        else byId('reviewLink').removeAttribute('href');
        byId('thankYouTitle').focus();
      }
    }
  };
}
