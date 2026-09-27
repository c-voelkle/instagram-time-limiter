'use strict';

// Depends on shared.js. Shown in place of a limited site once the daily limit
// or curfew applies.

const reason = new URLSearchParams(location.search).get('reason');
const scene = BLOCK_SCENES[reason] || BLOCK_SCENES.limit;

document.title = scene.title;
document.querySelector('.emoji').textContent = scene.emoji;
document.getElementById('title').textContent = scene.title;
document.getElementById('text').textContent = scene.text;

const floaters = document.querySelector('.floaters');
for (let i = 0; i < 24; i++) {
  const span = document.createElement('span');
  span.textContent = scene.floaters[i % scene.floaters.length];
  span.style.left = `${(i * 41 + 7) % 100}%`;
  span.style.fontSize = `${18 + ((i * 13) % 26)}px`;
  span.style.animationDuration = `${9 + ((i * 7) % 8)}s`;
  span.style.animationDelay = `-${(i * 1.7) % 12}s`;
  floaters.appendChild(span);
}
