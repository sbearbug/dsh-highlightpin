import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { composerMaterial } from '../src/client/material.js'
test('material follows the current session composer rather than a fixed theme', () => {
  const dom = new JSDOM('<div data-composer-seat><div id="dock"></div><div data-composer-card style="background-color:rgba(20,30,40,.5);box-shadow:0 2px 8px black;border:1px solid gray;border-radius:24px"></div></div>')
  const dock = dom.window.document.getElementById('dock'), card = dom.window.document.querySelector('[data-composer-card]')
  assert.equal(composerMaterial(dock)['--hlpin-material-bg'], 'rgba(20, 30, 40, 0.5)')
  assert.equal(composerMaterial(dock)['--hlpin-material-radius'], '24px')
  assert.equal(composerMaterial(dock)['--hlpin-material-shadow'], '0 2px 8px black')
  card.style.backgroundColor = 'white'
  assert.equal(composerMaterial(dock)['--hlpin-material-bg'], 'rgb(255, 255, 255)')
  card.remove(); assert.deepEqual(composerMaterial(dock), {})
  dom.window.close()
})
