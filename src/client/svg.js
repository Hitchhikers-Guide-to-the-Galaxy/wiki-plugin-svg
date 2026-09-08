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

// Item text is either raw SVG source (anything starting with "<") or a small
// DSL whose only command today is SRC, naming a URL to fetch. The fetched text
// goes through the same parser and sanitiser, so a remote map is the same DOM
// as a pasted one — clicks, fullscreen and open-page all behave identically.
export const parseText = (text) => {
  const t = (text || '').trim()
  if (!t) return { mode: 'empty' }
  if (t.startsWith('<')) return { mode: 'inline', source: t }
  const spec = { mode: 'src', src: '', caption: [] }
  for (const raw of t.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^([A-Z]+):?\s+(.*)$/)
    if (m && m[1] === 'SRC') spec.src = m[2].trim()
    else spec.caption.push(line)
  }
  return spec.src ? spec : { mode: 'unknown' }
}

// Prepare a parsed SVG for the column and put it in the capsule.
const place = (capsule, source) => {
  const svg = parseSVG(source)
  if (!svg) return false
  svg.setAttribute('width', '100%')
  if (!svg.hasAttribute('viewBox') && svg.hasAttribute('height')) {
    const w = parseFloat(svg.getAttribute('width')) || 400
    const h = parseFloat(svg.getAttribute('height')) || 300
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    svg.setAttribute('width', '100%')
  }
  svg.style.display = 'block'
  capsule.textContent = ''
  capsule.appendChild(svg)
  return true
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const note = (el, text, colour) => {
  el.innerHTML = `<p style="padding:8px;color:${colour};font-style:italic;margin:0;">${esc(text)}</p>`
}

// An item that cannot render must still say which plugin it is, what it was
// given, and how to open it. An uneditable error is an item nobody can fix.
const problem = (div, message, text) => {
  const raw = (text || '').trim()
  const head = raw.split('\n')[0].slice(0, 90)
  div.html(`<div class="svg-error" style="padding:8px;color:#c00;">
  <b>svg plugin</b> — ${esc(message)}
  ${head ? `<div style="color:#666;font-family:ui-monospace,Menlo,monospace;font-size:11px;margin-top:4px;word-break:break-all;">${esc(head)}${raw.length > head.length ? ' …' : ''}</div>` : '<div style="color:#666;font-size:11px;margin-top:4px;">the item is empty</div>'}
  <div style="color:#999;font-size:11px;margin-top:6px;">double-click to edit · expects SVG source, or <code>SRC</code> followed by a URL</div>
</div>`)
}

export const emit = (div, item) => {
  const spec = parseText(item.text)
  if (spec.mode === 'empty') {
    problem(div, 'nothing to draw', '')
    return
  }
  if (spec.mode === 'unknown') {
    problem(div, 'the text is neither SVG source nor a SRC line', item.text)
    return
  }

  // The capsule exists before any fetch returns, so bind() always finds it and
  // its delegated handlers cover whatever is placed inside later.
  const capsule = document.createElement('div')
  capsule.className = 'svg-capsule'
  capsule.style.cssText = 'width:100%;overflow:hidden;cursor:zoom-in;'
  div[0].appendChild(capsule)

  if (spec.mode === 'inline') {
    if (!place(capsule, spec.source)) problem(div, 'the source did not parse as SVG', item.text)
    return
  }

  // The caption is drawn straight away and independently of the fetch, so it
  // reads while the map is loading and survives a fetch that fails. It goes
  // through the wiki's own resolver, so [[internal]] and [url label] links work
  // here exactly as they do in a markdown item.
  if (spec.caption.length) {
    const text = spec.caption.join(' ')
    const cap = document.createElement('p')
    cap.className = 'svg-caption'
    cap.style.cssText = 'font-style:italic;color:#666;margin:6px 0 0;'
    cap.innerHTML = window.wiki && window.wiki.resolveLinks ? window.wiki.resolveLinks(text) : esc(text)
    div[0].appendChild(cap)
  }

  note(capsule, `loading ${spec.src}`, '#999')
  fetch(spec.src, { mode: 'cors' })
    .then(r => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      return r.text()
    })
    .then(text => {
      if (!place(capsule, text)) throw new Error('the file did not parse as SVG')
    })
    .catch(err => note(capsule, `could not load ${spec.src} — ${err.message}`, '#c00'))
}

export const bind = (div, item) => {
  // The editor is wired first and unconditionally. When emit rendered an error
  // there is no capsule, and returning early here used to leave the item with
  // no double-click handler at all: unreadable and unfixable.
  let clickTimer = null
  div.on('dblclick', (e) => {
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null }
    e.preventDefault()
    if (window.wiki && window.wiki.textEditor) window.wiki.textEditor(div, item)
  })

  const capsule = div.find('.svg-capsule')[0]
  if (!capsule) return

  // Single click = navigate (data-fedwiki-action) or fullscreen; double click = edit.
  // Delay fullscreen briefly so a double-click can cancel it and open the editor.
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
}

if (typeof window !== 'undefined') {
  window.plugins = window.plugins || {}
  window.plugins['svg'] = { emit, bind }
}
