---
title: "Structured search queries for web UIs, part 5: the interface"
date: "2025-01-27T01:30:03.284Z"
description: ""
draft: true
---

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