---
title: Writing a program to enumerate every string a regular expression will match
date: "2021-12-02T22:12:03.284Z"
description: "Like, _all_ of them"
draft: false
---

<style>
/*https://www.cssscript.com/clean-tree-diagram/*/
.tree,
.tree ul,
.tree li {
    font-family: monospace;
    list-style: none;
    margin: 0;
    padding: 0;
    position: relative;
}
.tree {
    margin: 0 0 1em;
    text-align: center;
}
.tree,
.tree ul {
    display: table;
}
.tree ul {
    width: 100%;
}
.tree li {
    display: table-cell;
    padding: .5em 0;
    vertical-align: top;
}
.tree li:before {
    outline: solid 1px #666;
    content: "";
    left: 0;
    position: absolute;
    right: 0;
    top: 0;
}
.tree li:first-child:before {
    left: 50%;
}
.tree li:last-child:before {
    right: 50%;
}
.tree code,
.tree span {
    border: solid .1em #666;
    border-radius: .2em;
    display: inline-block;
    margin: 0 .2em .5em;
    padding: .2em .5em;
    position: relative;
}
.tree ul:before,
.tree code:before,
.tree span:before {
    outline: solid 1px #666;
    content: "";
    height: .5em;
    left: 50%;
    position: absolute;
}
.tree ul:before {
    top: -.5em;
}
.tree code:before,
.tree span:before {
    top: -.55em;
}
.tree>li {
    margin-top: 0;
}
.tree>li:before,
.tree>li:after,
.tree>li>code:before,
.tree>li>span:before {
    outline: none;
}
</style>

At The Guardian, we've got a tool called Typerighter that's a bit like Grammarly, plus our style guide. [^1] It's a handy tool to check that copy matches our house style. The Daily Mail [love it.](https://www.dailymail.co.uk/news/article-11427737/How-war-trans-rights-killing-free-speech-worlds-sanctimonious-paper-Guardian.html#:~:text=The%20paper%20has%20a%20new%20editorial%20tool%20called%20%27Typerighter%27%20which%20does%20not%20merely%20correct%20poor%20English%20or%20bad%20punctuation%20but%20insists%20on%20politically%20correct%20terminology.%20The%20word%20%27aboriginal%27%20is%20proscribed.%20Journalists%20are%20enjoined%20to%20write%20%27pro%2Dchoice%27%20but%20never%20%27pro%2Dlife%27.)

It has a few different ways of matching text. It has a spellchecker, for standard dictionary words. It has some more complicated rules written for LanguageTool, an open-source spelling and grammar checker. But the majority of the corpus that doesn't come from a dictionary is at present written in regular expressions – at the moment, about 13,000 of them.

One might think that if solving a problem with a regular expression means that you have two problems,[^2] the maintainers of this giant corpus now have ~13,000 problems. But these rules have worked very well in practice, in combination with decent user telemetry and a good rule management system. The hard part is writing them: especially, helping non-technical users to write them.

I had a thought: could I write a program that would enumerate every string a given regex would match? And if it did exist, could it help regex authors better understand what they are writing? 

Then I found [ExRex](https://github.com/asciimoo/exrex), which does precisely what I wanted. But it was written in Python, and I wanted an excuse to try to solve this myself, so…

## Parsing regular expressions

Like any other programming language, regular expressions parse down to an Abstract Syntax Tree (AST), and because regexes are so ubiquitous, it wasn't hard to find a library that would do this for me – in this case, [regexp-tree](regexp-tree), as I was writing this program for a web-based app. A regular expression with a capturing group matching either 'a' or 'b', ` /(a|b)/`, parses into this:

```json
{
  "type": "RegExp",
  "body": {
    "type": "Group",
    "capturing": true,
    "number": 1,
    "expression": {
      "type": "Disjunction",
      "left": {
        "type": "Char",
        "value": "a",
        "kind": "simple",
        "symbol": "a",
        "codePoint": 97
      },
      "right": {
        "type": "Char",
        "value": "b",
        "kind": "simple",
        "symbol": "b",
        "codePoint": 98
      }
    }
  },
  "flags": ""
}
```

A diagram makes the tree structure a bit clearer:

<ul class="tree">
  <li> <span>RegExp</span>
    <ul>
      <li> <span>Group</span>
        <ul>
          <li> <span>Disjunction</span>
            <ul>
              <li> <span>Char: 'a'</span>
              </li>
              <li> <span>Char: 'b'</span>
              </li>
            </ul>
          </li>
        </ul>
      </li>
    </ul>
  </li>
</ul>

Faced with a tree, and the assumption that we can reasonably generate characters that match each root node in isolation, one thought might be to traverse the tree, generating combinations of characters every time we encounter 'or' choices (the Disjunction, `|`, above) or repetition (like the option `?` or zero-to-many `*` operators). We could do this by writing a handler for each node, and recursively calling handlers, passing arrays of possibilities back up the tree. 

```javascript
// Example code here
```

You may have spotted the flaw: some nodes, like `*`, generate infinite sequences, and so our program cannot generate an exhaustive series of matches. A regex like `(a|b)*` gets stuck on the `Repetition` node:

<ul class="tree">
  <li> <span>RegExp</span>
    <ul>
      <li> <span>Repetition: '*'</span>
        <ul>
          <li> <span>Group</span>
            <ul>
              <li> <span>Disjunction</span>
                <ul>
                  <li> <span>Char: 'a'</span>
                  </li>
                  <li> <span>Char: 'b'</span>
                  </li>
                </ul>
              </li>
            </ul>
          </li>
        </ul>
      </li>
    </ul>
  </li>
</ul>

// Fancy example??

Furthermore, faced with a potentially infinite set of possible matches, it'd be good if our program generated exactly as many as we wanted.

## Generators (can't you hear my motored heart)

JavaScript has a language feature that makes this task easier – [Generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Generator), or functions that can yield control back to the caller until they are next called. If each node returns a generator, we can traverse the tree just once on every iteration, each generator producing a single result and then halting. This works well for leaf nodes that generate characters like `Char`, or `Repetition` nodes that yield the same output n times. But what about `Disjunction` or `Alternative` nodes (lists of expressions in sequence), that yield a different result every time?

Consider the regex `(a|b)(c|d)(e|f)`, which looks like:

<ul class="tree">
  <li> <span>RegExp</span>
    <ul>
      <li> <span>Alternative</span>
        <ul>
          <li> <span>Group</span>
            <ul>
              <li> <span>Disjunction</span>
                <ul>
                  <li> <span>Char: 'a'</span>
                  </li>
                  <li> <span>Char: 'b'</span>
                  </li>
                </ul>
              </li>
            </ul>
          </li>
          <li> <span>Group</span>
            <ul>
              <li> <span>Disjunction</span>
                <ul>
                  <li> <span>Char: 'c'</span>
                  </li>
                  <li> <span>Char: 'd'</span>
                  </li>
                </ul>
              </li>
            </ul>
          </li>
          <li> <span>Group</span>
            <ul>
              <li> <span>Disjunction</span>
                <ul>
                  <li> <span>Char: 'e'</span>
                  </li>
                  <li> <span>Char: 'f'</span>
                  </li>
                </ul>
              </li>
            </ul>
          </li>
        </ul>
      </li>
    </ul>
  </li>
</ul>


One way of writing out all the possible matches might be:

```
ace
acf
ade
adf
bce
bcf
bde
bdf
```

I had to sit down with some pen and paper to work out an algorithm.

First we consider some state. For the parent `Alternatives` node, we iterate over its child nodes to yield a value. Each child node may yield 1-many values. We store the index of a current child node, which indicates which child we'd like to next ask for a its next value.

For each child `Expression` node, we store the index of the permutation it will next yield (which may not be the latest permutation), and the list of permutations it has already yielded, so we can backtrack as other child nodes yield new values.

1. Take a result from all the child nodes, and concatenate them. Yield the output string.
2. Increment the current child's permutation index.
3. If every child node's permutation index is at the leading edge of its set of permutations:
   - If there is a next child that has not yielded all its permutations after this child, point the parent index to the next child. The next child yields a new permutation and points its permutation index at the new permutation.
   - Else, all children have completed and all permutations have been yielded! Complete execution.
4. Else, if the current child node has completed its permutations, reset this child's index, and move to the next available permutation in a subsequent child.
5. Return to step 1.

Here's a look at it in action:
// Fancy diagram?

The result is [regex-enumerate-matches](https://www.npmjs.com/package/regex-enumerate-matches), and it produces some fun results with our rules.

// Give examples

I've plans to integrate this with our management tooling to give our users another way to verify the regexes they're writing are along the right lines – we'll do some testing to find out if it helps.

[^1]: <sub>Minus fifty or so PhDs specialising in natural language processing</sub>
[^2]: <sub>Oldie but goodie: ["Some people, when confronted with a problem, think 'I know, I'll use
regular expressions.' Now they have two problems."](https://groups.google.com/g/comp.lang.python/c/-cnACi-RnCY/m/NlJs5ZNc0YUJ?hl=en#:~:text=%22Some%20people%2C%20when%20confronted%20with%20a%20problem%2C%20think%20%27I%20know%2C%20I%27ll%20use%0Aregular%20expressions.%27%20Now%20they%20have%20two%20problems.%22)</sub>
