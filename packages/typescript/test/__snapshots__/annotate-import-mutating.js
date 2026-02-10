// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, buildJsonSchema as $$ } from "@atscript/typescript/utils"
import { MyInterface } from "./annotate-nonmutating.as"
MyInterface.type.props.get("name")?.metadata.set("label", "Cross-File Name")
MyInterface.type.props.get("address")?.type.props.get("city")?.metadata.set("label", "Cross-File City")
MyInterface.metadata.set("meta.description", "Cross-File Mutated")
// prettier-ignore-end