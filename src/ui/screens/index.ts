import type { App } from '../app';
import { combatScreen, handsModal, tutorialModal } from './combat';
import { casinoScreen, mysteryModal, paytableModal, scratchModal } from './casino';
import { achievementsScreen, charScreen, codexScreen, endScreen, settingsScreen, titleScreen } from './menus';
import { eventScreen, mapScreen, restScreen, rewardScreen, runModals, shopScreen } from './run';

export function renderScreen(app: App): string {
  const ui = app.ui;
  if (ui.page === 'title') return titleScreen(app);
  if (ui.page === 'charselect') return charScreen(app);
  if (ui.page === 'codex') return codexScreen(app);
  if (ui.page === 'achievements') return achievementsScreen(app);
  if (ui.page === 'settings') return settingsScreen(app);
  const run = app.run;
  if (!run) return titleScreen(app);
  let body = '';
  switch (run.screen) {
    case 'combat':
      if (run.combat && !app.meta.tutorialDone && ui.tut === 0 && !run.flags.tutorialSeen) { ui.tut = 1; run.flags.tutorial = 1; run.flags.tutorialSeen = 1; }
      body = run.combat ? combatScreen(app) : mapScreen(app);
      break;
    case 'map': body = mapScreen(app); break;
    case 'reward': body = rewardScreen(app); break;
    case 'shop': body = shopScreen(app); break;
    case 'casino': body = casinoScreen(app); break;
    case 'event': body = eventScreen(app); break;
    case 'rest': body = restScreen(app); break;
    case 'gameover': case 'victory': return endScreen(app);
    default: body = mapScreen(app);
  }
  if (ui.modal === 'hands' && !run.offer && !run.pending) return body + handsModal(app);
  return body + runModals(app, { paytable: () => paytableModal(app), scratch: () => scratchModal(app), mystery: () => mysteryModal(app) });
}
