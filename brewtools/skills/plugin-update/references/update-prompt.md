```
Execute these commands in this Claude Code session, one by one, show full output for each, do not skip any, do not summarize:

1. unset CLAUDECODE && claude plugin list --json
2. claude plugin marketplace update claude-brewcode
3. for every brewcode/brewdoc/brewtools/brewui row from step 1: claude plugin update <id> --scope <scope of that row>

After all commands succeed, run `/reload-plugins`. If `/reload-plugins` is unavailable, tell me to type `exit` and run `claude` again. Run the commands now.
```
