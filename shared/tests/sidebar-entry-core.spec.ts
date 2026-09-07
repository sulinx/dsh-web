import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSidebarEntry } from '../client/sidebar-entry-core.ts'

interface FakeElement {
  tagName: string
  dataset: Record<string, string>
  children: FakeElement[]
  parentElement: FakeElement | undefined
  nextElementSibling: FakeElement | undefined
  isConnected: boolean
  innerHTML: string
  textContent: string
  className: string
  attrs: Record<string, string>
  removed: boolean
  append(...children: FakeElement[]): void
  appendChild(child: FakeElement): void
  setAttribute(name: string, value: string): void
  insertBefore(child: FakeElement, anchor?: FakeElement): void
  remove(): void
  addEventListener(name: string, fn: () => void): void
  click(): void
  closest(selector: string): FakeElement | null
  matches(selector: string): boolean
  contains(child: FakeElement): boolean
  querySelector(selector: string): FakeElement | null
  firstElementChild: FakeElement | undefined
}

/** Depth-first search for a BUTTON descendant whose class list contains one of the needles. */
function findButtonByClass(el: FakeElement, needles: string[]): FakeElement | null {
  for (const child of el.children) {
    if (child.tagName === 'BUTTON' && needles.some((n) => child.className.includes(n))) return child
    const found = findButtonByClass(child, needles)
    if (found !== null) return found
  }
  return null
}

function makeElement(tag: string, children: FakeElement[] = []): FakeElement {
  const listeners = new Map<string, () => void>()
  const element: FakeElement = {
    tagName: tag.toUpperCase(),
    dataset: {},
    children,
    parentElement: undefined,
    nextElementSibling: undefined,
    isConnected: true,
    innerHTML: '',
    textContent: '',
    className: '',
    attrs: {},
    removed: false,
    append(...children) { for (const child of children) element.appendChild(child) },
    setAttribute(name, value) {
      element.attrs[name] = value
      if (name.startsWith('data-')) element.dataset[name.slice('data-'.length)] = value
    },
    appendChild(child) {
      element.children.push(child)
      child.parentElement = element
    },
    insertBefore(child, anchor) {
      const index = anchor === undefined ? element.children.length : element.children.indexOf(anchor)
      element.children.splice(index < 0 ? element.children.length : index, 0, child)
      child.parentElement = element
      child.nextElementSibling = element.children[index + 1]
    },
    remove() { element.removed = true },
    addEventListener(name, fn) { listeners.set(name, fn) },
    click() { listeners.get('click')?.() },
    closest(selector) {
      // Only the logo-row selector shape is exercised by sidebar-entry-core;
      // walk up while any class-list substring of the selector is present.
      const needles = /logoRow|logo-row/.test(selector) ? ['logoRow', 'logo-row'] : null
      let cur: FakeElement | undefined = element.parentElement
      while (cur !== undefined) {
        // Capture: TS does not keep the while-condition narrowing across the
        // .some callback, where `cur` could theoretically be reassigned.
        const node = cur
        if (needles !== null && needles.some((n) => node.className.includes(n))) return node
        cur = node.parentElement
      }
      return null
    },
    matches() { return false },
    contains() { return false },
    querySelector(selector) {
      if (selector === 'button[class*="newSession"], button[class*="new-session"]') return findButtonByClass(element, ['newSession', 'new-session'])
      if (selector === 'button[class*="newSession"]') return findButtonByClass(element, ['newSession'])
      return null
    },
    get firstElementChild() { return element.children[0] },
  }
  return element
}

function installShell() {
  newSession = makeElement('button')
  root = makeElement('div', [newSession])
  column = makeElement('div', [root])
}

let newSession: FakeElement
let root: FakeElement
let column: FakeElement

function stubDocument(existingRow: boolean, created: FakeElement[]) {
  vi.stubGlobal('MutationObserver', class { disconnect() {} observe() {} })
  vi.stubGlobal('document', {
    querySelector: (selector: string) => {
      if (selector === '[data-dsh-x-entry]') return existingRow ? {} : null
      if (selector === '[data-pane="sidebar"], [class*="sidebarCol"]') return column
      if (selector === 'button[class*="newSession"], button[class*="new-session"]') return newSession
      return null
    },
    createElement: () => {
      const element = makeElement('button')
      created.push(element)
      return element
    },
    body: { contains: () => true },
  })
}

function options(extra: Partial<Parameters<typeof mountSidebarEntry>[0]> = {}) {
  return {
    rowAttribute: 'data-dsh-x-entry',
    rowSelector: '[data-dsh-x-entry]',
    icon: '<svg/>',
    css: {},
    label: () => 'X',
    onToggle: () => undefined,
    position: 'after' as const,
    familySelectors: ['[data-dsh-x-entry]'],
    ...extra,
  }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('shared sidebar-entry core', () => {
  it('mounts the row after the new session button and toggles on click', () => {
    installShell()
    let toggled = 0
    const created: FakeElement[] = []
    stubDocument(false, created)
    const dispose = mountSidebarEntry(options({
      css: { entry: 'entry-css', entryIcon: 'icon-css', entryLabel: 'label-css' },
      onToggle: () => { toggled += 1 },
    }))
    const entry = created[0]!
    expect(entry!.className).toBe('entry-css')
    expect(entry!.attrs['aria-label']).toBe('X')
    const iconSpan = entry!.children[0]
    const labelSpan = entry!.children[1]
    expect(iconSpan!.className).toBe('icon-css')
    expect(iconSpan!.innerHTML).toContain('<svg/>')
    expect(labelSpan!.className).toBe('label-css')
    expect(labelSpan!.textContent).toBe('X')
    entry!.click()
    expect(toggled).toBe(1)
    dispose()
    expect(entry!.removed).toBe(true)
  })

  it('mounts into the new-session button parent host on the 0.1.3 BEM shell (nested button)', () => {
    // harness 0.1.3 tauri shell geometry: sidebar column (hash css module,
    // keeps the "sidebarCol" substring) > panel root (dshp-panel) >
    // panel-area block > new-session button (BEM class
    // dshp-panel__new-session). The button is no longer a direct child of
    // the sidebar root, and the logo row (dshp-panel__logo-row) is a
    // sibling block, not an ancestor.
    newSession = makeElement('button')
    newSession.className = 'dshp-panel__menu-item dshp-panel__new-session'
    const panelArea = makeElement('div', [newSession])
    panelArea.className = 'dshp-panel__panel-area'
    root = makeElement('div', [panelArea])
    root.className = 'dshp-panel'
    column = makeElement('div', [root])
    column.className = 'xP0Bd7a_sidebarCol'
    // makeElement does not link parentElement for constructor children; the
    // core resolves the insertion host through the button's parentElement.
    newSession.parentElement = panelArea
    panelArea.parentElement = root
    root.parentElement = column
    let toggled = 0
    const created: FakeElement[] = []
    stubDocument(false, created)
    const dispose = mountSidebarEntry(options({
      css: { entry: 'entry-css', entryIcon: 'icon-css', entryLabel: 'label-css' },
      onToggle: () => { toggled += 1 },
    }))
    const entry = created[0]!
    // sidebarRoot falls back to column.firstElementChild (the panel root);
    // the BEM button is found through the combined selector; the entry is
    // inserted into the button's actual parent (panel-area), after the
    // button, not into the sidebar root.
    expect(entry.parentElement).toBe(panelArea)
    expect(panelArea.children[0]).toBe(newSession)
    expect(panelArea.children[1]).toBe(entry)
    expect(root.children).toHaveLength(1)
    entry.click()
    expect(toggled).toBe(1)
    dispose()
    expect(entry.removed).toBe(true)
  })

  it('outputs the L2 semantic attributes only when the plugin option is set (#506)', () => {
    installShell()
    const withPlugin: FakeElement[] = []
    stubDocument(false, withPlugin)
    const disposeWith = mountSidebarEntry(options({ plugin: 'task-board' }))
    expect(withPlugin[0]!.attrs['data-dsh-plugin']).toBe('task-board')
    expect(withPlugin[0]!.attrs['data-dsh-part']).toBe('sidebar-entry')
    disposeWith()

    const withoutPlugin: FakeElement[] = []
    stubDocument(false, withoutPlugin)
    const disposeWithout = mountSidebarEntry(options())
    expect(withoutPlugin[0]!.attrs['data-dsh-plugin']).toBeUndefined()
    expect(withoutPlugin[0]!.attrs['data-dsh-part']).toBeUndefined()
    disposeWithout()
  })

  it('skips mounting when an entry row already exists (idempotency)', () => {
    installShell()
    let created = 0
    vi.stubGlobal('MutationObserver', class { disconnect() {} observe() {} })
    vi.stubGlobal('document', {
      querySelector: (selector: string) => selector === '[data-dsh-x-entry]' ? {} : null,
      createElement: () => { created += 1; return {} },
    })
    const dispose = mountSidebarEntry(options())
    expect(created).toBe(0)
    expect(dispose()).toBeUndefined()
  })

  it('re-applies the label through the refresh subscription and unsubscribes on dispose', () => {
    installShell()
    const listeners = new Set<() => void>()
    let label = 'X'
    const created: FakeElement[] = []
    stubDocument(false, created)
    const dispose = mountSidebarEntry(options({
      refresh: {
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
      },
      label: () => label,
    }))
    const entry = created[0]!
    expect(entry!.attrs['aria-label']).toBe('X')
    const labelSpan = entry!.children[1]!
    expect(labelSpan.textContent).toBe('X')
    label = 'Рус'
    for (const listener of listeners) listener()
    expect(entry!.attrs['aria-label']).toBe('Рус')
    expect(labelSpan.textContent).toBe('Рус')
    dispose()
    expect(listeners.size).toBe(0)
  })

  it('highlights the row while the active state is open and clears on close', () => {
    installShell()
    let open = true
    const listeners = new Set<() => void>()
    const created: FakeElement[] = []
    stubDocument(false, created)
    mountSidebarEntry(options({
      active: {
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
        isOpen: () => open,
      },
    }))
    expect(created[0]!.dataset['active']).toBe('true')
    open = false
    for (const listener of listeners) listener()
    expect(created[0]!.dataset['active']).toBeUndefined()
  })
})
