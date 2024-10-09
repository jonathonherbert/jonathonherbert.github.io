---
title: "Structured search queries for web UIs, part 2: the grammar"
date: "2024-10-06T01:30:03.284Z"
description: "In which we write the grammar for the query language that will power our fancy UI"
draft: false
---

This is what we promised to do in part 1:

> A query language that lets us express key value pairs, binary expressions, grouping, etc., with discoverability in mind.

But ... how does one write a query language? Where do we even _begin?_

Well, a while back I had the good fortune to stumble across _[Crafting Interpreters](https://craftinginterpreters.com/)_ by Bob Nystrom, which is a brilliant introduction to the world of grammars, parsers and interpreters.[^1] It gave me a good enough understanding of the moving parts to hack out something that worked.

## A query language like grammar used to make

But — why write _another_ query language? Surely something like [Lucene syntax](https://lucene.apache.org/core/2_9_4/queryparsersyntax.html) or [KQL](https://www.elastic.co/guide/en/kibana/current/kuery-query.html) will do for our purposes?

The problem with Lucene is discoverability, which we'd like for both the key and value part of our chips. Imagine we're trying to discover which structured search fields are available — for example, the values logged in the namespace `lambdaStats` when we're grepping logs ingested via [cloudwatch-log-management.](https://github.com/guardian/cloudwatch-logs-management) Lucene (and KQL) would have us type, for example, `lambdaStats.memorySizeMax` for the key portion, but there's no way of distinguishing between a query for the string `lambdaStats.lambdaVersion` and the key-value pair `lambdaStats.lambdaVersion:<version>` until you type the `:` — and that ambiguity prevents a UI from confidently presenting a typeahead to the user until it's too late.

One solution, borrowed from the Grid and Giant chip implementations, is to add a leading `+` to our chip grammar: `+lambdaStats.lambdaVersion:<version>`. This allows us to present typeahead suggestions as early as possible. The cost is an extra character in the query, and any associated time/clarity/usability penalty. That feels trivial to me for now, so let's take this approach and see how we fare.[^2]

The rest of the query language will be heavily inspired by Lucene, for now ignoring some of the more domain-specific parts (fuzzy or proximity searches, ranges etc.) to sidestep complexity that isn't chip- or binary- related. We'll build up a grammar using a simple notation similar to [BNF](https://en.wikipedia.org/wiki/Backus%E2%80%93Naur_form), again borrowed from Crafting Interpreters — [here's the chapter](https://craftinginterpreters.com/representing-code.html) if you'd like to understand how grammars might be represented in more detail. Example queries in our language might look like:

```
pets                           // Simple string search
"The pet I'll never forget"    // Quoted strings for reserved characters and whitespace
pets AND (cats OR dogs)        // Binary expressions
+tag:pets                      // Searching for specific fields
+tag:pets AND (cats OR dogs)   // Combinations of the above
```

The first thing we can be sure of is that a query in our language is a list of expressions. We can write that as the rule:

```
query             -> expr+
```

As in regular expressions, the postfix `+` denotes one-or-more of the previous symbol. In plain English, this rule states, "a `query` symbol is made up of one or more `expr` symbols."

There are three sorts of `expr`: a plain `str` (unquoted and quoted, the latter to permit characters that would otherwise be reserved), a `chip` (`+key:value`), and a `group` (parentheses around an `expr`.) Following the convention of borrowing from regular expressions, we can use the pipe character to denote an "or" relationship, and express that as:

```
expr              -> str | group | chip
```

Hold on, though — all of the members of `expr` can be combined with binary expressions. So our rule for binary expressions comes first, where a binary can be a single expression, or two expressions joined with an operator:

```
query             -> binary+
binary            -> expr ('AND' | 'OR' | 'NOT' expr)*
expr              -> str | group | chip
```

The postfix `*` denotes zero-or-more of the previous symbol, and the brackets group a collection of symbols. With this rule, `str`, `str AND group`, `str AND (group OR chip)` etc. are all valid.

How do we unpack `str | group | chip`? Well, `str` is what we call a "terminal" — a symbol that represents a token. Tokens form the alphabet that makes up a grammar. So there's no need to define `str` in our notation.

Groups are simple to define — they're any possible binary, wrapped in parenthesis:

```
group             -> '(' binary ')'
```

where the open and close brackets here are also terminal symbols, this time representing the literal characters `(` and `)`.

Finally, the `chip` needs contain a key and a value:

```
chip              -> '+' str ':' str
```

Which leaves us with a simple grammar:

```
query             -> binary+
binary            -> expr ('AND' | 'OR' | 'NOT' expr)*
expr              -> str | group | chip
group             -> '(' binary ')'
chip              -> '+' str ':' str
```

That's it! We might find that this grammar needs a few tweaks for useability purposes when we come to implement our UI, but the above is a great place to start.

## Grammar in action

To test the grammar, we can "play" it — beginning from the top, expand our symbols until we're left with a set of tokens. For example, if we start with `query`, always expand the leftmost symbol first, and make a few arbitrary choices, we can produce something like:

```
query
binary+
expr 'AND' expr
str 'AND' expr
str 'AND' group
str 'AND' (binary)
str 'AND' (expr 'OR' expr)
str 'AND' (chip 'OR' expr)
str 'AND' ('+' str ':' str 'OR' str)
```

which, were we to fill in the strings, might look like `pets AND (+tag:cats OR feline)`, a valid sentence in this grammar.

Of course, this grammar isn't doing any work for us — yet. We'll need to parse it into a machine-readable form. In the next post we'll write a program that does just that, using two techniques: _scanning_, to produce the tokens that comprise our grammar, and _parsing_, to apply the grammar to those tokens, and give us a useful structure (or an error message!) as a result.

[^1]: Bob Nystrom is a serial language designer, pedagogical genius, and S-rank [twitter/mastodon](https://x.com/munificentbob?lang=en) follow. I'll lean heavily on what I learned from _Crafting Interpreters_ for the parsing/interpreting parts of this series, and if you'd like to learn more on these topics, or indeed write your very own programming language, I can't recommend that book highly enough.
[^2]: There's another cost here — although our grammar might look a lot like Lucene, using `+` to start our chips clashes with [Lucene's 'must' operator](https://lucene.apache.org/core/2_9_4/queryparsersyntax.html#:~:text=The%20%22%2B%22%20or%20required%20operator%20requires%20that%20the%20term%20after%20the%20%22%2B%22%20symbol%20exist%20somewhere%20in%20a%20the%20field%20of%20a%20single%20document.). So, were we to want to have our query language be a superset of Lucene's, we'd need to have some other character for our typeahead.