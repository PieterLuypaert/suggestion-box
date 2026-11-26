# Takes the suggestion box's two entries out of Claude Code's settings.json and leaves everything
# else as it is; a list or object it empties is removed too.
def ours: (.command? // "") | test("suggest\"? session-start$");

(if .permissions.allow then .permissions.allow |= map(select(. != "Bash(suggest:*)")) else . end)
| (if (.permissions.allow? // null) == [] then del(.permissions.allow) else . end)
| (if (.permissions? // null) == {} then del(.permissions) else . end)
| (if .hooks.SessionStart then
     .hooks.SessionStart |= (map(.hooks |= map(select(ours | not))) | map(select((.hooks // []) | length > 0)))
   else . end)
| (if (.hooks.SessionStart? // null) == [] then del(.hooks.SessionStart) else . end)
| (if (.hooks? // null) == {} then del(.hooks) else . end)
