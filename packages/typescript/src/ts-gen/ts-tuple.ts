import { TsType } from './ts-type'

export class TsTuple extends TsType {
  protected items: (TsType | string)[] = []

  addItem(item: TsType | string) {
    this.items.push(item)
  }

  public array(): this {
    if (!this.arrayOf) {
      // Move the existing definition into 'arrayOf'
      const inner = new TsTuple(this.name)
      inner.unionParts = this.unionParts
      inner.intersectionParts = this.intersectionParts
      inner.genericParams = this.genericParams
      inner.items = this.items

      this.arrayOf = inner

      // Reset current container so `this` becomes the "outer array"
      this.name = ''
      this.unionParts = []
      this.intersectionParts = []
      this.genericParams = []
      this.items = []
    } else {
      // If already an array, just nest further
      this.arrayOf.array()
    }
    return this
  }

  protected override buildTypeString(prefix = ''): string {
    const renderedItems = this.items.map(item =>
      item instanceof TsType ? item.render(prefix) : item
    )
    const tupleLiteral = `[${renderedItems.join(', ')}]`

    this.name = tupleLiteral
    return super.buildTypeString(prefix)
  }
}
