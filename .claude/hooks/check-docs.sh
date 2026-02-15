#!/bin/bash

# Post-tool hook: Reminds about documentation updates when source files are edited.
# Only fires for edits in packages/*/src/ directories.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')

# Exit early if no file path
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only trigger for source files in packages
if [[ ! "$FILE_PATH" =~ packages/[^/]+/src/ ]] && [[ ! "$FILE_PATH" =~ packages/[^/]+/(server|client)/ ]]; then
  exit 0
fi

# Skip test files, spec files, snapshots, and .d.ts files
if [[ "$FILE_PATH" =~ \.(spec|test)\. ]] || [[ "$FILE_PATH" =~ __test__ ]] || [[ "$FILE_PATH" =~ __snapshots__ ]] || [[ "$FILE_PATH" =~ \.d\.ts$ ]]; then
  exit 0
fi

# Extract package name
PACKAGE=$(echo "$FILE_PATH" | sed -n 's|.*/packages/\([^/]*\)/.*|\1|p')

if [ -z "$PACKAGE" ]; then
  exit 0
fi

# Map package to doc section
case "$PACKAGE" in
  core) DOC_SECTION="packages/core" ;;
  typescript) DOC_SECTION="packages/typescript" ;;
  mongo) DOC_SECTION="packages/mongo" ;;
  moost-mongo) DOC_SECTION="packages/moost-mongo" ;;
  moost-validator) DOC_SECTION="packages/moost-validator" ;;
  unplugin) DOC_SECTION="packages/unplugin" ;;
  vscode) DOC_SECTION="packages/vscode" ;;
  *) exit 0 ;;
esac

# Output reminder as additional context
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Note: You edited a source file in packages/$PACKAGE/. Consider whether docs/docs/$DOC_SECTION/ needs updating. Use /update-docs to check and update documentation."
  }
}
EOF

exit 0
