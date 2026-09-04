param([Parameter(ValueFromRemainingArguments = $true)]$Args)
node "$PSScriptRoot/ts/node_modules/tsx/dist/cli.mjs" "$PSScriptRoot/ts/src/main.ts" @Args
