import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isDangerousAttr, isRemoteHref } from '../src/client/svg.js'

describe('isDangerousAttr', () => {
  it('flags onclick', () => assert.equal(isDangerousAttr('onclick', ''), true))
  it('flags onmouseover', () => assert.equal(isDangerousAttr('onmouseover', 'x'), true))
  it('flags ON* case-insensitive', () => assert.equal(isDangerousAttr('ONCLICK', ''), true))
  it('flags javascript: href', () => assert.equal(isDangerousAttr('href', 'javascript:alert(1)'), true))
  it('flags javascript: xlink:href', () => assert.equal(isDangerousAttr('xlink:href', ' javascript:void(0)'), true))
  it('passes safe href', () => assert.equal(isDangerousAttr('href', '#anchor'), false))
  it('passes class attr', () => assert.equal(isDangerousAttr('class', 'foo'), false))
  it('passes data-fedwiki-action', () => assert.equal(isDangerousAttr('data-fedwiki-action', 'open-page'), false))
})

describe('isRemoteHref', () => {
  it('blocks http href on <use>', () => assert.equal(isRemoteHref('use', 'href', 'https://evil.com/sprite.svg#icon'), true))
  it('blocks http xlink:href on <image>', () => assert.equal(isRemoteHref('image', 'xlink:href', 'http://example.com/img.png'), true))
  it('blocks protocol-relative href on <feImage>', () => assert.equal(isRemoteHref('feImage', 'href', '//cdn.example.com/x.svg'), true))
  it('allows local href on <use>', () => assert.equal(isRemoteHref('use', 'href', '#icon'), false))
  it('allows href on non-use elements', () => assert.equal(isRemoteHref('a', 'href', 'https://example.com'), false))
  it('ignores non-href attrs', () => assert.equal(isRemoteHref('use', 'class', 'https://example.com'), false))
})
