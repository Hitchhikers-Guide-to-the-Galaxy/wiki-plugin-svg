import { openFullscreen } from '@fortyfoxes/wiki-capsule'

// Dangerous element tags — stripped entirely from SVG capsules.
// foreignObject is NOT in this list — Mermaid 11 uses it for labels.
// Its HTML content is sanitised separately in sanitizeElement.
const STRIP_TAGS = new Set([
  'script', 'iframe', 'object', 'embed', 'form',
  'input', 'button', 'select', 'textarea', 'meta', 'link',
])

// Attribute names that are unsafe (inline event handlers + JS hrefs)
export const isDangerousAttr = (name, value) => {
  if (/^on[a-z]/i.test(name)) return true
  if ((name === 'href' || name === 'xlink:href') && /^\s*javascript:/i.test(value)) return true
  return false
}

// Attribute names that allow external URLs — blocked on <use> and <image>
const REMOTE_HREF_TAGS = new Set(['use', 'image', 'feimage'])

export const isRemoteHref = (tagName, attrName, value) => {
  if (attrName !== 'href' && attrName !== 'xlink:href') return false
  if (!REMOTE_HREF_TAGS.has(tagName.toLowerCase())) return false
  return /^https?:\/\//i.test(value) || value.startsWith('//')
}

// Strip dangerous HTML from inside a foreignObject (Mermaid label divs etc.)
const sanitizeForeignObject = (fo) => {
  const toRemove = []
  const walkHTML = (node) => {
    if (node.nodeType !== 1) return
    if (node.tagName.toLowerCase() === 'script') { toRemove.push(node); return }
    for (const attr of Array.from(node.attributes)) {
      if (/^on[a-z]/i.test(attr.name)) node.removeAttribute(attr.name)
    }
    Array.from(node.children).forEach(walkHTML)
  }
  walkHTML(fo)
  toRemove.forEach(n => n.parentNode?.removeChild(n))
}

// Walk an SVG DOM element, remove dangerous nodes and attributes in place.
// Returns the mutated element (same reference).
export const sanitizeElement = (el) => {
  const toRemove = []
  const walk = (node) => {
    if (node.nodeType !== 1) return // element nodes only
    const tag = node.tagName.toLowerCase().split(':').pop()
    if (STRIP_TAGS.has(tag)) { toRemove.push(node); return }
    // Sanitise foreignObject HTML rather than stripping it (Mermaid 11 uses it for labels)
    if (tag === 'foreignobject') { sanitizeForeignObject(node); return }

    const attrs = Array.from(node.attributes)
    for (const attr of attrs) {
      if (isDangerousAttr(attr.name, attr.value)) node.removeAttribute(attr.name)
      else if (isRemoteHref(node.tagName, attr.name, attr.value)) node.removeAttribute(attr.name)
    }
    Array.from(node.children).forEach(walk)
  }
  walk(el)
  toRemove.forEach(n => n.parentNode && n.parentNode.removeChild(n))
  return el
}

// Parse SVG text in the browser and return a sanitised clone, or null on error.
const parseSVG = (text) => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text.trim(), 'image/svg+xml')
  if (doc.querySelector('parsererror')) return null
  const svg = doc.documentElement
  if (svg.tagName.toLowerCase() !== 'svg') return null
  sanitizeElement(svg)
  return svg
}

// Fullscreen comes from the shared capsule. This file used to carry its own
// byte-identical copy, which is why the backdrop had to be fixed in two places
// and was fixed in one. A capsule carries its own background, so the default
// PAPER card reads as a mount around it.

// Dispatch a data-fedwiki-action from a clicked element.
const dispatchAction = (actionEl, e, $page) => {
  const action = actionEl.dataset.fedwikiAction
  const page = actionEl.dataset.fedwikiPage
  const site = actionEl.dataset.fedwikiSite || undefined
  if (action !== 'open-page' || !page) return false
  e.stopPropagation()
  if (window.wiki && window.wiki.doInternalLink) {
    // doInternalLink(title, $page, site): open relative to this page
    // (shift-click → new column), resolving the slug locally instead of ghosting.
    window.wiki.doInternalLink(page, e.shiftKey ? null : $page, site || null)
  } else {
    const slug = page.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const href = site ? `http://${site}/${slug}.html` : `/${slug}.html`
    window.open(href, '_blank')
  }
  return true
}

export const emit = (div, item) => {
  const text = item.text || ''
  if (!text.trim()) {
    div.html('<p class="svg-hint" style="padding:8px;color:#999;font-style:italic;">Paste SVG source into the item text.</p>')
    return
  }

  const svg = parseSVG(text)
  if (!svg) {
    div.html('<p class="svg-error" style="padding:8px;color:#c00;">SVG parse error — check the source.</p>')
    return
  }

  // Scale to column width
  svg.setAttribute('width', '100%')
  if (!svg.hasAttribute('viewBox') && svg.hasAttribute('height')) {
    // preserve aspect ratio via viewBox derived from width/height attrs
    const w = parseFloat(svg.getAttribute('width')) || 400
    const h = parseFloat(svg.getAttribute('height')) || 300
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    svg.setAttribute('width', '100%')
  }
  svg.style.display = 'block'

  const capsule = document.createElement('div')
  capsule.className = 'svg-capsule'
  capsule.style.cssText = 'width:100%;overflow:hidden;cursor:zoom-in;'
  capsule.appendChild(svg)

  div[0].appendChild(capsule)
}

export const bind = (div, item) => {
  const capsule = div.find('.svg-capsule')[0]
  if (!capsule) return

  // Single click = navigate (data-fedwiki-action) or fullscreen; double click = edit.
  // Delay fullscreen briefly so a double-click can cancel it and open the editor.
  let clickTimer = null
  capsule.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-fedwiki-action]')
    if (actionEl && dispatchAction(actionEl, e, div.closest('.page'))) return
    if (clickTimer) clearTimeout(clickTimer)
    clickTimer = setTimeout(() => {
      clickTimer = null
      const svgEl = capsule.querySelector('svg')
      if (svgEl) openFullscreen(svgEl)
    }, 250)
  })

  div.on('dblclick', (e) => {
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null }
    e.preventDefault()
    if (window.wiki && window.wiki.textEditor) window.wiki.textEditor(div, item)
  })
}

if (typeof window !== 'undefined') {
  window.plugins = window.plugins || {}
  window.plugins['svg'] = { emit, bind }
}
