# Adds the suggestion box to a Herdr app layout: its panel as a hidden column on the right of the
# window, next to Quarterdeck's and Chartroom's, and its button at the end of the tab bar's row,
# after Quarterdeck's (or Parrot's, or Chartroom's) when that is there. Where no row holds the tab
# bar yet, it goes into one, tabs-row, as those tools do, so they share it.
def panel: { id: "suggestion-box", type: "block", hidden: true, size: { px: 400 }, min: 320, max: 720, content: { mod: "suggestion-box" } };
def button: { id: "suggestion-box-button", type: "block", size: { px: 104 }, window_drag: true, content: { mod: "suggestion-box", props: { button: true } } };
def tabs_row: { id: "tabs-row", type: "row", resizable: false, children: [(del(.size) + { size: { weight: 1 } }), button] } + (if .size then { size: .size } else {} end);

# The row's children with the button after the last of the other tools' buttons, else at the end.
def with_button:
  (.children // []) as $children
  | ([$children | to_entries[] | select(.value.id? | IN("quarterdeck-button", "parrot-button", "chartroom-button")) | .key] | max) as $after
  | .children = (if $after == null then $children + [button] else $children[:$after + 1] + [button] + $children[$after + 1:] end);

def is_block: type == "object" and .type? == "block";
def tab_bar: first(paths(is_block and .id? == "tabs")) // first(paths(is_block and ((.content.mod? // "") | . == "tabs" or . == "terminals-bar"))) // null;

if type != "object" or (.id? | type) != "string" then error("it is not a layout: its root has no id")
elif .type? != "row" then error("its root is not a row, so there is no right side to put the panel on")
else
  (if any(.. | objects; .id? == "suggestion-box-button") then .
   elif any(.. | objects; .id? == "tabs-row") then walk(if type == "object" and .id? == "tabs-row" then with_button else . end)
   else tab_bar as $at
     | if $at == null then error("it has no tab bar: a block with id \"tabs\", or one drawn by the tabs or terminals-bar mod")
       else setpath($at; getpath($at) | tabs_row) end
   end)
  | (if any(.children[]?; .id? == "suggestion-box") then . else .children += [panel] end)
end
