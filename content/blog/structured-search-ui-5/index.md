---
title: "Structured search queries for web UIs, part 5: the interface"
date: "2025-01-27T01:30:03.284Z"
description: ""
draft: true
---

With our parser for CQL complete in [part 4](/structured-search-ui-4), it's time to implement our UI. In [part 1](/structured-search-ui-1), we had an ambitious list of features for our search component:

- 🔍 Discoverability
- ⌨️ Keyboard-only input
- 📄 Query as single document
- 💻 Binary operators and groups
- 🧳 Portability (copy and paste)
- ✨ Syntax highlighting
- 🚨 Real-time error reporting

In this post, we'll hook up our tokeniser and parser with a UI component powerful enough to express all of them. We'll hand-wave a few things — typeahead and popover behaviour are fairly easy to solve — in favour of covering the challenges that were specific to representing our query language in a structured, editable UI.

When I set out to build the view, I wanted something that wasn't tied to particular product. Although our search grammar seems quite specific, we can imagine serving a subset, or superset, of its features for different use cases. For example:
- The Guardian's digital asset management system, The Grid, supports key-value pairs, but no boolean operators or groups.
- The Guardian's Content API supports all of those things in most cases, but does not permit key-value pairs within groups.
- Kibana supports all of those things, and more, via KQL or Lucene.

So it feels like it should be possible to configure our parser to enable or disable features, or to swap it for another parser that supports more features, or another query language altogether. Each product will also have different requirements for its typeahead, too — some keys and values may be known ahead of time, some will need to be discovered asynchronously as a product of their context, and the way that this happens is likely to differ from product to product.

In short, the component view, parser and typeahead are best kept loosely coupled with clear interfaces, and composed together into a component, like so:

```mermaid
flowchart LR
    subgraph CQL Component
        UI[View]
        LS[Parser]--CQL AST-->UI
        UI--CQL Query-->LS
        TH[Typeahead]--Typeahead Suggestions-->UI
        UI--CQL AST-->TH
    end
```

There are aspects of the view that are tricky. Let's start with syntax highlighting. On its own, this is fairly straightforward to implement — a common trick is to use a standard HTML `input` element, make its contents invisible, and then overlay that input with an element that renders its content identically, save for the additional styling. GitHub uses this trick to achieve its highlighting. The input content is grey in the animation below:

![GitHub's approach to syntax highlighting in its query input, embiggened slightly for display purposes.](./github-input.gif)

Our query UI goes beyond coloured text, though. I'd like to add a visual representation of our chips that makes their role in queries clearer, a bit like the UX for Giant we've briefly seen in part 1. You can see below that key-value pairs have their own visual treatment, as well as a way to remove them with a click:

![alt text](giant-chips.gif)

That sort of thing isn't possible with the above approach, because the additional spacing around each chip can't be accounted for in the plain text accepted by an `input` element of type `text`.

There are many other ways we can implement this, mind. Giant does it by rendering each query element — search text, chip key, chip value — as its own input. The search component then manages cursor movement manually as users move the caret across those elements with the keyboard. This works well for collapsed selections (selections for which `from` and `to` are equal), where there's only a caret to represent, but it's trickier to represent selections that cut across multiple fields, or the entire document: the `📄 Query as single document` feature above. Giant simply doesn't implement that.

Another way to do this might be to treat the entire query as a single, `contenteditable` interface, giving us copy and paste for free, and letting us insert arbitrary markup to style different parts of our query. Unfortuately, working with `contenteditable` is [widely acknowledged](https://www.youtube.com/watch?v=EEF2DlOUkag) to be [an awful experience](https://medium.engineering/why-contenteditable-is-terrible-122d8a40e480#.mqvm5uq1o). But! This is where I can activate a trap card. For some number of years now, I've worked on-and-off on the Guardian's rich text editor, Composer, which has been using the open-source text editor library [ProseMirror](https://prosemirror.net) since 2018. ProseMirror does a good enough job of abstracting the gnarly parts of contenteditable behind a clean, stable interface that some non-trivial subset of the publishing world use it for their tooling, too.[^1] Which makes implementing the final part of the CQL project a neat intersection of two fun things:

![With apologies to Edith Pritchett.](venn.jpg)

The downside is the bundle cost: around 60kb of JavaScript, minified and gzipped, for the library. As we're in prototype mode, and writing ProseMirror code is likely to be quicker and less buggy than writing our own code to achieve the same thing, let's use ProseMirror for now. We can always write our own view implementation if a minimal bundle size becomes a constraint.

With all this in mind, let's write some code. We'll express our UI as a web component, for portability, with a simple interface like:

```jsx
// In HTML
<cql-input id="example-input"></cql-input>

// In JavaScript
const input = document.getElementById("example-input")
input.addEventListener("queryChange", (queryStr) => {
    // Do something with the new query :)
})
```

The scaffolding for a web component looks a bit like:

```typescript
export type CqlResult = {
  tokens: Token[];
} & {
  queryAst: CqlQuery;
} | {
  error: Error;
}

export const createCqlInput = (
    parseCqlQuery: (cqlQuery: string) => CqlResult
) => {
  class CqlInput extends HTMLElement {
    public value = "";
    private styleTemplate = document.createElement("template");
    private editorView: EditorView | undefined;

    connectedCallback() {
      // Set up shadow DOM and styling
      const shadow = this.attachShadow({ mode: "open" });
      template.innerHTML = `<style>/* styling will go here */</style>`;
      shadow.appendChild(template.content.cloneNode(true));

      // Attach input element to shadow DOM
      const cqlInputId = "cql-input";
      const cqlInput = shadow.getElementById(cqlInputId)!;
      shadow.innerHTML = `<div id="${cqlInputId}" spellcheck="false"></div>`;

      // Add a change handler
      const onChange = (detail: QueryChangeEventDetail) => {
        this.value = detail.cqlQuery;
        this.dispatchEvent(
          new CustomEvent("queryChange", {
            detail,
          })
        );
      };

      // Create our ProseMirror view, bound to the input element, and pass
      // a change handler to call when the document state changes
      const editorView = createEditorView({
        mountEl: cqlInput,
        onChange
      });
    }

    disconnectedCallback() {
      this.editorView?.destroy();
    }
  }

  return CqlInput;
};
```

We're assuming the existence of a function that, given a CQL query, returns a list of tokens, and either a CQL AST, or an error. This makes our CQL component pluggable — the user can bring their own parser implementation. There's some boilerplate to set up the component DOM and styling, and then we call `createEditorView`, which will create an instance of a ProseMirror editor. Here's what that looks like:

```typescript
import { EditorView } from "prosemirror-view";
import { EditorState } from "prosemirror-state";
import { baseKeymap } from "prosemirror-commands";
import { undo, redo, history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { doc } from "./schema";

const schema = new Schema({
  nodes: {
    doc: {
      content: "text*",
    },
    text: {}
  },
});

export const createEditorView = ({
  mountEl,
}: {
  mountEl: HTMLElement;
}) => {
  const view = new EditorView(mountEl, {
    state: EditorState.create({
      doc: doc.create(),
      schema: schema,
      plugins: [
        keymap({
          ...baseKeymap,
          "Mod-z": undo,
          "Mod-y": redo,
        }),
        history(),
      ],
    }),
  });

  return view;
};
```

This will create a standard ProseMirror editor with some basic functionality: platform-specific keybindings for [common actions](https://prosemirror.net/docs/ref/#commands.baseKeymap), and document history for undo/redo with the [`prosemirror-history` plugin.](https://prosemirror.net/docs/ref/#history)

But hang on — what's `schema`? A ProseMirror editor requires a schema to enforce its document structure. A document structure is a tree, just like the contents of a HTML element, but unlike `contenteditable`, a ProseMirror document doesn't contain arbitrary content: the document schema establishes what nodes can exist in its document, and how they can be combined. We'll dig into schemas in more detail later in this post, but for now, our needs are very basic — the above schema defines a document that can only contain plain text. Here's how our input looks:

// insert example plain input.

It's not much! But there is some important functionality here, even in this very simple input. Firstly, perhaps you can pop the devtools to note that the input is definitely a `div` element with `contenteditable` enabled, rather than an `input`, as it might appear. However, _unlike_ a standard contenteditable element, our ProseMirror element won't accept arbitrary HTML — if you copy and paste some **content** ~with~ _markup_ (like the preceding words) into it, you'll find that ProseMirror enforces the document schema, stripping any structure or styling to make sure that it only contains plain text.

So far, so good — but that's about 60kb of library code we're sending across the wire to provide something that HTML gives us with `input`! Let's connect our ProseMirror editor with our parser, to give us the tokens and AST we'll need to implement our feature set. Every time we receive new input from the editor, we'll want to parse the new document we receive as a result of the input, and transform that _back_ into a ProseMirror document again, ensuring our input reflects our parsed output. If the parse fails, we can simply accept the input as it stood, keeping the error information to display to the user.

// Full parse workflow

```mermaidjs
flowchart TD
    U[New user input]--e.g 'keydown +'-->D1["New document state (unparsed)"]
    D1--docToCqlQuery()-->Q1[New query]
    Q1--parse()-->S{Success?}
    S--"Yes"-->A1[New AST]
    S--"No"-->UI1
    A1--cqlQueryToDoc()-->D2["New document state (from parsed query)"]
    D2--apply()-->UI1[New UI]
    UI1-->U
```

In code, this looks like:

// Code example of pm->cql, cql->pm, plugin code

As our scanner is currently implemented, this has the side-effect of normalising our input when it's valid — extra whitespace at the start or end of queries, for example, is stripped out.

//



// Schema detail

A schema defines its content in a similar way to our grammar in [part 2](/structured-search-ui-2). In our grammar, on each line we declared a symbol, and a rule that defined the valid sequence(s) of terminal or nonterminals for that symbol. In our ProseMirror schema, for each node declaration, we'll define a node name (the key within the `nodes` object), and within the `content` property of that node's definition, we'll define what's permitted in the node. For now, our document can contain any number of `text` nodes — the minimum we need to support plain text input.

The ecosystem provides a [basic schema](https://github.com/ProseMirror/prosemirror-schema-basic) to get you started with rich text, but schemas can be large and expressive — the Guardian uses a schema with hundreds of node types to express the many different kinds of structured content their platform supports.

[^1]: The NYT, the Financial Times, YT … add your organisation here!

Structure:

Reminder of the feature set we're implementing.

What we'll need:
- parser
- way to wrangle contenteditable
- maybe a little introduction to Prosemirror
- cute Venn diagram of my two skills

Structure

Implement parts of structure, one after t'other

????

Profit


```mermaid
    flowchart TD
        U[New user input]--e.g 'keydown +'-->D1[New document state]
        D1--docToCqlQuery()-->Q1[New query]
        Q1--parse()-->A1[New AST]
        A1--cqlQueryToDoc()-->D2[New document state]
        D2--apply()-->UI1[New UI]
        UI1-->U
```