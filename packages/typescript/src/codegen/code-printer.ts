export class CodePrinter {
  protected lines: string[] = []
  private currentLine = '' // holds text for the line we are building
  private indentLevel = 0
  private readonly indentSize = 2

  // For block-based indentation
  private blockStack: string[] = []

  /**
   * Write text with NO automatic newline.
   * If current line is empty, we prepend indentation.
   */
  write(...text: string[]): this {
    if (!this.currentLine) {
      // We are starting a fresh line -> prepend indentation
      this.currentLine = this.indentString()
    }
    this.currentLine += text.join('')
    return this
  }

  /**
   * Write text and then finalize this line with a newline.
   * Implemented by calling `write(...)` + push line + reset `currentLine`.
   */
  writeln(...text: string[]): this {
    this.write(...text)
    // finalize this line
    this.lines.push(this.currentLine)
    this.currentLine = '' // reset
    return this
  }

  /**
   * Open a block with an opening/closing pair, e.g. "{}" or "()".
   * By default, places the opening delimiter on the current line (no extra newline).
   */
  block(pair: string): this {
    return this.doBlock(pair, false)
  }

  /**
   * Same as `block()`, but adds a newline after writing the opening delimiter.
   */
  blockln(pair: string): this {
    return this.doBlock(pair, true)
  }

  /**
   * Close the most recent block. By default, closing delimiter goes on the current line.
   */
  pop(): this {
    return this.doPop(false)
  }

  /**
   * Same as `pop()`, but puts the closing delimiter on a new line.
   */
  popln(): this {
    return this.doPop(true)
  }

  /**
   * Increase indentation by one level.
   */
  indent(): this {
    this.indentLevel++
    return this
  }

  /**
   * Decrease indentation by one level (never below 0).
   */
  unindent(): this {
    this.indentLevel = Math.max(0, this.indentLevel - 1)
    return this
  }

  render() {
    return this.toString()
  }

  /**
   * Return the entire code as a string. Removes any half-finished current line if empty.
   */
  toString(): string {
    // If we have a non-empty current line, push it onto lines
    if (this.currentLine.trim() !== '') {
      this.lines.push(this.currentLine)
    } else if (this.currentLine.length > 0) {
      // If it's only indentation/spaces, optionally keep or drop it
      this.lines.push(this.currentLine)
    }
    return this.lines.join('\n')
  }

  /* ----------------------
   * Internal helpers
   * ---------------------*/

  private doBlock(pair: string, withNewLine: boolean): this {
    if (pair.length < 2) {
      throw new Error(`Block pair must have at least 2 chars, e.g. "{}" or "()". Got "${pair}"`)
    }
    const opening = pair[0]
    const closing = pair[pair.length - 1]

    // Write opening delimiter
    this.write(opening)
    this.blockStack.push(closing)

    // optional newline
    if (withNewLine) {
      this.writeln()
    }

    // Increase indentation for content inside block
    this.indent()
    return this
  }

  private doPop(withNewLine: boolean): this {
    if (!this.blockStack.length) {
      throw new Error('No block to pop (stack is empty).')
    }
    const closing = this.blockStack.pop()!

    // Unindent first
    this.unindent()

    // Write closing delimiter
    if (withNewLine) {
      this.writeln(closing)
    } else {
      this.write(closing)
    }
    return this
  }

  private indentString(): string {
    return ' '.repeat(this.indentLevel * this.indentSize)
  }
}
