# Footnote cases

EDITME an edit here leaves every footnote's bytes alone.

## basic: Basic reference and definition

Markdown was created in 2004.[^1]

[^1]: By John Gruber, with Aaron Swartz.

## repeat: One footnote referenced twice

First claim.[^src] Second claim.[^src]

[^src]: The same source for both.

## word: Word label

Bread needs time.[^recipe]

[^recipe]: Leave it overnight.

## missing: Reference with no definition

This points nowhere.[^missing]

## duplicate: Two definitions with one label

Which one wins?[^dup]

[^dup]: The first definition.

[^dup]: The second definition.

## adjacent: Definitions on adjacent lines

Alpha.[^a] Beta.[^b]

[^a]: Definition A.
[^b]: Definition B.

## multipara: Definition with a second paragraph

Long note.[^long]

[^long]: First paragraph.
    Still the first paragraph, indented.

    A second paragraph, indented four spaces.

This line is back in the note.

## order: Definitions out of order

See this.[^b2] Then this.[^a2]

[^a2]: Defined first, referenced second.
[^b2]: Defined second, referenced first.

## unused: Definition nobody references

Nothing points down.

[^lonely]: An unused definition.

## inline: Inline footnote

Obsidian came out in 2020.^[Version 1.0 followed in 2022.]

## inline-brackets: Inline footnote with brackets inside

Tricky.^[with [brackets] inside] end.

## inline-markup: Inline footnote with a link and bold

Rich.^[see [[Some Note]] and **bold**] end.

## mixed: Inline and labelled numbered together

One.^[inline first] Two.[^lab] Three.^[inline last]

[^lab]: Labelled.

## table: Reference inside a table cell

| Item | Note |
| --- | --- |
| Flour | Strong.[^flour] |

[^flour]: Bread flour.

## callout: Reference inside a callout

> [!note] Title
> Callout text.[^c]

[^c]: From a callout.

## code: Footnote syntax inside code

Not a footnote: `[^code1]` here.

[^code1]: Defined anyway.

## escaped: Escaped reference

Escaped \[^esc1] is text.

[^esc1]: Defined.

## spaces: Label with a space

Spaced.[^my note]

[^my note]: Label has a space.

## reflink: Next to a reference link

A [link][x] and a note.[^r]

[x]: https://example.com
[^r]: The footnote.

## empty: Empty definition

Empty.[^e]

[^e]:

## indentation

Two.[^two]

[^two]: First paragraph.

  Second paragraph, two spaces.

Four.[^four]

[^four]: First paragraph.

    Second paragraph, four spaces.

Tab.[^tab]

[^tab]: First paragraph.

	Second paragraph, a tab.

   [^in]: Three spaces in.
[^gap]:	A tab after the colon.
[^tight]:No space.
