import { storeForPath } from './stores.js';
import { createSurveyController, tokenFromFragment } from './controller.js';
import { createSurveyView } from './view.js';

const store = storeForPath(window.location.pathname);
if (store) {
  let controller;
  const view = createSurveyView(document, {
    onRetry: () => controller.load(),
    onSubmit: answers => controller.submit(answers)
  });
  function start() {
    controller?.dispose();
    view.reset(store);
    controller = createSurveyController({
      expectedStore: store,
      inviteToken: tokenFromFragment(window.location.hash),
      onState: state => {
        // The original second step is reached only after a successful server ACK.
        if (state.phase === 'submitted' && state.newly_submitted && !window.location.pathname.endsWith('/thankyou.html')) {
          window.location.assign('thankyou.html' + window.location.hash);
          return;
        }
        view.render(state);
      }
    });
    controller.load();
  }
  window.addEventListener('hashchange', start);
  start();
}
