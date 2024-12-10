---
title: "Structured search queries for web UIs, part 3: scanning"
date: "2024-10-24T01:30:03.284Z"
description: "Let's teach our computer to CQL"
draft: false
---

We finished [part 2](./structured-search-part-2) by writing a grammar that described our query language, CQL. Now it's time to write the code we need to parse it — to resolve CQL expressions into the structure and the symbols we described in our grammar, or throw an error trying.

There are two parts to this process:

- **Scanning** takes an input from a larger alphabet (in our case, the character set provided by utf-8), and produces a list of _tokens_ comprised of the smaller alphabet of symbols specified in our grammar.
- **Parsing** takes these tokens, and produces a abstract syntax tree — a tree that reflects the syntax of the statement, allowing us to reason about the input query's validity, and eventually enabling us to interpret it into other query languages, should we wish.

## Scanning

<div data-scanner>why not +edit:me?</div>

Of the two, going from utf-8 to the CQL lexicon is the easier task. That's because for most programming languages, and certainly for CQL, their lexical grammar is a [regular grammar](https://en.wikipedia.org/wiki/Regular_language) — the sort of grammar that can be encoded by a regular expression.[^1] This means the output of our scanner is a list of tokens created in the same order as they are consumed from our input — we don't have to worry about the more complicated tree structure that's necessary for [context-free grammars](https://en.wikipedia.org/wiki/Context-free_grammar) like CQL.

This means we can describe the scanning process as a loop that continually ingests our input, and a switch statement that inspects the next few characters, consumes them, and (optionally) outputs a token. What data should a `Token` contain? Well, we'll need:

- A pair of numbers to define where the token begins and ends.
- Something to represent the token's type. Because we know all of these types upfront, this can be an enumeration.
- A string value to capture the token "lexeme" — the range of the string that maps to the token, in its entirety.
- Optionally, a string value to capture the token "literal" – the token value, if it's needed. For example, tokens of type `string` must have a literal value that contains their content, but tokens like `OR` or `AND` do not; they are entirely represented by their token types.

Writing in Typescript, [^2] here's some code to enumerate our token types, and define our data type:

```typescript
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
} as const; // This tells Typescript to make this object read-only, and narrow its literal type.

interface Token {
    public start: number,
    public end: number
    public tokenType: TokenType,
    public lexeme: string,
    public literal?: string
}
```

Writing a scanner is then fairly straightforward. First, we'll introduce our `Scanner` class, which encapsulates the mutable state we need to keep track of the beginning of the current lexeme, and how far we've scanned forward.[^3]

```typescript
export class Scanner {
  private tokens: Token[] = [];
  private start = 0;
  private current = 0;

  constructor (private query: string) {}

  public scanTokens = (): Token[] => {
    while (!this.isAtEnd()) {
      // We are at the beginning of the next lexeme.
      this.start = this.current;
      this.scanToken();
    }
    return this.tokens;
  }

  private scanToken = (): void => {
    switch (this.advance()) {
      case "+":
        return this.addKey(TokenType.CHIP_KEY);
      case ":":
        return this.addValue();
      case "(":
        // etc.
    }
  }

  private advance = () => {
    const previous = this.current;
    this.current = this.current + 1;
    return this.program[previous];
  };
}
```

`advance()` passes back the current character, which we can then inspect to decide which sort of token we'd like to construct. Because our query language is very small, there aren't too many options! We can then continue to scan through the string until our token is complete, and add it to our array. Here's an example for `addKey()`:

```typescript
  private addKey = () => {
    while (this.peek() != ":" && !isWhitespace(this.peek()) && !this.isAtEnd())
      this.advance();

    if (this.current - this.start == 1) this.addToken(tokenType);
    else {
      const key = this.program.substring(this.start + 1, this.current);

      this.addToken(TokenType.CHIP_KEY, key);
    }
  };

  private peek = (offset: number = 0) =>
    this.program[this.current + offset] === undefined
      ? "\u0000"
      : this.program[this.current + offset];

  private isAtEnd = (offset: number = 0) =>
    this.current + offset === this.program.length;

  private addToken = (tokenType: TokenType, literal?: string) => {
    const text = this.program.substring(this.start, this.current);
    this.tokens = this.tokens.concat(
      new Token(tokenType, text, literal, this.start, this.current - 1)
    );
  };
```

... or, in plain English, "scan forward until we hit a `:` character, whitespace, or the end of the string. Then add a `CHIP_KEY` token, optionally adding its literal value if it exists."

This is largely straightforward, so we won't go through every token here, but there are a few wrinkles worth mentioning. The first is that, in some cases, we do not know what token we have until we are  mid-way through a scan. This is the case when we are dealing with unquoted strings and boolean operators – if our token starts with `OR`, we've no way of knowing whether we're looking at the keyword `OR` or the unquoted string `ORTHOGONAL` until we encounter whitespace. In this case, we're after a [maximal munch](https://en.wiktionary.org/wiki/maximal_munch), matching the longest possible section of our input before declaring the token type:

```typescript
  private addIdentifierOrUnquotedString = () => {
    while (isLetterOrDigit(this.peek())) {
      this.advance();
    }

    const text = this.program.substring(this.start, this.current);
    const maybeReservedWord =
      Token.reservedWordMap[text as keyof typeof Token.reservedWordMap];

    return maybeReservedWord
      ? this.addToken(maybeReservedWord)
      : this.addUnquotedString();
  };
```

The second thing to note: it's possible for our input to contain lexical errors. For example, a quoted string must end in a closing double quote. If we run out of input before we encounter one, we should throw an error:

```typescript
  private addString = () => {
    while (this.peek() != '"' && !this.isAtEnd()) {
      this.advance();
    }

    if (this.isAtEnd()) {
      this.error("Unterminated string at end of file");
    } else {
      this.advance();
    }

    this.addToken(
      TokenType.STRING,
      this.program.substring(this.start + 1, this.current - 1)
    );
  };

  private error = (message: String) => {
    // For now, we'll just log errors. Production code would
    // care where this error occurred, and provide the caller
    // with a means of discovering what went wrong.
    console.log(`Error: ${message}`);
  };
```

Incidentally, quoted strings give us a good illustration of the difference between a lexeme and a literal. Note that the literal, which is the data that the token represents, does not include the quotes:

<div data-scanner>unquoted "quoted"</div>

Here's the [code](https://github.com/guardian/cql/blob/f89645f4d8079198e0a8d648f37c1d1810b71354/prosemirror-client/src/lang/scanner.ts) if you'd like to see the entire implementation as it stands in the CQL project.

And that's the scanner done! From a string input, we've now got a tool that can produce an ordered list of tokens. This is enough to power some of the features of our yet-to-be-implemented UI — syntax highlighting, for one — but to ensure our query is correctly formed, report errors, and power our typeahead, we'll need to transform these tokens into a data structure that represents our CQL grammar. In the next post, we'll write a parser that does just that.

[^1]: Strictly, a regular expression that does not include [non-regular features](https://en.wikipedia.org/wiki/Regular_expression#Patterns_for_non-regular_languages), like backreferences.
[^2]: I originally wrote the language server for CQL in Scala ([code](https://github.com/guardian/cql/tree/scala/src/main/scala)), and rewrote it in Typescript once it became clear that introducing a network call for language features ... didn't serve the product well!  More on that in a future post.
[^3]: There are lots of ways to write a scanner, including leaning more heavily on regular expressions, and consuming the input in a more functional style, but I thought writing straightforward, imperative code would be best for a wide audience to read.

<style>

.scanner-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
}

.result-container {
        display: flex;
    align-items: center;
    flex-direction: column;
    width: 100%;
}

.result-container > div {
    max-width: 100%;
    margin-top: 5px;
    overflow-y: scroll;
    margin-bottom: 0;
    padding-bottom: 9rem;
}

.CqlDebug__json {
  display: flex;
}

.CqlDebug__json > div {
  display: flex;
  flex-direction: column;
}

.CqlDebug__mapping {
  display: flex;
  flex-direction: column;
}

.CqlDebug__queryDiagramToken,
.CqlDebug__queryDiagramNode {
  margin-bottom: 6rem;
}

.CqlDebug__queryDiagramNode > .CqlDebug__queryDiagramLabel {
  padding-top: 0rem;
}

.CqlDebug__queryDiagramNode > .CqlDebug__queryDiagramLabel div + div {
  padding-top: 1rem;
}

.Cql__Debug > div {
  flex-grow: 1;
}
.CqlDebug__queryDiagram {
  display: flex;
  white-space: pre;
  font-family: monospace;
}

.CqlDebug__queryDiagramLabel {
  padding-top: 2rem;
  padding-right: 1rem;
  display: flex;
  flex-direction: column;
}

.CqlDebug__queryDiagramContent {
  display: flex;
}

.CqlDebug__queryBox {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-grow: 0;
  width: 25px;
  padding: 1rem 0;
}

.CqlDebug__queryBox--offset > .CqlDebug__originalChar {
  position: relative;
  left: 50%;
  top: -2rem;
}

.CqlDebug__queryBox--offset > .CqlDebug__queryChar {
  position: relative;
  left: -50%;
}

.CqlDebug__queryBox > div {
  width: 1em;
  height: 1rem;
}

.CqlDebug__originalChar {
  background-color: rgb(49, 78, 55);
}

.CqlDebug__queryChar {
  background-color: #a8e6b5;
}

.CqlDebug__queryChar + .CqlDebug__queryChar {
  margin-top: 3px;
}

.CqlDebug__queryCharAlt {
  background-color: #f7bbff;
}

.CqlDebug__nodeChar {
  background-color: rgb(130, 82, 82);
  position: absolute;
  bottom: 1rem;
  left: -50%;
}

.CqlDebug__nodeLabel,
.CqlDebug__tokenLabel {
  position: absolute;
  top: 5rem;
  width: 1em;
  transform: rotate(90deg);
}

.CqlDebug__nodeLabel {
  left: 50%;
}

.CqlDebug__nodeDiagram {
  display: flex;
}

.CqlSandbox {
  margin-top: 30px;
}

.CqlSandbox__query-results {
  display: flex;
}

.CqlSandbox__query-results > div {
  flex-grow: 1;
}
</style>

<script id="page-script" type="module">
    "use strict";
    var _a;
    const TokenType = {
        // Single-character tokens.
        PLUS: "PLUS",
        COLON: "COLON",
        AT: "AT",
        LEFT_BRACKET: "LEFT_BRACKET",
        RIGHT_BRACKET: "RIGHT_BRACKET",
        // Literals.
        STRING: "STRING",
        NUMBER: "NUMBER",
        QUERY_OUTPUT_MODIFIER_KEY: "QUERY_OUTPUT_MODIFIER_KEY",
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

    // Userland

    const createScanner = (el, initialQuery) => {
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
            resultContainer.innerHTML = getDebugTokenHTML(tokens);
        }

        input.addEventListener("input", e => {
            const value = e.target.value;
            applyScan(value);
        })

        applyScan(initialQuery);
    }

    document.querySelectorAll("[data-scanner]").forEach(el => {
        createScanner(el, el.innerText)
    });
</script>
