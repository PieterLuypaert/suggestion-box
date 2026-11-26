## Suggestion box

When you notice a real problem outside your current task (a bug, a risky pattern, a missing
test, dead code, wrong docs), do not fix it and do not let it pull you off course. Drop a note
and carry on. Run `suggest list` first: dropping a note that is there already only counts.

```sh
suggest <<'EOF'
title: <what is wrong, one line>
at: <file>:<line>
problem: <what is wrong and who or what it hurts>
evidence: <what you actually saw: the failing test, the error text, the log line, the code path>
current: <what the code does now, as you saw it happen or read it; quote the error or output>
desired: <what should happen instead, from the code's own types, tests, docs or the ticket>
EOF
```

All four sections are required and become the issue, so write only what you checked, no
guesses. When you are not sure what should happen, write "Unsure: <the question>" as desired.
A line starting with two spaces continues the field above it. Write in plain English without any
chat style, and leave out secrets, tokens, customer data and personal paths: teammates read it,
and the repo may be public. If `suggest` says the box is off, drop no more notes in this task and
name your findings in your final report instead.

Only drop what a teammate would want an issue for: no style nits, nothing your own task should
fix, at most a few per task. Only in your main session on a task: as a subagent, a reviewer or in
a read-only task, report findings to whoever asked you instead. Never file an issue yourself; if
`suggest` is missing or fails, name the finding in your report instead.

Every drop answers with the note's number. If your own task ends up fixing a note after all
(yours or another agent's), claim it, naming a real test or check; the user verifies it before
the note is closed:

```sh
suggest solved <number> <<'EOF'
how: <what fixed it, one line>
proof: <the test or check that shows it>
EOF
```

In your final report, list the notes you dropped and the ones you claimed solved.
