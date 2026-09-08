import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseText } from '../src/client/svg.js'

test('raw source is inline', () => {
  assert.equal(parseText('<svg viewBox="0 0 1 1"></svg>').mode, 'inline')
  assert.equal(parseText('  <?xml version="1.0"?><svg/>').mode, 'inline')
})
test('a SRC line names a url and keeps the caption', () => {
  const s = parseText('SRC https://a/b.svg\nThe map of everything.')
  assert.equal(s.mode, 'src'); assert.equal(s.src, 'https://a/b.svg')
  assert.deepEqual(s.caption, ['The map of everything.'])
})
test('relative urls work, and empty or unknown text is refused', () => {
  assert.equal(parseText('SRC /assets/x/y.svg').src, '/assets/x/y.svg')
  assert.equal(parseText('').mode, 'empty')
  assert.equal(parseText('just some words').mode, 'unknown')
})
