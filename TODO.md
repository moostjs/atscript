# TODO

## Deep Nested Annotation Behavior

Consider interfaces with multi-level nesting via references:

```as
interface Contact {
  phone: string
  email: string
}

interface Address {
  street: string
  contact: Contact
}

interface Deep {
  name: string
  address: Address
}
```

Questions to address:

- How does `annotate Deep` work when annotating the deepest item (e.g. `address.contact.phone`)?
- How does `export annotate Deep as NewDeep` work with the same deep annotation paths?
- What are the semantics for propagation/override at each nesting level?

## Rename @atscript/core to atscript

- Rename the `@atscript/core` package to `atscript` (drop the scope for the core package)
- Move `asc` CLI from `@atscript/typescript` to `atscript` (the renamed core)
