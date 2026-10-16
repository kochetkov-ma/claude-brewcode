```
Execute these commands in this Claude Code session, one by one, show full output for each, do not skip any, do not summarize:

1. unset CLAUDECODE && claude plugin list --json
2. claude plugin marketplace update claude-brewcode
3. for every brewcode/brewdoc/brewtools/brewui row, and every installed brewmod-placeholders/brewmod-plan-effort row (never install a missing mod), from step 1 with scope user or managed: claude plugin update <id> --scope <scope of that row>
4. for every such row with scope project or local: (cd "<projectPath of that row>" && claude plugin update <id> --scope <scope of that row>); if that projectPath is not a directory, run nothing for it and report it as an orphan install

After all commands succeed, run `/reload-plugins`. If `/reload-plugins` is unavailable, tell me to type `exit` and run `claude` again. Run the commands now.
```
