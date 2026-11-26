# Takes the suggestion box's button and panel out of a Herdr app layout again, for uninstall.sh. A
# tab bar row left holding only the tab bar, as layout.jq made it for the button, goes too, and the
# tab bar gets its size back, so the layout is as it was before the box.
def unwrap:
  if .id? == "tabs-row" and ((.children // []) | length) == 1
  then . as $row | ($row.children[0] | del(.size)) + (if $row.size then { size: $row.size } else {} end)
  else . end;

walk(if type == "object" and (.children | type) == "array"
     then .children |= map(select(.id? != "suggestion-box-button" and .id? != "suggestion-box")) | unwrap
     else . end)
