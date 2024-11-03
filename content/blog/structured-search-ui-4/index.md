---
title: "Structured search queries for web UIs, part 4: parsing"
date: "2024-10-29T01:30:03.284Z"
description: "Grammar time"
draft: true
---

Content goes here.

<div data-parser>why not +edit:me? OR not</div>

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

const createQueryList = (content) => ({
    type: "QueryList",
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
        this.isAtEnd = () => this.peek().tokenType == TokenType.EOF;
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
    }
    parse() {
        try {
            return ok(this.queryList());
        }
        catch (e) {
            if (e instanceof ParseError) {
                return err(e);
            }
            throw e;
        }
    }
    /**
     * @param isRoot is this list nested within a group?
     */
    queryList(isNested = false) {
        const queries = [];
        while (this.peek().tokenType !== TokenType.EOF &&
            this.peek().tokenType !== TokenType.RIGHT_BRACKET) {
            if (isNested) {
                this.guardAgainstQueryField("within a group");
            }
            queries.push(this.queryBinary());
        }
        return createQueryList(queries);
    }
    queryBinary() {
        if (this.peek().tokenType === TokenType.CHIP_VALUE)
            throw new ParseError(this.peek().start, "I found an unexpected ':'. Did you numberend to search for a tag, section or similar, e.g. tag:news? If you would like to add a search phrase containing a ':' character, please surround it in double quotes.");
        const left = this.queryContent();
        switch (this.peek().tokenType) {
            case TokenType.AND: {
                const andToken = this.consume(TokenType.AND);
                this.guardAgainstQueryField("after 'AND'.");
                if (this.isAtEnd()) {
                    throw this.error("There must be a query following 'AND', e.g. this AND that.");
                }
                return createQueryBinary(left, [andToken, this.queryBinary()]);
            }
            case TokenType.OR: {
                const orToken = this.consume(TokenType.OR);
                this.guardAgainstQueryField("after 'OR'.");
                if (this.isAtEnd()) {
                    throw this.error("There must be a query following 'OR', e.g. this OR that.");
                }
                return createQueryBinary(left, [orToken, this.queryBinary()]);
            }
            default: {
                return createQueryBinary(left);
            }
        }
    }
    queryContent() {
        var _b;
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
                else if (this.peek().tokenType === TokenType.CHIP_KEY) {
                    return createQueryContent(this.queryField());
                }
                else {
                    throw this.error(`I didn't expect what I found after '${(_b = this.previous()) === null || _b === void 0 ? void 0 : _b.lexeme}'`);
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
        const list = this.queryList(true);
        this.consume(TokenType.RIGHT_BRACKET, "Groups must end with a right bracket.");
        return createQueryGroup(list);
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
    ${getQueryListHTML(query)}
  </div>`;
};
const getQueryListHTML = (list) => {
    const listHTML = list.content.length > 1 ? `
    <ul>
      ${list.content
        .map((binary) => `<li>${getBinaryHTML(binary)}</li>`)
        .join("")}
    </ul>
  ` : list.content.map(getBinaryHTML).join("");
    return `<ul class="tree">
    <li>
      ${getNodeHTML(list)}
      ${listHTML}
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
        ${getQueryListHTML(group.content)}
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