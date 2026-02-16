// prettier-ignore-start
/* eslint-disable */
import { defineAnnotatedType as $, annotate as $a } from "@atscript/typescript/utils"
import { MyInterface } from "./annotate-nonmutating.as"
// Ad-hoc annotations for MyInterface
$a(MyInterface.type.props.get("name")?.metadata, "label", "Cross-File Name")
$a(MyInterface.type.props.get("address")?.type.props.get("city")?.metadata, "label", "Cross-File City")
$a(MyInterface.metadata, "meta.description", "Cross-File Mutated")

// prettier-ignore-end