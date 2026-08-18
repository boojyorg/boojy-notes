# Escaped pipes in tables

EDITME paragraph above the table.

| Command | Description |
| --- | --- |
| grep -E "a\|b" | matches a or b |
| echo \| tee log | a pipeline \| in prose |

A table whose header contains an escaped pipe:

| left \| right | value |
| --- | ---: |
| both \| sides | 42 |
