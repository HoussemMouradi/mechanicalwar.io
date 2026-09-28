import { loadProfile, saveProfile, loadSettings, saveSettings, QUALITY } from './config.js';
import { Menu } from './menu.js';
import { Game } from './game.js';
import { audio } from './audio.js';

const $ = id => document.getElementById(id);
const settings = loadSettings();
const profile = loadProfile();
let game = null;

const menu = new Menu(profile, startGame);
window.mw = { get game() { return game; }, menu, settings };

function startGame(p) {
  try {
    launch(p);
  } catch (err) {
    console.error(err);
    $('loading').classList.add('hide');
    $('failedText').textContent = 'Something broke while starting: ' + (err?.message || err);
    $('failed').classList.remove('hide');
  }
}

function launch(p) {
  saveProfile(p);
  menu.dispose();
  $('menu').classList.add('hide');
  $('loading').classList.remove('hide');
  $('loadingText').textContent = 'Building the office...';
  game = new Game({
    profile: p,
    settings,
    onStatus: text => {
      if (text) $('loadingText').textContent = text;
      else $('loading').classList.add('hide');
    },
    onFail: reason => {
      $('loading').classList.add('hide');
      $('failedText').textContent = reason;
      $('failed').classList.remove('hide');
      game?.leave();
    },
    onPauseChange: paused => {
      $('pause').classList.toggle('hide', !paused || !$('settings').classList.contains('hide'));
    },
  });
  // start() builds the renderer synchronously, so pointer lock can still use the PLAY click gesture.
  const started = game.start().catch(err => {
    console.error(err);
    $('loading').classList.add('hide');
    $('failedText').textContent = 'Something broke while loading: ' + (err?.message || err);
    $('failed').classList.remove('hide');
  });
  game.lock();
  window.mw.started = started;
}

$('resume').addEventListener('click', () => { $('pause').classList.add('hide'); game?.lock(); });
$('quit').addEventListener('click', () => { game?.leave(); location.reload(); });
$('failedBack').addEventListener('click', () => location.reload());

/* ---------- settings ---------- */
const fields = {
  sens: ['sensitivity', v => v.toFixed(2) + 'x'],
  fov: ['fov', v => v + '\u00b0'],
  vol: ['volume', v => Math.round(v * 100) + '%'],
};
function syncSettingsUI() {
  for (const [id, [key, fmt]] of Object.entries(fields)) {
    $(id).value = settings[key];
    $(id + 'Out').textContent = fmt(Number(settings[key]));
  }
  $('quality').value = settings.quality;
  $('qualityNote').textContent = game ? 'Quality changes apply the next time you enter the office.' : '';
}
for (const [id, [key, fmt]] of Object.entries(fields)) {
  $(id).addEventListener('input', () => {
    settings[key] = Number($(id).value);
    $(id + 'Out').textContent = fmt(settings[key]);
    saveSettings(settings);
    audio.setVolume(settings.volume);
    game?.applySettings(settings);
  });
}
$('quality').addEventListener('change', () => {
  if (QUALITY[$('quality').value]) settings.quality = $('quality').value;
  saveSettings(settings);
});
function openSettings() {
  syncSettingsUI();
  $('pause').classList.add('hide');
  $('settings').classList.remove('hide');
}
$('openSettings').addEventListener('click', openSettings);
$('pauseSettings').addEventListener('click', openSettings);
$('closeSettings').addEventListener('click', () => {
  $('settings').classList.add('hide');
  if (game) $('pause').classList.remove('hide');
});
