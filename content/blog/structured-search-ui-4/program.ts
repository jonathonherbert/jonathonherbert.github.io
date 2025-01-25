const debug = false

type TokenType = keyof typeof TokenType

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
} as const

class Token {
  public static reservedWordMap = {
    AND: TokenType.AND,
    OR: TokenType.OR,
  } as const

  public static reservedWordStrs = Object.keys(this.reservedWordMap)

  constructor(
    public tokenType: TokenType,
    public lexeme: string,
    public literal: string | undefined,
    public start: number,
    public end: number
  ) {}
  public toString() {
    return `${this.tokenType} ${this.lexeme} ${this.literal} ${this.start}-${this.end}`
  }
}

class ParseError extends Error {
  constructor(
    public position: number,
    public message: string
  ) {
    super(message)
  }
}

class Query {
  public readonly type = "Query"
  constructor(public readonly content?: Binary) {}
}

class Binary {
  public readonly type = "Binary"
  constructor(
    public readonly left: Expr,
    public readonly right?: {
      operator: "OR" | "AND"
      binary: Binary
    }
  ) {}
}

class Expr {
  public readonly type = "Expr"
  constructor(public readonly content: Str | Group | Chip) {}
}

class Group {
  public readonly type = "Group"
  constructor(public readonly content: Binary) {}
}

class Str {
  public readonly type = "Str"
  public readonly searchExpr: string
  constructor(public readonly token: Token) {
    this.searchExpr = token.literal ?? ""
  }
}

class Chip {
  public readonly type = "Chip"
  constructor(
    public readonly key: Token,
    public readonly value?: Token
  ) {}
}

class Parser {
  // Keep track of the current token.
  private current: number = 0

  constructor(private tokens: Token[]) {}

  public parse(): Query {
    return this.query()
  }

  private query(): Query {
    const content =
      this.peek().tokenType === TokenType.EOF ? undefined : this.binary()

    return new Query(content)
  }

  private binary(): Binary {
    this.debug("binary")
    const left = this.expr()

    const tokenType = this.peek().tokenType

    switch (tokenType) {
      // If we have an explicit binary operator, use it ...
      case TokenType.OR:
      case TokenType.AND: {
        this.consume(tokenType)

        if (this.isAtEnd()) {
          throw this.error(`I expected an expression after ${tokenType}`)
        }
        return new Binary(left, {
          operator: tokenType,
          binary: this.binary(),
        })
      }
      case TokenType.RIGHT_BRACKET:
      case TokenType.EOF: {
        return new Binary(left)
      }
      // ... or default to OR.
      default: {
        return new Binary(left, {
          operator: TokenType.OR,
          binary: this.binary(),
        })
      }
    }
  }
  private expr(): Expr {
    this.debug("expr")
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

  private group(): Group {
    this.debug("group")
    this.consume(
      TokenType.LEFT_BRACKET,
      "Groups must start with a left bracket"
    )

    if (this.isAtEnd() || this.peek().tokenType === TokenType.RIGHT_BRACKET) {
      throw this.error(
        "Groups can't be empty. Put a search term between the brackets!"
      )
    }
    const binary = this.binary()

    this.consume(
      TokenType.RIGHT_BRACKET,
      "Groups must end with a right bracket"
    )

    return new Group(binary)
  }

  private str(): Str {
    this.debug("str")
    const token = this.consume(TokenType.STRING, "Expected a string")

    return new Str(token)
  }

  private chip(): Chip {
    this.debug("chip")
    const key = this.consume(
      TokenType.CHIP_KEY,
      "I expected a field name after the `+`, e.g. `+tag`"
    )

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

  private unexpectedTokenError = () => {
    throw this.error(
      `I didn't expect to find a '${this.peek().lexeme}' ${!this.previous() ? "here." : `after '${this.previous()?.lexeme}'`}`
    )
  }

  private peek(): Token {
    return this.tokens[this.current]
  }

  private consume = (tokenType: TokenType, message: string = ""): Token => {
    if (this.check(tokenType)) {
      return this.advance()
    } else {
      throw this.error(message)
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

  private previous = () => this.tokens[this.current - 1]

  private isAtEnd = () => this.peek()?.tokenType === TokenType.EOF

  private error = (message: string) =>
    new ParseError(this.peek().start, message)

  private debug(location: string) {
    if (debug) {
      console.log(location, this.peek().tokenType)
    }
  }
}

const whitespaceR = /\s/
const isWhitespace = (str: string) => whitespaceR.test(str)

const letterOrDigitR = /[0-9A-z]/
const isLetterOrDigit = (str: string) => letterOrDigitR.test(str)

class Scanner {
  private tokens: Array<Token> = []
  private start = 0
  private current = 0
  private line = 1

  constructor(private program: string) {}

  public scanTokens = (): Token[] => {
    while (!this.isAtEnd()) {
      // We are at the beginning of the next lexeme.
      this.start = this.current
      this.scanToken()
    }

    return this.tokens.concat(
      new Token(TokenType.EOF, "", undefined, this.current, this.current)
    )
  }

  private scanToken = () => {
    switch (this.advance()) {
      case "+":
        this.addKey(TokenType.CHIP_KEY)
        return
      case ":":
        this.addValue()
        return
      case "(":
        this.addToken(TokenType.LEFT_BRACKET)
        return
      case ")":
        this.addToken(TokenType.RIGHT_BRACKET)
        return
      case " ":
        return
      case "\r":
      case "\t":
      case '"':
        this.addString()
        return
      default:
        this.addIdentifierOrUnquotedString()
        return
    }
  }

  private addKey = (tokenType: TokenType) => {
    while (this.peek() != ":" && !isWhitespace(this.peek()) && !this.isAtEnd())
      this.advance()

    if (this.current - this.start === 1) this.addToken(tokenType)
    else {
      const key = this.program.substring(this.start + 1, this.current)

      this.addToken(tokenType, key)
    }
  }

  private addValue = () => {
    while (!isWhitespace(this.peek()) && !this.isAtEnd()) this.advance()

    if (this.current - this.start == 1) {
      this.addToken(TokenType.CHIP_VALUE)
    } else {
      const value = this.program.substring(this.start + 1, this.current)
      this.addToken(TokenType.CHIP_VALUE, value)
    }
  }

  private addIdentifierOrUnquotedString = () => {
    while (isLetterOrDigit(this.peek())) {
      this.advance()
    }

    const text = this.program.substring(this.start, this.current)
    const maybeReservedWord =
      Token.reservedWordMap[text as keyof typeof Token.reservedWordMap]

    return maybeReservedWord
      ? this.addToken(maybeReservedWord)
      : this.addUnquotedString()
  }

  private addUnquotedString = () => {
    while (
      // Consume whitespace up until the last whitespace char
      (!isWhitespace(this.peek()) ||
        isWhitespace(this.peek(1)) ||
        this.isAtEnd(1)) &&
      this.peek() != ")" &&
      !this.isAtEnd()
    ) {
      this.advance()
    }

    this.addToken(
      TokenType.STRING,
      this.program.substring(this.start, this.current)
    )
  }

  private addString = () => {
    while (this.peek() != '"' && !this.isAtEnd()) {
      this.advance()
    }

    if (this.isAtEnd()) {
      this.error(this.line, "Unterminated string at end of file")
    } else {
      this.advance()
    }

    this.addToken(
      TokenType.STRING,
      this.program.substring(this.start + 1, this.current - 1)
    )
  }

  private addToken = (tokenType: TokenType, literal?: string) => {
    const text = this.program.substring(this.start, this.current)
    this.tokens = this.tokens.concat(
      new Token(tokenType, text, literal, this.start, this.current - 1)
    )
  }

  private advance = () => {
    const previous = this.current
    this.current = this.current + 1
    return this.program[previous]
  }

  private peek = (offset: number = 0) =>
    this.program[this.current + offset] === undefined
      ? "\u0000"
      : this.program[this.current + offset]

  private isAtEnd = (offset: number = 0) =>
    this.current + offset === this.program.length

  private error = (line: number, message: string) =>
    this.report(line, "", message)

  private report = (line: number, where: string, message: string) => {
    console.log(`[line ${line}] Error${where}: ${message}`)
  }
}

const parseCqlStr = (queryStr: string) => {
  const scanner = new Scanner(queryStr)
  const tokens = scanner.scanTokens()
  const parser = new Parser(tokens)
  const result = parser.parse()

  return result
}

try {
  console.log(parseCqlStr("(asd)"))
} catch (e) {
  if (e instanceof ParseError) {
    console.log(`Err: '${e.message}', ${e.position}`)
  }
}
