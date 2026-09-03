/**
 * Regression for the shared sidebar entry core: the entry row must be placed
 * into the container that actually owns the New Session button.
 *
 * Classic dsh-web shells keep the New Session button and its following
 * siblings as direct children of the sidebar root, so inserting on the root
 * works. The tauri panel desktop shell nests the button one level deeper
 * (root > panelArea > [newSession, panel actions]); the resolved anchor is a
 * child of that intermediate container, and inserting on the root throws
 * `NotFoundError`. The core must insert on `base.parentElement` instead and
 * must never let a placement mismatch tear down the whole mount.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSidebarEntry } from '../src/client/sidebar-entry.ts'

class FakeElement {
  readonly tagName: string
  parentElement: FakeElement | null = null
  children: FakeElement[] = []
  dataset: Record<string, string> = {}
  isConnected = true
  textContent = ''
  className = ''

  constructor(tag: string) {
    this.tagName = tag
  }

  setAttribute(): void {}

  addEventListener(): void {}

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) this.appendChild(node)
  }

  appendChild(node: FakeElement): void {
    this.insertBefore(node, null)
  }

  /** Mirror DOM semantics: the anchor must already be a child of this node. */
  insertBefore(node: FakeElement, anchor: FakeElement | null): void {
    if (anchor !== null && !this.children.includes(anchor)) {
      throw new Error('NotFoundError: The node before which the new node is to be inserted is not a child of this node.')
    }
    if (node.parentElement !== null) {
      const oldIndex = node.parentElement.children.indexOf(node)
      if (oldIndex >= 0) node.parentElement.children.splice(oldIndex, 1)
    }
    const at = anchor === null ? this.children.length : this.children.indexOf(anchor)
    this.children.splice(at, 0, node)
    node.parentElement = this
  }

  remove(): void {
    if (this.parentElement === null) return
    const index = this.parentElement.children.indexOf(this)
    if (index >= 0) this.parentElement.children.splice(index, 1)
    this.parentElement = null
  }

  get nextElementSibling(): FakeElement | null {
    if (this.parentElement === null) return null
    const index = this.parentElement.children.indexOf(this)
    return index >= 0 && index + 1 < this.parentElement.children.length
      ? this.parentElement.children[index + 1]!
      : null
  }

  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null
  }

  closest(): FakeElement | null {
    return null
  }

  matches(): boolean {
    return false
  }

  querySelector(selector: string): FakeElement | null {
    const token = selector.includes('logoRow')
      ? 'logoRow'
      : selector.includes('newSession')
        ? 'newSession'
        : null
    if (token === null) return null
    const visit = (node: FakeElement): FakeElement | null => {
      if (node.className.includes(token)) return node
      for (const child of node.children) {
        const hit = visit(child)
        if (hit !== null) return hit
      }
      return null
    }
    return visit(this)
  }
}

class FakeMutationObserver {
  observe(): void {}
  disconnect(): void {}
}

function minimalController(): never {
  return {
    subscribe: () => () => {},
    getSnapshot: () => ({ boardOpen: false }),
    toggleBoard: () => {},
  } as never
}

/** Stub the browser globals the sidebar core touches and return the elements createElement produced. */
function stubDom(column: FakeElement): { created: FakeElement[] } {
  const created: FakeElement[] = []
  const documentStub = {
    querySelector: (selector: string) =>
      selector === '[data-pane="sidebar"], [class*="sidebarCol"]' ? column : null,
    createElement: (tag: string) => {
      const element = new FakeElement(tag)
      created.push(element)
      return element
    },
    documentElement: { lang: 'zh-CN' },
    body: new FakeElement('body'),
  }
  vi.stubGlobal('document', documentStub)
  vi.stubGlobal('MutationObserver', FakeMutationObserver)
  vi.stubGlobal('HTMLElement', FakeElement)
  return { created }
}

/**
 * Build the tauri-panel-like shell the core must handle:
 * column > root > [logoRow, panelArea > [newSession button, panel actions]].
 */
function buildNestedShell(): { column: FakeElement; root: FakeElement; panelArea: FakeElement; newButton: FakeElement; actions: FakeElement } {
  const column = new FakeElement('div')
  column.className = 'pI_x6G_sidebarCol'
  const root = new FakeElement('div')
  root.className = 'dshp-root'
  const logoRow = new FakeElement('div')
  logoRow.className = 'dshp-logoRow'
  const panelArea = new FakeElement('div')
  panelArea.className = 'dshp-panelArea'
  const newButton = new FakeElement('button')
  newButton.className = 'dshp-menuItem dshp-newSession'
  const actions = new FakeElement('div')
  actions.className = 'actions'
  root.appendChild(logoRow)
  root.appendChild(panelArea)
  panelArea.appendChild(newButton)
  panelArea.appendChild(actions)
  column.appendChild(root)
  return { column, root, panelArea, newButton, actions }
}

describe('mountSidebarEntry placement', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('places the entry inside the New Session row container on nested (tauri panel) shells', () => {
    const tree = buildNestedShell()
    const { created } = stubDom(tree.column)

    const dispose = mountSidebarEntry(minimalController())
    const entry = created[0]!

    expect(entry.parentElement).toBe(tree.panelArea)
    expect(tree.panelArea.children).toEqual([tree.newButton, entry, tree.actions])

    dispose()
    expect(tree.panelArea.children).toEqual([tree.newButton, tree.actions])
  })

  it('keeps direct-child placement on classic shells', () => {
    const column = new FakeElement('div')
    column.className = 'pI_x6G_sidebarCol'
    const root = new FakeElement('div')
    root.className = 'sidebarRoot'
    const newButton = new FakeElement('button')
    newButton.className = 'logo newSession'
    const browserRegion = new FakeElement('div')
    root.appendChild(newButton)
    root.appendChild(browserRegion)
    column.appendChild(root)
    const { created } = stubDom(column)

    const dispose = mountSidebarEntry(minimalController())
    const entry = created[0]!

    expect(entry.parentElement).toBe(root)
    expect(root.children).toEqual([newButton, entry, browserRegion])

    dispose()
    expect(root.children).toEqual([newButton, browserRegion])
  })
})
