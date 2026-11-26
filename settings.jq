# Adds the suggestion box's two entries to Claude Code's settings.json, each only when missing,
# and leaves everything else as it is. $rule: the permission rule. $command: the hook's command.
# A SessionStart hook whose command runs some other "suggest" session-start is pointed at $command.
def ours: (.command? // "") | test("suggest\"? session-start$");

(if ((.permissions.allow // []) | index($rule)) then .
 else .permissions.allow = ((.permissions.allow // []) + [$rule]) end)
| (if any(.hooks.SessionStart[]?.hooks[]?; ours) then
     .hooks.SessionStart |= map(.hooks |= map(if ours then .command = $command else . end))
   else
     .hooks.SessionStart = ((.hooks.SessionStart // []) + [{ hooks: [{ type: "command", command: $command }] }])
   end)
