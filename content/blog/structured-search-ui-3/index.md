---
title: "Structured search queries for web UIs, part 3: scanning and parsing"
date: "2024-10-06T01:30:03.284Z"
description: "Let's teach our computer to CQL"
draft: true
---

We finished [part 2](./structured-search-part-2) by writing a grammar that described our query language, CQL. Now it's time to write the code we need to parse it — to resolve CQL expressions into the structure and the symbols we described in our grammar, or throw an error trying.

There are two parts to this process:

- **Scanning** takes an input from a larger alphabet (in our case, the character set provided by utf-8), and produces a list of _tokens_ comprised of the smaller alphabet of symbols specified in our grammar.
- **Parsing** takes these tokens, and produces a abstract syntax tree — a tree that reflects the syntax of the statement, allowing us to reason about the input query's validity, and eventually enabling us to interpret it into other query languages, should we wish.

## Scanning

Of the two, going from utf-8 to the CQL lexicon is the easier task. That's because for most programming languages, and certainly for CQL, their lexical grammar is a [regular grammar](https://en.wikipedia.org/wiki/Regular_language). This means the output of our scanner is a list of tokens created in the same order as they are consumed from our input — we don't have to worry about the more complicated tree structure that's necessary for [context-free grammars](https://en.wikipedia.org/wiki/Context-free_grammar) like CQL.

This means we can describe the scanning process as a loop that continually ingests our input, and a switch statement that inspects the next few characters, consumes them, and (optionally) outputs a token. Here's an example in Typescript:[^3]

```
export class Scanner {
  private tokens: Token[] = [];
  private start = 0;
  private current = 0;

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
        return this.addKey(TokenType.QUERY_FIELD_KEY);
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

<div data-scanner>why not +edit:me?</div>

[^1]: Strictly, a regular expression that does not include [non-regular features](https://en.wikipedia.org/wiki/Regular_expression#Patterns_for_non-regular_languages), like backreferences.

[^2]: Crafting Interpreters has a [great chapter](https://craftinginterpreters.com/scanning.html#top) on writing a scanner if you'd like some guidance.

[^3]: I originally wrote the language server for CQL in Scala ([code](https://github.com/guardian/cql/tree/scala/src/main/scala)), and rewrote it in Typescript once it became clear that introducing a network call for language features didn't serve the product well. More on that in a future post.

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
        QUERY_FIELD_KEY: "QUERY_FIELD_KEY",
        QUERY_VALUE: "QUERY_VALUE",
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
                        this.addKey(TokenType.QUERY_FIELD_KEY);
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
                    this.addToken(TokenType.QUERY_VALUE);
                }
                else {
                    const value = this.program.substring(this.start + 1, this.current);
                    this.addToken(TokenType.QUERY_VALUE, value);
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
            var _a;
            html += `${Array(Math.max(1, token.lexeme.length))
                .fill(undefined)
                .map((_, index) => {
                var _a, _b;
                const lexemeChar = token.lexeme[index];
                const literalOffset = ((_a = token.literal) === null || _a === void 0 ? void 0 : _a.length) === token.lexeme.length ? 0 : 1;
                const literalChar = (_b = token.literal) === null || _b === void 0 ? void 0 : _b[index - literalOffset];
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
        ${((_a = tokens[index + 1]) === null || _a === void 0 ? void 0 : _a.tokenType) !== "EOF" && token.tokenType !== "EOF"
                ? `<div class="CqlDebug__queryBox"><div class="CqlDebug__queryIndex">${token.end + 1}</div></div>`
                : ""}`;
        });
        html += "</div></div>";
        return html;
    };

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
