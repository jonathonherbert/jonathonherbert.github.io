---
title: "Structured search queries for web UIs, part 4: parsing"
date: "2024-10-29T01:30:03.284Z"
description: "Grammar (parsin') time"
draft: true
---

<div data-parser>why not +edit:me? OR not</div>

In [part 3](./structured-search-part-3), we implemented a scanner that could turn a CQL query string into a list of tokens — the alphabet that is used by the CQL grammar. In this post, we'll write a parser that accepts a list of tokens, and outputs an Abstract Syntax Tree (AST) that represents the query as it's structured by the syntax of our grammar.

"Syntax" is a word to describe the rules for correct arrangement of symbols (in our case, tokens) in a language. Of course, there are many ways for that arrangement to be incorrect, and so it's also the parser's job to give a sensible error message when our list of tokens doesn't make sense.

A reasonable person might ask at this point: what's an AST? Our definition of "syntax" above gives us a clue — it's a tree structure that represents an expression that in a particular language's grammar.

That covers the "Syntax Tree" part; the tree is "Abstract" because it will gloss over many details of the syntax in favour of representing its structure. This will become clearer as we examine the structure the parser creates, and the top of this post gives us a visualisation of what that tree looks like, so we have a sense of what we're building before we begin.

<h2>The (recursive) descent 🕳️</h2>

There are many ways to write a parser, but I'm only qualified to write one sort at the time of writing — a recursive descent parser. Luckily, I'm reliably informed that recursive descent is [great.](https://craftinginterpreters.com/parsing-expressions.html#:~:text=use%20recursive%20descent.-,It%20rocks.,-Recursive%20descent%20is) Specifically, recursive descent parsers tend to be:

- Fast.
- Great at giving comprehensible error messages.
- Easy to write.

In the context of this post, the latter point is important. If you're new to this subject and the idea of writing a parser is as daunting as spelunking into [an actual cave](https://en.wikipedia.org/wiki/The_Descent), don't worry. We'll spelunk together, and I suspect you'll be pleasantly surprised at how straightforward this part of the task is.

Recursive descent parsers are easy to write because their different parts correspond to the structure of the grammar we've already written. Bob Nystrom has a neat summary of this mapping in Crafting Interpreters that I'll reproduce here:[^1]

|Grammar notation|Code representation|
|-|-|
| Terminal	| Code to match and consume a token |
| Nonterminal	 | Call to that rule’s function |
| \|	| `if` or `switch` statement |
| * or +	| `while` or `for` loop |
| ?	| `if` statement |

As we parse a given CQL expression, we're going to use these rules as we _descend_ through the grammar, _recursing_ through our rules until we've consumed all our tokens (or thrown an error in the process.) And that's why it's called recursive descent! As a reminder, our grammar looks like:

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
    private current: number = 0;

    constructor(private tokens: Token[]) {}

    public parse(): Query {
        // ???
    }
}
```

You can see that we've a constructor that gives us our list of tokens, and a `parse` method that returns a `Query` to its caller: the first nonterminal in our grammar. Our `Query` can be a plain type here, for simplicity. Its first property will be a discriminator field, `type`, to allow us to identify it. Another field will hold its optional content, `Binary`, which we'll come to define shortly:

```typescript
export class Query {
  public readonly type = "Query";
  constructor(public readonly content?: Binary) {}
}
```

Back in our class, our nonterminal `Query` maps to a call to that rule's function, so we'll update our method:

```typescript
class Parser {
    // ...

    public parse(): Query {
        return this.query();
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

If our statement is completely empty, the next token we parse will be an `EOF`. We'll check to see if we should stop parsing and return an empty `Query` object, or continue recursing through our grammar by descending into our next nonterminal. We know that will be a `Binary`, so our next method will be `binary()`.

```typescript

class Parser {
    // ...

    private query(): Query {
        const content = this.peek().tokenType === TokenType.EOF
            ? undefined
            : this.binary();

        return new Query(content);
    }

    private peek(): Token {
        return this.tokens[this.current];
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
  public readonly type = "Binary";
  constructor(
    public readonly left: Expr,
    public readonly right?: {
      operator: "OR" | "AND";
      binary: Binary;
    }
  ) {}
}
```

Writing `binary()`, we can express `expr (('AND' | 'OR')? binary)` clearly in the code, too.

```typescript
class Parser {
    // ...
  private binary(isNested: boolean = false): Binary {
    const left = this.expr();

    const tokenType = this.peek().tokenType;

    switch (tokenType) {
      // If we have an explicit binary operator, use it ...
      case TokenType.OR:
      case TokenType.AND: {
        this.consume(tokenType);
        return new Binary(left, {
          operator: tokenType,
          binary: this.binary(isNested),
        });
      }
      case TokenType.EOF: {
        return new Binary(left);
      }
      // ... or default to OR.
      default: {
        return new Binary(left, {
          operator: TokenType.OR,
          binary: this.binary(isNested),
        });
      }
    }
  }
}
```

Hopefully the logic here is clear enough — we acquire our binary's left hand side with the yet-to-be-defined `this.expr()`. We then optionally fill out its right hand side with either an explicit binary operator (`AND|OR`) or another expression — unless we've come to the end of our list of tokens.

But woah! We've also introduced four important methods here: `consume`, `check`, `isAtEnd` and `advance`. Here's what they look like:

```typescript
class Parser {
    // ...
  private consume = (tokenType: TokenType): Token => {
    if (this.check(tokenType)) {
      return this.advance();
    } else {
      this.error(`Unexpected token of type ${tokenType}`);
    }
  };

  private check = (tokenType: TokenType) => {
    if (this.isAtEnd()) {
      return false;
    } else {
      return this.peek().tokenType === tokenType;
    }
  };

  private advance = () => {
    if (!this.isAtEnd()) {
      const currentToken = this.tokens[this.current];
      this.current = this.current + 1;
      return currentToken;
    } else {
      return this.previous();
    }
  };

  private isAtEnd = () => this.peek()?.tokenType === TokenType.EOF;

  private error = (message: string) =>
    new ParseError(this.peek().start, message);
}

class ParseError extends Error {
  constructor(
    public position: number,
    public message: string
  ) {
    super(message);
  }
}
```

These methods are here because parsing our binary nonterminal has introduced us to our first terminals — `AND` and `OR`. When we encounter terminals, we must `consume` the tokens that represent them to point our parser at the next current token, or throw an error indicating that we found something we did not expect. `check` checks that the passed token matches the current token — and that we're not at the end of our list of tokens, via `isAtEnd`. And `advance` moves us on one once we're ready.

If these look familiar to the methods we wrote for our scanner in the previous post, that's a good spot! Our scanner was parsing a list of characters for a lexical grammar. Our parser parses a list of tokens for a context-free grammar. But both tasks involve inspecting a list of symbols, and consuming them until there aren't any more, or we encounter an error in the grammar. Which leads us to a slight digression, because ...

## Good parsers love bad input

A lot of the time, the query we're parsing is going to be incorrect — and not necessarily because its author has done something wrong. Most often, it will be because the statement is incomplete. For example, imagine typing `+tag:interactive (Greta OR Climate)`. We're going to see:

- a chip with an empty key (`+`)
- a chip with no value token at all (`+tag`)
- a chip with an empty value (`+tag:`)
- a group with open parenthesis (`+tag:interactive (`)
- a binary expression with no right hand expression (`+tag:interactive (Greta OR`)

If our parser will be spending most of its time failing to parse its input, it needs to provide errors that our users can understand. Many modern languages work hard to make their error messaging as comprehensible as possible — Rust^2 and Elm^3 are two great examples — because the effect on the user experience is so profound.

Consider some error messages for the expressions above. I've written them in the first person, a bit like Elm might, because I think it's charming.

-|Expression|Error
--|--|--
1| `+`| I expected a field name after the `+`, e.g. `+tag`
2| `+tag`, `+tag:` | I expected a colon and a field value after `+tag`, e.g. `+tag:value`
3| `+tag:interactive (`| I expected a closing bracket after `(`
4| `+tag:interactive (Greta OR`| I expected an expression after `OR`

We haven't written the code for chips and groups yet, but we can definitely improve the error handling for case #4 in our binary parser above. Let's add a check to see if we're at the end of our list of tokens, and throw an error if there's nothing after the operator:

```typescript
    switch (tokenType) {
      case TokenType.OR:
      case TokenType.AND: {
        this.consume(tokenType);

        if (this.isAtEnd()) {
          throw this.error(`I expected an expression after ${tokenType}`);
        }

        return new Binary(left, {
          operator: tokenType,
          binary: this.binary(isNested),
        });
      }
      // ... etc
    }
```

Now our binary method has had a spruce, `Expr` is next, implementing the rule `str | group | chip`:

```typescript
export class Expr {
  public readonly type = "Expr";
  constructor(
    public readonly content: Str | Group | Chip
  ) {}
}

class Parser {
    // ...
  private expr(): Expr {
    const tokenType = this.peek().tokenType
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

  private unexpectedTokenError = () => {
    throw this.error(
      `I didn't expect to find a '${this.peek().lexeme}' ${!this.previous() ? "here." : `after '${this.previous()?.lexeme}'`}`
    );
  };
}
```

A fairly straightforward switch statement, common in expressing `|` relations in rules, and an error if we don't find what we expect.

We're almost there! In `group()`, expressing `'(' binary ')'` also fairly straightforward:

```typescript
export class Group {
  public readonly type = "Group";
  constructor(public readonly content: Binary) {}
}

class Parser {
    // ...
  private group(): Group {
    this.consume(
      TokenType.LEFT_BRACKET,
      "Groups should start with a left bracket"
    );

    const binary = this.binary(true);

    this.consume(
      TokenType.RIGHT_BRACKET,
      "Groups must end with a right bracket."
    );

    return new Group(binary);
  }
}
```

This also marks the first recursion in our recursive descent — the call to binary sends us back up our list of rules, to descend again.

`str()` is a terminal, so we can simply consume the token and move on:

```typescript
export class CqlStr {
  public readonly type = "CqlStr";
  constructor(public readonly token: Token) {}
}

class Parser {
    // ...
  private str(): Str {
    const token = this.consume(TokenType.STRING, "Expected a string");

    return new Str(token);
  }
}
```

Finally, `chip()` consumes up to two terminals representing the chip key and value, completing our last rule, `chip -> chip_key chip_value?`:

```typescript
export class Chip {
  public readonly type = "Chip";
  constructor(
    public readonly key: Token,
    public readonly value?: Token
  ) {}
}

class Parser {
  // ...
  private chip(): Chip {
    const key = this.consume(
      TokenType.CHIP_KEY,
      "Expected a search key, e.g. +tag"
    );

    const maybeValue = this.consume(TokenType.CHIP_VALUE, "");

    return new Chip(key, maybeValue);
  }
}
```

That's the end of our grammar. We've just implemented a recursive descent parser for our query language, CQL! It'll parse any valid CQL statement into an AST that represents its underlying structure. Even better, it'll handle common errors gracefully in a way that — we hope! — our users will understand.

The next step — a UI that uses this grammar to help implement the many features we came up with in part 1. Is it possible? Desirable, even? It's all to come in part 5.

[^1]: https://craftinginterpreters.com/parsing-expressions.html#:~:text=The%20body%20of%20the%20rule%20translates%20to%20code%20roughly%20like%3A

[^2]: Here's a [Rust blogpost](https://blog.rust-lang.org/2016/08/10/Shape-of-errors-to-come.html) that discusses their approach.

[^3]: Similarly, here's a [post by the creator of Elm](https://elm-lang.org/news/compiler-errors-for-humans) on their approach to error handling. Note the importance of position and colour, too!

Todo:

- Reread

Field:

Binaries:

```typescript
        if (this.isAtEnd()) {
          throw this.error(
            `There must be a query following '${tokenType}', e.g. this ${tokenType} that.`
          );
        }
        ```

chips: taken care of in program

groups:

<style>


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
    padding: .5rem 0;
    vertical-align: top;
  }

  .tree li:before {
    outline: solid 0.5px #666;
    content: "";
    left: 0;
    position: absolute;
    right: 0;
    top: -1px;
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
    // ----- Imports ----- //
// ----- Types ----- //
var _a;
var OptionKind;
(function (OptionKind) {
    OptionKind[OptionKind["Some"] = 0] = "Some";
    OptionKind[OptionKind["None"] = 1] = "None";
})(OptionKind || (OptionKind = {}));
// ----- Constructors ----- //
const some = (a) => ({ kind: OptionKind.Some, value: a });
const none = { kind: OptionKind.None };
/**
 * Turns a value that may be `null` or `undefined` into an `Option`.
 * If it's `null` or `undefined` the `Option` will be a `None`. If it's
 * some other value the `Option` will be a `Some` "wrapping" that value.
 * @param a The value that may be `null` or `undefined`
 * @returns {Option<A>} An `Option`
 */
const fromNullable = (a) => a === null || a === undefined ? none : some(a);
// ----- Functions ----- //
/**
 * Returns the value if `Some`, otherwise returns `a`. You can think of it
 * as "unwrapping" the `Option`, getting you back a plain value
 * @param a The value to fall back to if the `Option` is `None`
 * @param optA The Option
 * @returns {A} The value for a `Some`, `a` for a `None`
 * @example
 * const bylineOne = some('CP Scott');
 * withDefault('Jane Smith')(bylineOne); // Returns 'CP Scott'
 *
 * const bylineTwo = none;
 * withDefault('Jane Smith')(bylineTwo); // Returns 'Jane Smith'
 */
const withDefault = (a) => (optA) => optA.kind === OptionKind.Some ? optA.value : a;
/**
 * Applies a function to a `Some`, does nothing to a `None`.
 * @param f The function to apply
 * @param optA The Option
 * @returns {Option<B>} A new `Option`
 * @example
 * const creditOne = some('Nicéphore Niépce');
 * // Returns Some('Photograph: Nicéphore Niépce')
 * map(name => `Photograph: ${name}`)(creditOne);
 *
 * const creditTwo = none;
 * map(name => `Photograph: ${name}`)(creditTwo); // Returns None
 *
 * // All together
 * compose(withDefault(''), map(name => `Photograph: ${name}`))(credit);
 */
/**
 * Takes two Options and applies a function if both are `Some`,
 * does nothing if either are a `None`.
 * @param f The function to apply
 * @param optA The first Option
 * @param optB The second Option
 * @returns {Option<C>} A new `Option`
 */
const map2 = (f) => (optA) => (optB) => optA.kind === OptionKind.Some && optB.kind === OptionKind.Some
    ? some(f(optA.value, optB.value))
    : none;
/**
 * Like `map` but applies a function that *also* returns an `Option`.
 * Then "unwraps" the result for you so you don't end up with
 * `Option<Option<A>>`
 * @param f The function to apply
 * @param optA The Option
 * @returns {Option<B>} A new `Option`
 * @example
 * type GetUser = number => Option<User>;
 * type GetUserName = User => Option<string>;
 *
 * const userId = 1;
 * const username: Option<string> = compose(andThen(getUserName), getUser)(userId);
 */
// ----- Exports ----- //
// ----- Types ----- //
var ResultKind;
(function (ResultKind) {
    ResultKind[ResultKind["Ok"] = 0] = "Ok";
    ResultKind[ResultKind["Err"] = 1] = "Err";
})(ResultKind || (ResultKind = {}));
// ----- Constructors ----- //
const ok = (a) => ({ kind: ResultKind.Ok, value: a });
const err = (e) => ({ kind: ResultKind.Err, err: e });
// ----- Functions ----- //
/**
 * The method for turning a `Result<E, A>` into a plain value.
 * If this is an `Err`, apply the first function to the error value and
 * return the result. If this is an `Ok`, apply the second function to
 * the value and return the result.
 * @param f The function to apply if this is an `Err`
 * @param g The function to apply if this is an `Ok`
 * @param result The Result
 * @example
 * const flakyTaskResult: Result<string, number> = flakyTask(options);
 *
 * either(
 *     data => `We got the data! Here it is: ${data}`,
 *     error => `Uh oh, an error: ${error}`,
 * )(flakyTaskResult)
 */
const either = (result) => (f, g) => result.kind === ResultKind.Ok ? g(result.value) : f(result.err);
/**
 * The companion to `map`.
 * Applies a function to the error in `Err`, does nothing to an `Ok`.
 * @param f The function to apply if this is an `Err`
 * @param result The Result
 */
const mapError = (f) => (result) => result.kind === ResultKind.Err ? f(result.err) : result;
/**
 * Converts a `Result<E, A>` into an `Option<A>`. If the result is an
 * `Ok` this will be a `Some`, if the result is an `Err` this will be
 * a `None`.
 * @param result The Result
 */
const toOption = (result) => result.kind === ResultKind.Ok ? some(result.value) : none;
/**
 * Similar to `Option.map`.
 * Applies a function to the value in an `Ok`, does nothing to an `Err`.
 * @param f The function to apply if this is an `Ok`
 * @param result The Result
 */
const map = (f) => (result) => result.kind === ResultKind.Ok ? ok(f(result.value)) : result;
/**
 * Similar to `Option.andThen`. Applies to a `Result` a function that
 * *also* returns a `Result`, and unwraps them to avoid nested `Result`s.
 * Can be useful for stringing together operations that might fail.
 * @example
 * type RequestUser = number => Result<string, User>;
 * type GetEmail = User => Result<string, string>;
 *
 * // Request fails: Err('Network failure')
 * // Request succeeds, problem accessing email: Err('Email field missing')
 * // Both succeed: Ok('email_address')
 * andThen(getEmail)(requestUser(id))
 */
const andThen = (f) => (result) => result.kind === ResultKind.Ok ? f(result.value) : result;
/**
 * Takes a list of `Result`s and separates out the `Ok`s from the `Err`s.
 * @param results A list of `Result`s
 * @return {Partitioned} An object with two fields, one for the list of `Err`s
 * and one for the list of `Ok`s
 */
const partition = (results) => results.reduce(({ errs, oks }, result) => either(result)((err) => ({ errs: [...errs, err], oks }), (ok) => ({ errs, oks: [...oks, ok] })), { errs: [], oks: [] });
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
            this.isAtEnd = (offset = 0) => this.current + offset === this.program.length;
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
                if (this.current - this.start == 1)
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
            this.error = (line, message) => this.report(line, "", message);
            this.report = (line, where, message) => {
                console.log(`[line ${line}] Error${where}: ${message}`);
            };
        }
    }

const createQuery = (content) => ({
  type: "Query",
  content,
});

const createQueryBinary = (left, right) => ({
    type: "QueryBinary",
    left,
    right,
});
const createQueryContent = (content) => ({
    type: "QueryContent",
    content,
});
const createQueryGroup = (content) => ({
    type: "QueryGroup",
    content,
});
const createQueryStr = (token) => {
    var _b;
    return ({
        type: "QueryStr",
        searchExpr: (_b = token.literal) !== null && _b !== void 0 ? _b : "",
        token,
    });
};
const createQueryField = (key, value) => ({
    type: "QueryField",
    key,
    value,
});
class ParseError extends Error {
    constructor(position, message) {
        super(message);
        this.position = position;
        this.message = message;
    }
}

class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.current = 0;
        /**
         * Throw a sensible parse error when a query field or output modifier is
         * found in the wrong place.
         */
        this.guardAgainstQueryField = (errorLocation) => {
            switch (this.peek().tokenType) {
                case TokenType.CHIP_KEY: {
                    const queryFieldNode = this.queryField();
                    throw this.error(`You cannot query for the field “${queryFieldNode.key.literal}” ${errorLocation}`);
                }
                default:
                    return;
            }
        };
        this.check = (tokenType) => {
            if (this.isAtEnd()) {
                return false;
            }
            else {
                return this.peek().tokenType == tokenType;
            }
        };
        this.isAtEnd = () => { var _a; return ((_a = this.peek()) === null || _a === void 0 ? void 0 : _a.tokenType) === TokenType.EOF; };
        this.peek = () => this.tokens[this.current];
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
        this.consume = (tokenType, message = "") => {
            if (this.check(tokenType)) {
                return this.advance();
            }
            else {
                throw this.error(message);
            }
        };
        this.safeConsume = (tokenType, message = "") => {
            try {
                return ok(this.consume(tokenType, message));
            }
            catch (e) {
                if (e instanceof ParseError) {
                    return err(e);
                }
                throw e;
            }
        };
        this.previous = () => this.tokens[this.current - 1];
        this.error = (message) => new ParseError(this.peek().start, message);
        this.unexpectedTokenError = () => {
            var _a;
            throw this.error(`I didn't expect to find a '${this.peek().lexeme}' ${!this.previous() ? "here." : `after '${(_a = this.previous()) === null || _a === void 0 ? void 0 : _a.lexeme}'`}`);
        };
    }
    parse() {
        try {
            return ok(this.query());
        }
        catch (e) {
            if (e instanceof ParseError) {
                return err(e);
            }
            throw e;
        }
    }
    query() {
        const content = this.peek().tokenType === TokenType.EOF ? undefined : this.queryBinary();
        if (this.peek().tokenType !== TokenType.EOF) {
            throw this.unexpectedTokenError();
        }
        return createQuery(content);
    }
    queryBinary(isNested = false) {
        if (this.peek().tokenType === TokenType.CHIP_VALUE)
            throw new ParseError(this.peek().start, "I found an unexpected ':'. Did you intend to search for a tag, section or similar, e.g. tag:news? If you would like to add a search phrase containing a ':' character, please surround it in double quotes.");
        const left = this.queryContent();
        if (isNested) {
            this.guardAgainstQueryField("within a group");
        }
        switch (this.peek().tokenType) {
            case TokenType.AND: {
                const andToken = this.consume(TokenType.AND);
                this.guardAgainstQueryField("after 'AND'.");
                if (this.isAtEnd()) {
                    throw this.error("There must be a query following 'AND', e.g. this AND that.");
                }
                return createQueryBinary(left, [andToken, this.queryBinary(isNested)]);
            }
            case TokenType.OR: {
                const orToken = this.consume(TokenType.OR);
                this.guardAgainstQueryField("after 'OR'.");
                if (this.isAtEnd()) {
                    throw this.error("There must be a query following 'OR', e.g. this OR that.");
                }
                return createQueryBinary(left, [orToken, this.queryBinary(isNested)]);
            }
            case TokenType.RIGHT_BRACKET:
            case TokenType.EOF: {
                return createQueryBinary(left);
            }
            default: {
                return createQueryBinary(left, [
                    new Token(TokenType.OR, "", undefined, 0, 0),
                    this.queryBinary(isNested),
                ]);
            }
        }
    }
    queryContent() {
        switch (this.peek().tokenType) {
            case TokenType.LEFT_BRACKET:
                return createQueryContent(this.queryGroup());
            case TokenType.STRING:
                return createQueryContent(this.queryStr());
            default: {
                const { tokenType } = this.peek();
                if ([TokenType.AND, TokenType.OR].some((i) => i === tokenType)) {
                    throw this.error(`An ${tokenType.toString()} keyword must have a search term before and after it, e.g. this ${tokenType.toString()} that.`);
                }
                switch (this.peek().tokenType) {
                    case TokenType.CHIP_KEY: {
                        return createQueryContent(this.queryField());
                    }
                    default: {
                        throw this.unexpectedTokenError();
                    }
                }
            }
        }
    }
    queryGroup() {
        this.consume(TokenType.LEFT_BRACKET, "Groups should start with a left bracket");
        if (this.isAtEnd() || this.peek().tokenType === TokenType.RIGHT_BRACKET) {
            throw this.error("Groups can't be empty. Put a search term between the brackets!");
        }
        this.guardAgainstQueryField("within a group. Try putting this search term outside of the brackets!");
        const binary = this.queryBinary(true);
        this.consume(TokenType.RIGHT_BRACKET, "Groups must end with a right bracket.");
        return createQueryGroup(binary);
    }
    queryStr() {
        const token = this.consume(TokenType.STRING, "Expected a string");
        return createQueryStr(token);
    }
    queryField() {
        const key = this.consume(TokenType.CHIP_KEY, "Expected a search key, e.g. +tag");
        const maybeValue = this.safeConsume(TokenType.CHIP_VALUE, "Expected a search value, e.g. +tag:new");
        return either(maybeValue)(() => createQueryField(key, undefined), (value) => createQueryField(key, value));
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
const getContentHTML = (query) => {
    const html = (() => {
        switch (query.content.type) {
            case "QueryBinary":
                return getBinaryHTML(query.content);
            case "QueryField":
                return getFieldHTML(query.content);
            case "QueryGroup":
                return getGroupHTML(query.content);
            case "QueryStr":
                return getStrHTML(query.content);
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
    const maybeRight = query.right?.[1];
    const binaryContent = maybeRight ? `
     <ul>
        <li>${getContentHTML(query.left)}</li>
        <li>${getBinaryHTML(maybeRight)}</li>
      </ul>
  ` : getContentHTML(query.left);
    return `
    <ul>
      <li>
        <span>${getNodeHTML(query)}</span>
        ${binaryContent}
      </li>
    </ul>
  `;
};
const getFieldHTML = (field) => {
    return `
    <ul>
      <li>
        <span>${getNodeHTML(field)}</span>
        <ul>
          <li>${getTokenHTML(field.key)}</li>
          ${field.value ? `<li>${getTokenHTML(field.value)}</li>` : ""}
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
        ${getQueryHTML(group.content)}
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
        el.classList.add("scanner-container")
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
            const ast = parser.parse();

            if (ast.value) {
 resultContainer.innerHTML = getDebugASTHTML(ast.value);
            } else {
                resultContainer.innerHTML = ast.err.message
            }
            console.log(ast)

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
