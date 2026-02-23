// bun build ./content/blog/structured-search-ui-5/program.ts --target browser --format esm

import { EditorView } from "prosemirror-view"
import { EditorState } from "prosemirror-state"
import { baseKeymap } from "prosemirror-commands"
import { undo, redo, history } from "prosemirror-history"
import { keymap } from "prosemirror-keymap"
import { Schema } from "prosemirror-model"

const schema = new Schema({
  nodes: {
    doc: {
      content: "text*",
    },
    text: {},
  },
})

export const createEditorView = ({ mountEl }: { mountEl: HTMLElement }) => {
  const view = new EditorView(mountEl, {
    state: EditorState.create({
      schema: schema,
      doc: schema.nodes.doc.create(null, schema.text("example")),
      plugins: [
        keymap({
          ...baseKeymap,
          "Mod-z": undo,
          "Mod-y": redo,
        }),
        history(),
      ],
    }),
  })

  return view
}

document.querySelectorAll("[data-pm-input]").forEach((el) => {
  createEditorView({ mountEl: el as HTMLElement })
})
