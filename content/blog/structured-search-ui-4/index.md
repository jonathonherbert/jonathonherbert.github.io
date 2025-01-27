---
title: "Structured search queries for web UIs, part 4: parsing"
date: "2025-01-25T01:30:03.284Z"
description: "Grammar (parsin') time"
draft: false
---

In [part 3](./structured-search-part-3), we implemented a scanner that could turn a CQL query string into a list of tokens. In this post, we'll write a parser that accepts that list of tokens, and outputs a a data structure that represents the query as it's structured by the syntax of our grammar. Here's a visualisation of what that tree looks like, so we have a sense of what we're building before we begin:

<div data-parser>why not (+edit:me AND see)</div>

Of course, there are many ways for a query to be incorrect, and so it's also the parser's job to give a sensible error message when our list of tokens doesn't make sense:

<div data-parser>( whoops!</div>

The above data structure is called an _Abstract Syntax Tree_, or _AST_, and it's worth defining that term before we begin. "Syntax" is a word to describe the rules that describe the correct arrangement of symbols (represented in this case by tokens) in a language. So a syntax tree is a tree that represents the syntactic structure of some text according to a given grammar. In this case, the tree is "Abstract" because it will gloss over many details of the syntax in favour of representing its structure. This will become clearer as we examine the structure the parser creates.

It might be that parsing a grammar like CQL is old hat to you — in which case, you'd be forgiven for skipping this post, and moving straight on to part 5 (when it's written.)[^1] If not, let us begin …

<h2>The (recursive) descent 🕳️</h2>

There are many ways to write a parser, but I'm only qualified to write one sort at the time of writing: a recursive descent parser. Luckily, I'm reliably informed that recursive descent is [great.](https://craftinginterpreters.com/parsing-expressions.html#:~:text=use%20recursive%20descent.-,It%20rocks.,-Recursive%20descent%20is) Specifically, recursive descent parsers tend to be:

- Fast.
- Great at giving comprehensible error messages, if they're written with that in mind.
- Easy to write.

In the context of this post, the latter point is important. If you're new to this subject and the idea of writing a parser is as daunting as spelunking into [an actual cave](https://en.wikipedia.org/wiki/The_Descent), don't worry. We'll spelunk together, and I suspect you'll be pleasantly surprised at how straightforward this part of the task is.

Recursive descent parsers are easy to write because their different parts correspond to the structure of the grammar we've already written. Bob Nystrom has a neat summary of this mapping in Crafting Interpreters that I'll reproduce with minor modifications here:[^2]

| Grammar notation | Code representation               |
| ---------------- | --------------------------------- |
| Terminal         | Code to match and consume a token |
| Nonterminal      | Call to that rule’s function      |
| \|               | Conditional or pattern match (in Typescript, an `if` or `switch` statement)        |
| \* or +          | Loop (e.g. `while`, `for`, or recursion)             |
| ?                | Conditional (`if` statement)                    |

As we parse a given CQL expression, we're going to use these rules as we _descend_ through the grammar, working through our rules _recursively_ until we've consumed all our tokens (or thrown an error trying to do it.) And that's why it's called recursive descent! As a reminder, our grammar looks like:

```
query             -> binary?
binary            -> expr (('AND' | 'OR')? binary)*
expr              -> str | group | chip
group             -> '(' binary ')'
chip              -> chip_key chip_value?
```

We'll start with the scaffolding — writing a class (again, in Typescript) to hold our logic and state.

```typescript
class Parser {
  // Keep track of the current token.
  private current: number = 0

  constructor(private tokens: Token[]) {}

  public parse(): Query {
    // ???
  }
}
```

You can see that we've a constructor that gives us our list of tokens, and a `parse` method that returns a `Query` to its caller: the first nonterminal in our grammar. `Query`'s first property will be a discriminator field, `type`, to allow us to identify it. Another field will hold its optional content, `Binary`, which we'll come to define shortly:

```typescript
export class Query {
  public readonly type = "Query"
  constructor(public readonly content?: Binary) {}
}
```

Back in our class, our nonterminal `Query` maps to a call to that rule's function, so we'll update our method:

```typescript
class Parser {
  // ...

  public parse(): Query {
    return this.query()
  }

  private query(): Query {
    // ...
  }
}
```

A `query` nonterminal is nice and simple: it can contain a single `Binary` — or be completely empty!

```
query             -> binary?
```

If our statement is completely empty, the next token we parse will be an `EOF`. We'll check to see if we should stop parsing and return an empty `Query` object, or continue working through our grammar by descending into our next nonterminal. We know that will be a `Binary`, so our next method will be `binary()`.

```typescript
class Parser {
  // ...

  private query(): Query {
    const content =
      this.peek().tokenType === TokenType.EOF ? undefined : this.binary()

    return new Query(content)
  }

  private peek(): Token {
    return this.tokens[this.current]
  }
}
```

In `binary()`, things start to get more interesting. First, we'll need to define our `Binary` type. Let's have a look at the grammar rule:

```
binary            -> expr (('AND' | 'OR')? binary)
```

We'll need to store the left hand side of the binary expression, and, optionally, the operator and binary of its right hand side, too:

```typescript
export class Binary {
  public readonly type = "Binary"
  constructor(
    public readonly left: Expr,
    public readonly right?: {
      operator: "OR" | "AND"
      binary: Binary
    }
  ) {}
}
```

Writing our `binary()` method in the `Parser` class, we can express `expr (('AND' | 'OR')? binary)` clearly in the code, too.

```typescript
class Parser {
  // ...
  private binary(isNested: boolean = false): Binary {
    const left = this.expr()

    const tokenType = this.peek().tokenType

    switch (tokenType) {
      // If we have an explicit binary operator, use it …
      case TokenType.OR:
      case TokenType.AND: {
        this.consume(tokenType)
        return new Binary(left, {
          operator: tokenType,
          binary: this.binary(isNested),
        })
      }
      case TokenType.EOF: {
        return new Binary(left)
      }
      // ... or default to OR.
      default: {
        return new Binary(left, {
          operator: TokenType.OR,
          binary: this.binary(isNested),
        })
      }
    }
  }
}
```

Hopefully the logic here is clear enough — we acquire our binary's left hand side with the yet-to-be-defined `this.expr()`. We then optionally fill out its right hand side with either an explicit binary operator (`AND|OR`) or another expression — unless we've come to the end of our list of tokens.

But woah! We're also calling four important methods here, `consume`, `check`, `isAtEnd` and `advance`, that we've yet to introduce. Here's what they look like:

```typescript
class Parser {
  // ...
  private consume = (tokenType: TokenType): Token => {
    if (this.check(tokenType)) {
      return this.advance()
    } else {
      this.error(`Unexpected token of type ${tokenType}`)
    }
  }

  private check = (tokenType: TokenType) => {
    if (this.isAtEnd()) {
      return false
    } else {
      return this.peek().tokenType === tokenType
    }
  }

  private advance = () => {
    if (!this.isAtEnd()) {
      const currentToken = this.tokens[this.current]
      this.current = this.current + 1
      return currentToken
    } else {
      return this.previous()
    }
  }

  private isAtEnd = () => this.peek()?.tokenType === TokenType.EOF

  private error = (message: string) =>
    new ParseError(this.peek().start, message)
}

class ParseError extends Error {
  constructor(
    public position: number,
    public message: string
  ) {
    super(message)
  }
}
```

These methods are here because parsing our binary nonterminal has introduced us to our first terminals — `AND` and `OR`. When we encounter terminals, we must `consume` the tokens that represent them to move our parser to the next token, or throw an error indicating that we found something we did not expect. When reporting an error, we can use the start position of the token we were due to consume to indicate where something went wrong, and `ParseError` extends the JavaScript `Error` class to store both.

Finally, `check` checks that the passed token matches the current token — and that we're not at the end of our list of tokens, via `isAtEnd`. And `advance` moves us on one once we're ready.

If these look familiar to the methods we wrote for our scanner in the previous post, that's a good spot! Our scanner was parsing a list of characters into a lexical grammar. Our parser parses a list of tokens into a context-free grammar. Both tasks involve inspecting a list of symbols, and parsing them until there aren't any more, or we encounter an error in the grammar. Which leads us to a slight digression, because …

## Good parsers love bad input

A lot of the time, the query we're parsing is going to be incorrect — and not necessarily because its author has done something wrong. Most often, it will be because the statement is incomplete. For example, imagine typing `+tag:type/interactive (Greta OR Climate)`. We're going to see:

- `+` — a chip with an empty key
- `+tag` — a chip with no value token at all
- `+tag:` — a chip with an empty value
- `+tag:type/interactive (` — a group missing a closing bracket
- `+tag:type/interactive (Greta OR` — a binary expression with an operator, but no right-hand expression

If our parser will be spending most of its time failing to parse its input, it will need to provide error messages that our users can understand. Many modern languages work hard to make their error messaging as comprehensible as possible — Rust[^3] and Elm[^4] are two great examples — because the effect on the user experience is so profound.

Consider some error messages for the expressions above. I've written them in the first person, a bit like Elm might, because I think it's _charming._

| #   | Expression                   | Error                                                                |
| --- | ---------------------------- | -------------------------------------------------------------------- |
| 1   | `+`                          | I expected a field name after the `+`, e.g. `+tag`                   |
| 2   | `+tag`, `+tag:`              | I expected a colon and a field value after `+tag`, e.g. `+tag:value` |
| 3   | `+tag:type/interactive (`         | Groups can't be empty. Add an expression after `(`                   |
| 4   | `+tag:type/interactive (Greta OR` | I expected an expression after `OR`                                  |

We haven't written the code for chips and groups yet, but we can definitely improve the error handling for case #4 in our binary parser above. Let's add a check to see if we're at the end of our list of tokens, and throw an error if there's nothing after the operator:

```typescript
// within binary() …
switch (tokenType) {
  case TokenType.OR:
  case TokenType.AND: {
    this.consume(tokenType)

    if (this.isAtEnd()) {
      throw this.error(`I expected an expression after \`${tokenType}\``)
    }

    return new Binary(left, {
      operator: tokenType,
      binary: this.binary(isNested),
    })
  }
  // ... etc
}
```

<div data-parser>+tag:type/interactive (Greta OR</div>

Nice. Now that our `binary()` method has had a spruce, `Expr` is next, implementing the rule `str | group | chip`:

```typescript
export class Expr {
  public readonly type = "Expr"
  constructor(public readonly content: Str | Group | Chip) {}
}

class Parser {
  // ...
  private expr(): Expr {
    const tokenType = this.peek().tokenType
    switch (tokenType) {
      case TokenType.LEFT_BRACKET:
        return new Expr(this.group())
      case TokenType.STRING:
        return new Expr(this.str())
      case TokenType.CHIP_KEY:
        return new Expr(this.chip())
      default:
        throw this.unexpectedTokenError()
    }
  }

  private unexpectedTokenError = () => {
    throw this.error(
      `I didn't expect to find a '${this.peek().lexeme}' ${!this.previous() ? "here." : `after '${this.previous()?.lexeme}'`}`
    )
  }
}
```

A fairly straightforward switch statement, common in expressing `|` relations in rules, and an error if we don't find what we expect. That error message can appear when we encounter a binary operator or right parenthesis instead of an expression: we take care to ensure the message makes sense for start tokens, too.

<div data-parser>) whoops!</div>

We're almost there! In `group()`, writing the rule `'(' binary ')'` is also straightforward:

```typescript
export class Group {
  public readonly type = "Group"
  constructor(public readonly content: Binary) {}
}

class Parser {
  // ...
  private group(): Group {
    this.consume(
      TokenType.LEFT_BRACKET,
      "Groups must start with a left bracket"
    )

    const binary = this.binary(true)

    this.consume(
      TokenType.RIGHT_BRACKET,
      "Groups must end with a right bracket"
    )

    return new Group(binary)
  }
}
```

This also marks the first recursion in our recursive descent — the call to binary sends us back up our list of rules, to descend again.

To ensure that we're handling case #3 in our list of error messages above, we can check to make sure there's a right bracket after we're done consuming the content of our group, throwing an error if we encounter something unexpected:

```typescript
class Parser {
  // ...
  private group(): Group {
    this.consume(TokenType.LEFT_BRACKET, "Groups must start with a left bracket")

    if (this.isAtEnd() || this.peek().tokenType === TokenType.RIGHT_BRACKET) {
      throw this.error("Groups can't be empty. Add an expression after `(`")
    }
    // ...etc
  }
}
```

`str()` is a terminal, so we can simply consume the token and move on:

```typescript
export class CqlStr {
  public readonly type = "CqlStr"
  constructor(public readonly token: Token) {}
}

class Parser {
  // ...
  private str(): Str {
    const token = this.consume(TokenType.STRING, "I expected a string here")

    return new Str(token)
  }
}
```

Finally, `chip()` consumes up to two terminals representing the chip key and value, completing our last rule, `chip -> chip_key chip_value?`. We can add checks to handle errors #1 and #2 above:

```typescript
export class Chip {
  public readonly type = "Chip"
  constructor(
    public readonly key: Token,
    public readonly value?: Token
  ) {}
}

class Parser {
  // ...
  private chip(): Chip {
    // We check to see if there's a literal after we consume this token,
    // so there's no need for an error message here
    const key = this.consume(TokenType.CHIP_KEY)

    if (!key.literal || key.literal === "") {
      throw this.error(
        "I expected the name of a field to search with after the `+`, e.g. `+tag`"
      )
    }

    const maybeValue = this.consume(
      TokenType.CHIP_VALUE,
      `I expected a colon and a field value after \`+${key.literal}\`, e.g. \`+${key.literal}:value\``
    )

    return new Chip(key, maybeValue)
  }
}
```

<div data-parser>+</div>
<div data-parser>+tag</div>
<div data-parser>+tag:type/interactive</div>

That's the end of our grammar. We've just implemented a recursive descent parser for our query language, CQL! It'll parse a valid CQL statement into an AST that represents its underlying structure, and handle common errors by emitting messages that — hopefully! — our users will understand.

The parser running in this post uses the code above, and I've left a few rough edges for the sake of brevity that you might find as you're playing with queries. Take a look at the code in the [CQL project](https://github.com/guardian/cql/blob/main/client/src/lang/parser.ts) to see what a (slightly) more complete implementation might look like.

The next step will be creating a UI powered by this parser to help implement our big list of features in [Part 1](/structured-search-ui-1/). We'll cover that in Part 5.

[^1]: But better still: read it anyway, and let me know what isn't right!

[^2]: [Crafting interpreters — parsing expressions.](https://craftinginterpreters.com/parsing-expressions.html#:~:text=The%20body%20of%20the%20rule%20translates%20to%20code%20roughly%20like%3A)

[^3]: Here's a [Rust blogpost](https://blog.rust-lang.org/2016/08/10/Shape-of-errors-to-come.html) that discusses their approach.

[^4]: … and a [post by the creator of Elm](https://elm-lang.org/news/compiler-errors-for-humans) on Elm's approach to error handling.

<style>
  .parser-container {
    display: flex;
    align-items: center;
    flex-direction: column;
  }

  .parser-container input {
    width: 400px;
    max-width: 100vw;
    margin-bottom: 10px;
  }

  .parser-container input,
  .error-container {
    margin-bottom: 10px;
  }

  .error-container {
    color: red;
  }

  .tree--container {
    display: flex;
    align-items: center;
    flex-direction: column;
    width: 100%;
  }

  .tree {
    display: block;
    max-width: 100%;
    margin-top: 5px;
    overflow-y: scroll;
  }

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
    white-space: initial;
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
    padding-top: .5rem;
    vertical-align: top;
  }

  .tree li:before {
    outline: solid 0.5px #666;
    content: "";
    left: 0;
    position: absolute;
    right: 0;
    top: 1px;
  }

  .tree li:first-child:before {
    left: 50%;
  }

  .tree li:last-child:before {
    right: 50%;
  }

  .tree code,
  .tree li > span {
    background-color: #b4cfdc;
    border-radius: .2em;
    display: inline-block;
    margin: 0 .2em .5em;
    padding: .2em .5em;
    position: relative;
  }

  .node-content {
    background-color: white;
    margin-left: 5px;
    padding: 1px 5px;
  }

  .node-pos {
    line-break:normal;
    padding: 0 4px;
  }

  .tree ul:before,
  .tree code:before,
  .tree li > span:before {
    outline: solid 0.5px #666;
    content: "";
    height: .5em;
    left: 50%;
    position: absolute;
  }

  .tree ul:before {
    top: -.5em;
  }

  .tree code:before,
  .tree li > span:before {
    top: -.55em;
  }

  .tree>li {
    margin-top: 0;
  }

  .tree>li:before,
  .tree>li:after,
  .tree>li>code:before,
  .tree>li>.span:before {
    outline: none;
  }
</style>

<script id="page-script" type="module">
 "use strict";
var _a;
const debug = false;
const TokenType = {
    // Single-character tokens.
    LEFT_BRACKET: "LEFT_BRACKET",
    RIGHT_BRACKET: "RIGHT_BRACKET",
    // Literals.
    STRING: "STRING",
    CHIP_KEY: "CHIP_KEY",
    CHIP_VALUE: "CHIP_VALUE",
    // Keywords.
    AND: "AND",
    OR: "OR",
    EOF: "EOF",
};
class Token {
    constructor(tokenType, lexeme, literal, start, end) {
        this.tokenType = tokenType;
        this.lexeme = lexeme;
        this.literal = literal;
        this.start = start;
        this.end = end;
    }
    toString() {
        return `${this.tokenType} ${this.lexeme} ${this.literal} ${this.start}-${this.end}`;
    }
}
_a = Token;
Token.reservedWordMap = {
    AND: TokenType.AND,
    OR: TokenType.OR,
};
Token.reservedWordStrs = Object.keys(_a.reservedWordMap);
class ParseError extends Error {
    constructor(position, message) {
        super(message);
        this.position = position;
        this.message = message;
    }
}
class Query {
    constructor(content) {
        this.content = content;
        this.type = "Query";
    }
}
class Binary {
    constructor(left, right) {
        this.left = left;
        this.right = right;
        this.type = "Binary";
    }
}
class Expr {
    constructor(content) {
        this.content = content;
        this.type = "Expr";
    }
}
class Group {
    constructor(content) {
        this.content = content;
        this.type = "Group";
    }
}
class Str {
    constructor(token) {
        var _b;
        this.token = token;
        this.type = "Str";
        this.searchExpr = (_b = token.literal) !== null && _b !== void 0 ? _b : "";
    }
}
class Chip {
    constructor(key, value) {
        this.key = key;
        this.value = value;
        this.type = "Chip";
    }
}
class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        // Keep track of the current token.
        this.current = 0;
        this.unexpectedTokenError = () => {
            var _b;
            throw this.error(`I didn't expect to find a '${this.peek().lexeme}' ${!this.previous() ? "here." : `after '${(_b = this.previous()) === null || _b === void 0 ? void 0 : _b.lexeme}'`}`);
        };
        this.consume = (tokenType, message = "") => {
            if (this.check(tokenType)) {
                return this.advance();
            }
            else {
                throw this.error(message);
            }
        };
        this.check = (tokenType) => {
            if (this.isAtEnd()) {
                return false;
            }
            else {
                return this.peek().tokenType === tokenType;
            }
        };
        this.advance = () => {
            if (!this.isAtEnd()) {
                const currentToken = this.tokens[this.current];
                this.current = this.current + 1;
                return currentToken;
            }
            else {
                return this.previous();
            }
        };
        this.previous = () => this.tokens[this.current - 1];
        this.isAtEnd = () => { var _b; return ((_b = this.peek()) === null || _b === void 0 ? void 0 : _b.tokenType) === TokenType.EOF; };
        this.error = (message) => new ParseError(this.peek().start, message);
    }
    parse() {
        return this.query();
    }
    query() {
        const content = this.peek().tokenType === TokenType.EOF ? undefined : this.binary();
        return new Query(content);
    }
    binary() {
        this.debug("binary");
        const left = this.expr();
        const tokenType = this.peek().tokenType;
        switch (tokenType) {
            // If we have an explicit binary operator, use it ...
            case TokenType.OR:
            case TokenType.AND: {
                this.consume(tokenType);
                if (this.isAtEnd()) {
                    throw this.error(`I expected an expression after \`${tokenType}\``);
                }
                return new Binary(left, {
                    operator: tokenType,
                    binary: this.binary(),
                });
            }
            case TokenType.RIGHT_BRACKET:
            case TokenType.EOF: {
                return new Binary(left);
            }
            // ... or default to OR.
            default: {
                return new Binary(left, {
                    operator: TokenType.OR,
                    binary: this.binary(),
                });
            }
        }
    }
    expr() {
        this.debug("expr");
        const tokenType = this.peek().tokenType;
        switch (tokenType) {
            case TokenType.LEFT_BRACKET:
                return new Expr(this.group());
            case TokenType.STRING:
                return new Expr(this.str());
            case TokenType.CHIP_KEY:
                return new Expr(this.chip());
            default:
                throw this.unexpectedTokenError();
        }
    }
    group() {
        this.debug("group");
        this.consume(TokenType.LEFT_BRACKET, "Groups must start with a left bracket");
        if (this.isAtEnd() || this.peek().tokenType === TokenType.RIGHT_BRACKET) {
            throw this.error("Groups can't be empty. Put a search term between the brackets!");
        }
        const binary = this.binary();
        this.consume(TokenType.RIGHT_BRACKET, "Groups must end with a right bracket");
        return new Group(binary);
    }
    str() {
        this.debug("str");
        const token = this.consume(TokenType.STRING, "Expected a string");
        return new Str(token);
    }
    chip() {
        this.debug("chip");
        const key = this.consume(TokenType.CHIP_KEY, "I expected a field name after the `+`, e.g. `+tag`");
        if (!key.literal || key.literal === "") {
            throw this.error("I expected the name of a field to search with after the `+`, e.g. `+tag`");
        }
        const maybeValue = this.consume(TokenType.CHIP_VALUE,  `I expected a colon and a field value after \`+${key.literal}\`, e.g. \`+${key.literal}:value\``);
        return new Chip(key, maybeValue);
    }
    peek() {
        return this.tokens[this.current];
    }
    debug(location) {
        if (debug) {
            console.log(location, this.peek().tokenType);
        }
    }
}
const whitespaceR = /\s/;
const isWhitespace = (str) => whitespaceR.test(str);
const letterOrDigitR = /[0-9A-z]/;
const isLetterOrDigit = (str) => letterOrDigitR.test(str);
class Scanner {
    constructor(program) {
        this.program = program;
        this.tokens = [];
        this.start = 0;
        this.current = 0;
        this.line = 1;
        this.scanTokens = () => {
            while (!this.isAtEnd()) {
                // We are at the beginning of the next lexeme.
                this.start = this.current;
                this.scanToken();
            }
            return this.tokens.concat(new Token(TokenType.EOF, "", undefined, this.current, this.current));
        };
        this.scanToken = () => {
            switch (this.advance()) {
                case "+":
                    this.addKey(TokenType.CHIP_KEY);
                    return;
                case ":":
                    this.addValue();
                    return;
                case "(":
                    this.addToken(TokenType.LEFT_BRACKET);
                    return;
                case ")":
                    this.addToken(TokenType.RIGHT_BRACKET);
                    return;
                case " ":
                    return;
                case "\r":
                case "\t":
                case '"':
                    this.addString();
                    return;
                default:
                    this.addIdentifierOrUnquotedString();
                    return;
            }
        };
        this.addKey = (tokenType) => {
            while (this.peek() != ":" && !isWhitespace(this.peek()) && !this.isAtEnd())
                this.advance();
            if (this.current - this.start === 1)
                this.addToken(tokenType);
            else {
                const key = this.program.substring(this.start + 1, this.current);
                this.addToken(tokenType, key);
            }
        };
        this.addValue = () => {
            while (!isWhitespace(this.peek()) && !this.isAtEnd())
                this.advance();
            if (this.current - this.start == 1) {
                this.addToken(TokenType.CHIP_VALUE);
            }
            else {
                const value = this.program.substring(this.start + 1, this.current);
                this.addToken(TokenType.CHIP_VALUE, value);
            }
        };
        this.addIdentifierOrUnquotedString = () => {
            while (isLetterOrDigit(this.peek())) {
                this.advance();
            }
            const text = this.program.substring(this.start, this.current);
            const maybeReservedWord = Token.reservedWordMap[text];
            return maybeReservedWord
                ? this.addToken(maybeReservedWord)
                : this.addUnquotedString();
        };
        this.addUnquotedString = () => {
            while (
            // Consume whitespace up until the last whitespace char
            (!isWhitespace(this.peek()) ||
                isWhitespace(this.peek(1)) ||
                this.isAtEnd(1)) &&
                this.peek() != ")" &&
                !this.isAtEnd()) {
                this.advance();
            }
            this.addToken(TokenType.STRING, this.program.substring(this.start, this.current));
        };
        this.addString = () => {
            while (this.peek() != '"' && !this.isAtEnd()) {
                this.advance();
            }
            if (this.isAtEnd()) {
                this.error(this.line, "Unterminated string at end of file");
            }
            else {
                this.advance();
            }
            this.addToken(TokenType.STRING, this.program.substring(this.start + 1, this.current - 1));
        };
        this.addToken = (tokenType, literal) => {
            const text = this.program.substring(this.start, this.current);
            this.tokens = this.tokens.concat(new Token(tokenType, text, literal, this.start, this.current - 1));
        };
        this.advance = () => {
            const previous = this.current;
            this.current = this.current + 1;
            return this.program[previous];
        };
        this.peek = (offset = 0) => this.program[this.current + offset] === undefined
            ? "\u0000"
            : this.program[this.current + offset];
        this.isAtEnd = (offset = 0) => this.current + offset === this.program.length;
        this.error = (line, message) => this.report(line, "", message);
        this.report = (line, where, message) => {
            console.log(`[line ${line}] Error${where}: ${message}`);
        };
    }
}

    const getDebugTokenHTML = (tokens) => {
        let html = `
        <div class="CqlDebug__queryDiagram CqlDebug__queryDiagramToken">
        <div class="CqlDebug__queryDiagramLabel">
            <div>Lexeme</div>
            <div>Literal</div>
        </div>
        <div class="CqlDebug__queryDiagramContent">`;
        tokens.forEach((token, index) => {
            var _b, _c;
            html += `${Array(Math.max(1, token.lexeme.length))
                .fill(undefined)
                .map((_, index) => {
                var _b, _c;
                const lexemeChar = token.lexeme[index];
                const literalOffset = ((_b = token.literal) === null || _b === void 0 ? void 0 : _b.length) === token.lexeme.length ? 0 : 1;
                const literalChar = (_c = token.literal) === null || _c === void 0 ? void 0 : _c[index - literalOffset];
                return `
            <div class="CqlDebug__queryBox">
            <div class="CqlDebug__queryIndex">${token.start + index}</div>
            ${lexemeChar !== undefined
                    ? `<div class="CqlDebug__queryChar">${lexemeChar}</div>`
                    : ""}
                ${literalChar !== undefined
                    ? `<div class="CqlDebug__queryChar CqlDebug__queryCharAlt">${literalChar}</div>`
                    : ""}
            ${index === 0
                    ? `<div class="CqlDebug__tokenLabel">${token.tokenType}</div>`
                    : ""}
            </div>`;
            })
                .join("")}
        ${((_b = tokens[index + 1]) === null || _b === void 0 ? void 0 : _b.start) > token.end + 1 && ((_c = tokens[index + 1]) === null || _c === void 0 ? void 0 : _c.tokenType) !== "EOF" && token.tokenType !== "EOF"
                ? `<div class="CqlDebug__queryBox"><div class="CqlDebug__queryIndex">${token.end + 1}</div></div>`
                : ""}`;
        });
        html += "</div></div>";
        return html;
    }

const getDebugASTHTML = (query) => {
    return `<div class="tree--container">
    ${getQueryHTML(query)}
  </div>`;
};
const getQueryHTML = (query) => {
    const queryHTML = query.content ? `
    <ul>
      <li>${getBinaryHTML(query.content)}</li>
    </ul>` : ""
    return `<ul class="tree">
    <li>
      ${getNodeHTML(query)}
      ${queryHTML}
    </li>
  </ul>`;
};
const getExprHTML = (query) => {
    const { content }  = query;
    const html = (() => {
        switch (content.type) {
            case "Binary":
                return getBinaryHTML(content);
            case "Chip":
                return getChipHTML(content);
            case "Group":
                return getGroupHTML(content);
            case "Str":
                return getStrHTML(content);
            default:
                console.error(`No HTML representation for ${content.type}`)
        }
    })();
    return `
    <ul>
      <li>
        <span>${getNodeHTML(query)}</span>
        ${html}
      </li>
    </ul>`;
};
const getBinaryHTML = (query) => {
    const maybeRight = query.right;
    const leftHTML = getExprHTML(query.left)
    const binaryContent = maybeRight ? `
     <ul>
        <li>${leftHTML}</li>
        <li>${getBinaryHTML(maybeRight.binary)}</li>
      </ul>
  ` : leftHTML;
    return `
    <ul>
      <li>
        <span>
          ${getNodeHTML(query)}
          ${maybeRight ? `<span class="node-content">${maybeRight.operator}</span>` : ``}
        </span>
        ${binaryContent}
      </li>
    </ul>
  `;
};
const getChipHTML = (chip) => {
    return `
    <ul>
      <li>
        <span>${getNodeHTML(chip)}</span>
        <ul>
          <li>${getTokenHTML(chip.key)}</li>
          ${chip.value ? `<li>${getTokenHTML(chip.value)}</li>` : ""}
        </ul>
    </ul>
  `;
};
const getTokenHTML = (token) => {
    return `
    <span>${token.tokenType}
    <span class="node-content">${token.literal}</span>
      <span class="node-pos">${token.start}‑${token.end}</span>
    </span>
  `;
};
const getGroupHTML = (group) => {
    return `
    <ul>
      <li>
        ${getNodeHTML(group)}
        ${getBinaryHTML(group.content)}
      </li>
    </ul>
  `;
};
const getStrHTML = (str) => {
  return `
    <ul>
      <li>
        <span>
          ${getNodeHTML(str)}
          <span class="node-content">${str.searchExpr}</span>
          <span class="node-pos">${str.token.start}‑${str.token.end}</span>
        </span>
      </li>
    </ul>
  `;
};
const getNodeHTML = (node) => `<span class="node-description">${node.type}</span>`;


    // Userland

    const createParser = (el, initialQuery) => {
        el.innerHTML = "";
        el.classList.add("parser-container")
        const input = document.createElement("input");
        input.value = initialQuery;
        el.appendChild(input);
        const resultContainer = document.createElement("div");
        resultContainer.classList.add("result-container");
        el.appendChild(resultContainer);

        const applyScan = value => {
            const scanner = new Scanner(value);
            const tokens = scanner.scanTokens();
            const parser = new Parser(tokens);
            try {
              const ast = parser.parse();
              console.log(ast)
              resultContainer.innerHTML = getDebugASTHTML(ast);
            } catch(e) {
              resultContainer.innerHTML = `<div class="error-container">Error at position ${e.position}: ${e.message}</div>`
            }
        }

        input.addEventListener("input", e => {
            const value = e.target.value;
            applyScan(value);
        })

        applyScan(initialQuery);
    }

    document.querySelectorAll("[data-parser]").forEach(el => {
        createParser(el, el.innerText)
    });
</script>