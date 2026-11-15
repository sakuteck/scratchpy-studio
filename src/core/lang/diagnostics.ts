/** Stable diagnostic identifiers and locale templates. Values are data, never parsed Japanese prose. */
export const DIAGNOSTIC_MESSAGES: Record<string, { ja: string; en: string }> = {
  "lex.indentDepth": {
    "ja": "インデントが深すぎます (最大100段。stage / sprite や on / def も含みます)",
    "en": "Indentation is too deep (maximum 100 levels, including stage, sprite, on and def)."
  },
  "lex.indent": {
    "ja": "インデントが揃っていません",
    "en": "The indentation does not match an earlier level."
  },
  "lex.fullWidthSpace": {
    "ja": "全角スペースなどは識別子に使えません。通常の空白にするか、名前を引用してください",
    "en": "Full-width spaces cannot be used in names. Use a normal space or quote the name."
  },
  "lex.string": {
    "ja": "文字列が閉じられていません",
    "en": "The string is not closed."
  },
  "lex.number": {
    "ja": "不正な数値",
    "en": "Invalid number."
  },
  "lex.numberLarge": {
    "ja": "数値が大きすぎます: {p0}",
    "en": "The number is too large: {p0}."
  },
  "lex.expressionDepth": {
    "ja": "式の入れ子が深すぎます (最大200段)",
    "en": "Expression nesting is too deep (maximum 200 levels)."
  },
  "lex.unexpectedChar": {
    "ja": "予期しない文字: '{p0}'",
    "en": "Unexpected character: '{p0}'."
  },
  "parse.expected": {
    "ja": "'{p0}' が必要です (実際: {p1})",
    "en": "Expected '{p0}' (found: {p1})."
  },
  "parse.oneStage": {
    "ja": "stage は1つだけ指定できます",
    "en": "Only one stage is allowed."
  },
  "parse.topLevel": {
    "ja": "トップレベルには 'stage:' または 'sprite 名前:' しか書けません (実際: {p0})",
    "en": "At the top level, use only 'stage:' or 'sprite name:' (found: {p0})."
  },
  "parse.indent": {
    "ja": "ブロックの開始にはインデントが必要です",
    "en": "Indent the block body."
  },
  "parse.decorator": {
    "ja": "不明なデコレータ @{p0}",
    "en": "Unknown decorator @{p0}."
  },
  "parse.unexpected": {
    "ja": "ここに '{p0}' は書けません",
    "en": "'{p0}' cannot be used here."
  },
  "parse.listInit": {
    "ja": "リストの初期値は [ ... ] 形式で書いてください",
    "en": "Write the initial list in [ ... ] form."
  },
  "parse.annotationName": {
    "ja": "アノテーション名が必要です",
    "en": "An annotation name is required."
  },
  "parse.annotationArg": {
    "ja": "アノテーション引数が不正です",
    "en": "Invalid annotation argument."
  },
  "parse.listAnnotation": {
    "ja": "リストの @{p0} に引数は指定できません",
    "en": "List @{p0} does not accept arguments."
  },
  "parse.annotationMode": {
    "ja": "@{p0} の表示モードは default / large / slider のいずれかです (実際: {p1})",
    "en": "@{p0} mode must be default, large, or slider (found: {p1})."
  },
  "parse.annotationExtra": {
    "ja": "@{p0}({p1}) に追加の引数は指定できません",
    "en": "@{p0}({p1}) does not accept additional arguments."
  },
  "parse.slider": {
    "ja": "スライダーは slider, 最小値, 最大値, true/false で指定してください",
    "en": "Specify slider, minimum, maximum, and true/false."
  },
  "parse.sliderBoolean": {
    "ja": "スライダーの第4引数は true または false です",
    "en": "The fourth slider argument must be true or false."
  },
  "parse.cloud": {
    "ja": "@cloud は var にのみ使えます",
    "en": "@cloud can only be used with var."
  },
  "parse.unknownAnnotation": {
    "ja": "不明なアノテーション @{p0} (使用可能: @show @hide @cloud)",
    "en": "Unknown annotation @{p0} (available: @show @hide @cloud)."
  },
  "parse.emptyCostume": {
    "ja": "コスチューム名を空にできません",
    "en": "A costume name cannot be empty."
  },
  "parse.soundName": {
    "ja": "音の名前が必要です",
    "en": "A sound name is required."
  },
  "parse.typeName": {
    "ja": "型名が必要です (int/float/str/bool/any/list[T]) (実際: {p0})",
    "en": "A type is required (int/float/str/bool/any/list[T]); found: {p0}."
  },
  "parse.blockName": {
    "ja": "ブロック(関数)名が必要です",
    "en": "A custom block name is required."
  },
  "parse.eventName": {
    "ja": "'on' の後にイベント種類が必要です (実際: {p0})",
    "en": "An event type is required after 'on' (found: {p0})."
  },
  "parse.eventValue": {
    "ja": "'on {p0}' の後には '> 値' が必要です",
    "en": "'on {p0}' must be followed by '> value'."
  },
  "parse.eventUnknown": {
    "ja": "不明なイベント '{p0}' (使用可能: flag/key/click/clone/receive/timer/loudness/backdrop)",
    "en": "Unknown event '{p0}' (available: flag/key/click/clone/receive/timer/loudness/backdrop)."
  },
  "parse.stop": {
    "ja": "stop() の引数は \"all\" / \"this script\" / \"other scripts\" のいずれかの文字列です",
    "en": "stop() takes \"all\", \"this script\", or \"other scripts\"."
  },
  "parse.assignmentTarget": {
    "ja": "代入の左辺には変数・リスト要素・プロパティしか書けません",
    "en": "The left side of an assignment must be a variable, list item, or property."
  },
  "parse.augTarget": {
    "ja": "+= / -= の左辺には変数しか書けません",
    "en": "The left side of += / -= must be a variable."
  },
  "parse.call": {
    "ja": "関数呼び出しの形が不正です",
    "en": "Invalid function call."
  },
  "parse.methodTarget": {
    "ja": "メソッド呼び出しの対象が不正です",
    "en": "Invalid method call target."
  },
  "parse.propertyName": {
    "ja": "'.' の後にはプロパティ名が必要です",
    "en": "A property name is required after '.'."
  },
  "parse.quotedName": {
    "ja": "{p0}(\"名前\") の形では名前は文字列で書いてください",
    "en": "Use a quoted string for the name in {p0}(\"name\")."
  },
  "parse.stageValue": {
    "ja": "stage 自体は値ではありません。stage.volume のように値を指定してください",
    "en": "The stage itself is not a value. Select a value such as stage.volume."
  },
  "parse.expression": {
    "ja": "式が必要です (実際: {p0})",
    "en": "An expression is required (found: {p0})."
  },
  "parse.depth": {
    "ja": "式またはブロックの入れ子が深すぎます",
    "en": "The expression or block nesting is too deep."
  },
  "name.emptySprite": {
    "ja": "スプライト名を空にできません",
    "en": "A sprite name cannot be empty."
  },
  "name.duplicateTarget": {
    "ja": "ターゲット名 '{p0}' が重複しています",
    "en": "Target name '{p0}' is duplicated."
  },
  "var.duplicate": {
    "ja": "変数 '{p0}' が同じスコープ内で二重宣言されています",
    "en": "Variable '{p0}' is declared twice in the same scope."
  },
  "list.duplicate": {
    "ja": "リスト '{p0}' が同じスコープ内で二重宣言されています",
    "en": "List '{p0}' is declared twice in the same scope."
  },
  "name.emptyCostume": {
    "ja": "コスチューム名を空にできません",
    "en": "A costume name cannot be empty."
  },
  "name.duplicateCostume": {
    "ja": "コスチューム名 '{p0}' が重複しています",
    "en": "Costume name '{p0}' is duplicated."
  },
  "block.duplicate": {
    "ja": "ブロック定義 '{p0}' が重複しています",
    "en": "Custom block '{p0}' is defined more than once."
  },
  "var.sliderRange": {
    "ja": "スライダーの最小値が最大値より大きくなっています",
    "en": "The slider minimum is greater than its maximum."
  },
  "var.cloudType": {
    "ja": "クラウド変数 (@cloud) は数値型 (int/float) のみ使用できます",
    "en": "Cloud variables (@cloud) must be numeric (int/float)."
  },
  "var.cloudStage": {
    "ja": "クラウド変数は普通ステージ(グローバル)で宣言します",
    "en": "Cloud variables are normally declared on the stage (globally)."
  },
  "var.literalInit": {
    "ja": "初期値には数値・文字列・true/false を直接書いてください。timer などの値は on flag 内で代入できます",
    "en": "Write a number, string, or true/false directly as the initial value. Assign values such as timer inside on flag."
  },
  "var.initialType": {
    "ja": "変数 '{p0}' は {p1} 型ですが、初期値の型は {p2} です",
    "en": "Variable '{p0}' has type {p1}, but its initial value has type {p2}."
  },
  "list.literalInit": {
    "ja": "リストの初期値には数値・文字列・true/false を直接書いてください",
    "en": "Write numbers, strings, or true/false directly as list initial values."
  },
  "list.initialType": {
    "ja": "リスト '{p0}' の要素型は {p1} ですが、{p2} の値が入っています",
    "en": "The element type of list '{p0}' is {p1}, but it contains a {p2} value."
  },
  "name.builtin": {
    "ja": "'{p0}' は組み込み関数名なので変数名に使えません",
    "en": "'{p0}' is a built-in function name and cannot be used as a variable name."
  },
  "name.targetCollision": {
    "ja": "'{p0}' はスプライト/ステージ名と同じです。式の中で名前解決が優先されるため混乱の元になります",
    "en": "'{p0}' has the same name as a sprite or the stage. This can be confusing because name resolution takes priority in expressions."
  },
  "expression.reporterStatement": {
    "ja": "'{p0}(...)' は値を返す式です。変数への代入や他のブロックの引数として使ってください",
    "en": "'{p0}(...)' returns a value; assign it or use it as an argument."
  },
  "expression.noEffect": {
    "ja": "この式は値を返しますが、文としては何も行いません",
    "en": "This expression returns a value but does nothing as a statement."
  },
  "statement.wait": {
    "ja": "wait() の引数は秒数(数値)です",
    "en": "wait() takes a number of seconds."
  },
  "statement.repeat": {
    "ja": "repeat の回数は数値です",
    "en": "The repeat count must be a number."
  },
  "statement.fractionalRepeat": {
    "ja": "repeat の回数に小数を指定すると切り捨てられます",
    "en": "A fractional repeat count is rounded down."
  },
  "condition.while": {
    "ja": "while の条件は bool 型です (実際: {p0})",
    "en": "The while condition must be bool (got {p0})."
  },
  "condition.if": {
    "ja": "{p0} の条件は bool 型です (実際: {p1})",
    "en": "The {p0} condition must be bool (got {p1})."
  },
  "statement.broadcast": {
    "ja": "broadcast のメッセージは文字列です",
    "en": "The broadcast message must be a string."
  },
  "statement.cloneStage": {
    "ja": "クローン操作はステージでは使えません",
    "en": "Clone operations cannot be used on the stage."
  },
  "statement.cloneTarget": {
    "ja": "create_clone() の対象は文字列(スプライト名または \"myself\")です",
    "en": "create_clone() requires a string (sprite name or \"myself\")."
  },
  "sprite.cloneNotFound": {
    "ja": "スプライト '{p0}' が見つかりません (create_clone の対象)",
    "en": "Sprite '{p0}' was not found (create_clone target)."
  },
  "statement.ask": {
    "ja": "ask() の質問は文字列です",
    "en": "The ask() question must be a string."
  },
  "monitor.notFound": {
    "ja": "変数/リスト '{p0}' が見つかりません ({p1} の対象)",
    "en": "Variable or list '{p0}' was not found ({p1} target)."
  },
  "var.notFoundAssignment": {
    "ja": "変数 '{p0}' が見つかりません(代入前に var で宣言してください)",
    "en": "Variable '{p0}' was not found. Declare it with var before assigning."
  },
  "var.notFound": {
    "ja": "変数 '{p0}' が見つかりません",
    "en": "Variable '{p0}' was not found."
  },
  "list.assignType": {
    "ja": "リストの要素型は {p0} ですが、{p1} を代入しようとしています",
    "en": "The element type of this list is {p0}; cannot assign a {p1} value."
  },
  "string.immutable": {
    "ja": "文字列の要素への代入はできません(文字列は変更不可)",
    "en": "Characters of a string cannot be assigned (strings are immutable)."
  },
  "list.assignTarget": {
    "ja": "添字代入できるのはリストだけです",
    "en": "Only list items can be assigned by index."
  },
  "var.assignType": {
    "ja": "変数 '{p0}' は {p1} 型です。{p2} 型の値は代入できません",
    "en": "Variable '{p0}' is {p1}; cannot assign a {p2} value."
  },
  "param.assign": {
    "ja": "引数(パラメータ)には代入できません。ローカル変数にコピーしてください",
    "en": "Parameters cannot be assigned. Copy the value into a local variable."
  },
  "property.readOnly": {
    "ja": "プロパティ(読み取り専用)には代入できません。set_x() などの関数を使ってください",
    "en": "Properties are read-only. Use a function such as set_x()."
  },
  "list.notFoundDeclaration": {
    "ja": "リスト '{p0}' が見つかりません(list 宣言が必要です)",
    "en": "List '{p0}' was not found. Declare it with list."
  },
  "list.notFound": {
    "ja": "リスト '{p0}' が見つかりません",
    "en": "List '{p0}' was not found."
  },
  "operator.not": {
    "ja": "not の対象は bool 型です (実際: {p0})",
    "en": "not requires bool (got {p0})."
  },
  "operator.unaryMinus": {
    "ja": "単項 - は数値にのみ使えます (実際: {p0})",
    "en": "Unary - requires a number (got {p0})."
  },
  "list.index": {
    "ja": "リストの添字は整数 (または \"last\" / \"random\") です",
    "en": "A list index must be an integer, \"last\", or \"random\"."
  },
  "string.index": {
    "ja": "文字の位置は整数です",
    "en": "A character position must be an integer."
  },
  "index.target": {
    "ja": "添字アクセス [ ] はリストと文字列のみ使用できます",
    "en": "Only lists and strings can be indexed."
  },
  "operator.in": {
    "ja": "in 演算子の右辺はリストまたは文字列です",
    "en": "The right side of in must be a list or a string."
  },
  "operator.compare": {
    "ja": "比較演算子 {p0} は数値同士でのみ使えます (実際: {p1} {p2} {p3})",
    "en": "{p0} compares numbers only (got {p1} {p2} {p3})."
  },
  "operator.mixedPlus": {
    "ja": "+ による数値({p0})と文字列の混合はできません。文字列連結なら両方 str にしてください",
    "en": "Cannot mix a number ({p0}) and a string with +. Use two strings to join them."
  },
  "operator.plus": {
    "ja": "+ は数値同士または文字列同士でのみ使えます (実際: {p0} + {p1})",
    "en": "+ requires two numbers or two strings (got {p0} + {p1})."
  },
  "operator.number": {
    "ja": "{p0} は数値同士でのみ使えます (実際: {p1} {p2} {p3})",
    "en": "{p0} requires numbers (got {p1} {p2} {p3})."
  },
  "name.notFound": {
    "ja": "'{p0}' が見つかりません(変数・パラメータ・プロパティのいずれでもありません)",
    "en": "'{p0}' is not a variable, parameter, or property."
  },
  "list.asValue": {
    "ja": "リスト '{p0}' を値として直接使うことはできません。{p1}[i] や len({p2}) を使ってください",
    "en": "List '{p0}' cannot be used as a value. Use {p1}[i] or len({p2})."
  },
  "property.targetNotFound": {
    "ja": "'{p0}' はスプライト名でもステージ名でもありません。他のスプライトの値は「スプライト名.プロパティ名」で参照します",
    "en": "'{p0}' is not a sprite or stage name. Use sprite.property for another sprite."
  },
  "property.notFound": {
    "ja": "'{p0}' にプロパティ/変数 '{p1}' はありません (使用可能: {p2}, 変数名)",
    "en": "'{p0}' has no property or variable '{p1}'. Available: {p2}, or a variable name."
  },
  "builtin.lenType": {
    "ja": "len() は文字列またはリストに使えます (実際: {p0})",
    "en": "len() works on strings and lists (got {p0})."
  },
  "builtin.notFound": {
    "ja": "関数 '{p0}' が見つかりません(ユーザー定義ブロックは def で宣言が必要です)",
    "en": "Function '{p0}' was not found. Declare custom blocks with def."
  },
  "builtin.argumentTypes": {
    "ja": "'{p0}' の引数の型が合いません。期待される形: {p1} / 実際の型: ({p2})",
    "en": "Wrong argument types for '{p0}'. Expected {p1}; got ({p2})."
  },
  "export.listLiteral": {
    "ja": "リストリテラル [ ] は var/list の初期値としてのみ使用できます",
    "en": "A list literal [ ] can only be used as the initial value of var/list."
  }
};


Object.assign(DIAGNOSTIC_MESSAGES, {
  "parse.keywordSprite": {
    "ja": "スプライト名「{p0}」は予約語です。引用してください",
    "en": "'{p0}' is a reserved word. Put the sprite name in quotes."
  },
  "parse.needSprite": {
    "ja": "スプライト名が必要です (実際: {p0})",
    "en": "A sprite name is required (found: {p0})."
  },
  "parse.keywordVar": {
    "ja": "変数名「{p0}」は予約語です。\"{p0}\" のように引用してください",
    "en": "'{p0}' is a reserved word. Write \"{p0}\" in quotes."
  },
  "parse.keywordList": {
    "ja": "リスト名「{p0}」は予約語です。\"{p0}\" のように引用してください",
    "en": "'{p0}' is a reserved word. Write \"{p0}\" in quotes."
  },
  "parse.needVar": {
    "ja": "変数名が必要です",
    "en": "A variable name is required."
  },
  "parse.needList": {
    "ja": "リスト名が必要です",
    "en": "A list name is required."
  },
  "parse.keywordCostume": {
    "ja": "コスチューム名「{p0}」は予約語です。引用してください",
    "en": "'{p0}' is a reserved word. Put the costume name in quotes."
  },
  "parse.needCostume": {
    "ja": "コスチューム名が必要です",
    "en": "A costume name is required."
  },
  "parse.keywordParam": {
    "ja": "引数名「{p0}」は予約語です。別の識別子を使用してください（引数名は引用できません）",
    "en": "'{p0}' is a reserved word. Parameters cannot be quoted, so choose another name."
  },
  "parse.needParam": {
    "ja": "引数名が必要です",
    "en": "A parameter name is required."
  },
  "name.propertyReserved": {
    "ja": "'{p0}' は予約プロパティ名({p1})なので変数名に使えません",
    "en": "'{p0}' is a reserved property name ({p2}) and cannot be used as a variable name."
  },
  "builtin.spriteOnly": {
    "ja": "'{p0}' はスプライト専用です(ステージでは使えません)",
    "en": "'{p0}' can only be used in a sprite, not on the stage."
  },
  "builtin.stageOnly": {
    "ja": "'{p0}' はステージ専用です",
    "en": "'{p0}' can only be used on the stage."
  },
  "builtin.arity": {
    "ja": "'{p0}' の引数個数が合いません ({p1} 個必要、実際 {p2} 個)",
    "en": "'{p0}' takes {p1} {argumentWord}, but {p2} {givenVerb} given."
  },
  "menu.argValue": {
    "ja": "{p0}() の引数 {p1} ({p2}) に \"{p3}\" は使えません。使用可能: {p4}{p5}（大文字と小文字を区別します）",
    "en": "\"{p3}\" is not a valid value for argument {p1} of {p0}() ({p2}). Use one of: {p4}{p5}. (Case-sensitive.)"
  },
  "menu.keyValue": {
    "ja": "キー名 に \"{p0}\" は使えません。使用可能: {p1}{p2}（大文字と小文字を区別します）",
    "en": "\"{p0}\" is not a valid key name. Use one of: {p1}{p2}. (Case-sensitive.)"
  },
  "menu.argString": {
    "ja": "{p0}() の引数 {p1} ({p2}) は文字列で指定してください",
    "en": "Argument {p1} of {p0}() ({p2}) must be a string."
  },
  "menu.keyString": {
    "ja": "キー名 は文字列で指定してください",
    "en": "The key name must be a string."
  },
  "asset.costumeNotFound": {
    "ja": "{p0} \"{p1}\" が見つかりません。使用可能: {p2}",
    "en": "{p0} \"{p1}\" was not found. Available: {p2}."
  },
  "asset.backdropNotFound": {
    "ja": "背景名 \"{p0}\" が見つかりません。使用可能: {p1}",
    "en": "Backdrop \"{p0}\" was not found. Available: {p1}."
  },
  "asset.soundNotFound": {
    "ja": "{p0}: 音 \"{p1}\" が見つかりません。使用可能: {p2}",
    "en": "{p0}: sound \"{p1}\" was not found. Available: {p2}."
  }
});

Object.assign(DIAGNOSTIC_MESSAGES, {
  "config.duplicate": {
    "ja": "設定 '{p0}' は同じ対象に一度だけ書けます",
    "en": "Setting '{p0}' can only be specified once per target."
  },
  "var.shadowsGlobal": {
    "ja": "変数 '{p0}' はステージのグローバル変数と同じ名前です。このスプライト内ではローカル変数が優先されます",
    "en": "Variable '{p0}' shares a name with a global stage variable. The local variable takes priority in this sprite."
  },
  "list.shadowsGlobal": {
    "ja": "リスト '{p0}' はステージのグローバルリストと同じ名前です",
    "en": "List '{p0}' shares a name with a global stage list."
  },
  "config.booleanLiteral": {
    "ja": "設定 '{p0}' には true または false を直接書いてください",
    "en": "Write true or false directly for setting '{p0}'."
  },
  "config.number": {
    "ja": "設定 '{p0}' には数値が必要です",
    "en": "Setting '{p0}' requires a number."
  },
  "config.costumeRange": {
    "ja": "current_costume={p0} はコスチュームの範囲外です (0〜{p1})",
    "en": "current_costume={p0} is outside the costume range (0–{p1})."
  },
  "config.boolean": {
    "ja": "設定 '{p0}' には true/false が必要です",
    "en": "Setting '{p0}' requires true/false."
  },
  "config.string": {
    "ja": "設定 '{p0}' には文字列が必要です",
    "en": "Setting '{p0}' requires a string."
  },
  "config.choice": {
    "ja": "設定 '{p0}' の値は {p1} のいずれかです",
    "en": "Setting '{p0}' must be one of: {p1}."
  },
  "event.cloneStage": {
    "ja": "「on clone」(クローンされたとき) はステージでは使えません",
    "en": "on clone cannot be used on the stage."
  },
  "event.keyType": {
    "ja": "「on key」のキー名は文字列で指定してください",
    "en": "The on key key name must be a string."
  },
  "event.keyLiteral": {
    "ja": "「on key」のキー名には \"space\" や \"a\" のような文字列を直接書いてください",
    "en": "Write the on key name as a string literal such as \"space\" or \"a\"."
  },
  "event.receiveType": {
    "ja": "「on receive」のメッセージ名は文字列で指定してください",
    "en": "The on receive message name must be a string."
  },
  "event.receiveLiteral": {
    "ja": "「on receive」のメッセージ名はリテラル文字列を推奨します(動的な名前は変換できません)",
    "en": "A literal string is recommended for on receive; dynamic names cannot be converted."
  },
  "event.sensorNumber": {
    "ja": "「on {p0} >」の比較値は数値です",
    "en": "The comparison value in on {p0} > must be a number."
  },
  "block.builtinConflict": {
    "ja": "'{p0}' は組み込み関数名と衝突します。別の名前にしてください",
    "en": "'{p0}' conflicts with a built-in function name. Choose another name."
  },
  "block.percent": {
    "ja": "ブロック名に '%' は使えません(Scratch のプロシージャ形式と衝突するため)",
    "en": "A block name cannot contain % because it conflicts with Scratch procedure formatting."
  },
  "param.duplicate": {
    "ja": "引数 '{p0}' が重複しています",
    "en": "Parameter '{p0}' is duplicated."
  },
  "param.augAssign": {
    "ja": "引数(パラメータ)には代入できません",
    "en": "Parameters cannot be assigned."
  },
  "var.augAssignType": {
    "ja": "+= / -= は数値型の変数のみ使用できます ('{p0}' は {p1} 型)",
    "en": "+= / -= can only be used on numeric variables ('{p0}' is {p1})."
  },
  "var.augAssignValue": {
    "ja": "+= / -= の右辺は数値です (実際: {p0})",
    "en": "The right side of += / -= must be numeric (got {p0})."
  },
  "var.augAssignTarget": {
    "ja": "この対象には += / -= できません",
    "en": "This target cannot be used with += / -=."
  },
  "list.assignDeclared": {
    "ja": "添字代入の対象は宣言済みのリスト名を指定してください",
    "en": "Use a declared list name for indexed assignment."
  },
  "list.index": {
    "ja": "リストの添字は整数 (または \"last\" / \"random\") です",
    "en": "A list index must be an integer, \"last\", or \"random\"."
  },
  "list.assignWhole": {
    "ja": "'{p0}' はリストです。リスト全体への代入はできません (items[i] = x / items.add(x) を使用)",
    "en": "'{p0}' is a list. You cannot assign to the whole list (use items[i] = x or items.add(x))."
  },
  "list.methodTarget": {
    "ja": "リストメソッドはリストに対してのみ呼び出せます",
    "en": "List methods can only be called on lists."
  },
  "list.methodOnVariable": {
    "ja": "'{p0}' はリストではなく変数です (.{p1}() は使えません)",
    "en": "'{p0}' is a variable, not a list (cannot use .{p1}())."
  },
  "list.addArity": {
    "ja": "add() の引数は1個です",
    "en": "add() takes one argument."
  },
  "list.addType": {
    "ja": "リスト '{p0}' の要素型は {p1} です。{p2} は追加できません",
    "en": "The element type of list '{p0}' is {p1}; cannot add a {p2} value."
  },
  "list.insertArity": {
    "ja": "insert() の引数は (位置, 値) の2個です",
    "en": "insert() takes two arguments: position and value."
  },
  "list.insertIndex": {
    "ja": "insert() の位置は整数 (または \"last\" / \"random\") です",
    "en": "The insert() position must be an integer, \"last\", or \"random\"."
  },
  "list.insertType": {
    "ja": "リスト '{p0}' の要素型は {p1} です。{p2} は挿入できません",
    "en": "The element type of list '{p0}' is {p1}; cannot insert a {p2} value."
  },
  "list.deleteArity": {
    "ja": "delete() の引数は1個です",
    "en": "delete() takes one argument."
  },
  "list.deleteIndex": {
    "ja": "delete() の位置は整数 (または \"last\" / \"all\" / \"random\") です",
    "en": "The delete() position must be an integer, \"last\", \"all\", or \"random\"."
  },
  "list.deleteAll": {
    "ja": "delete(\"all\") よりも clear() の使用を推奨します",
    "en": "Use clear() rather than delete(\"all\")."
  },
  "list.clearArity": {
    "ja": "clear() に引数はいりません",
    "en": "clear() takes no arguments."
  },
  "operator.inElement": {
    "ja": "in の左辺({p0})はリスト要素型({p1})と一致しません",
    "en": "The left side of in ({p0}) must match the list item type ({p1})."
  },
  "operator.inString": {
    "ja": "文字列に対する in の左辺は文字列です",
    "en": "The left side of in must be a string when searching a string."
  },
  "operator.boolLeft": {
    "ja": "{p0} の左辺は bool 型です (実際: {p1})",
    "en": "The left side of {p0} must be bool (got {p1})."
  },
  "operator.boolRight": {
    "ja": "{p0} の右辺は bool 型です (実際: {p1})",
    "en": "The right side of {p0} must be bool (got {p1})."
  },
  "list.compare": {
    "ja": "リスト同士の比較 (== / !=) はできません",
    "en": "Lists cannot be compared using == or !=."
  },
  "string.compare": {
    "ja": "文字列同士の大小比較はScratchでは辞書順ではありません。等価比較 (==) を推奨します",
    "en": "Scratch does not compare strings in dictionary order. Consider equality (==) instead."
  },
  "operator.divide": {
    "ja": "/ は数値同士でのみ使えます",
    "en": "/ requires numbers."
  },
  "operator.modulo": {
    "ja": "% は数値同士でのみ使えます",
    "en": "% requires numbers."
  },
  "name.targetAsValue": {
    "ja": "'{p0}' はスプライト/ステージ名です。値として使うには '{p1}.x' のようにプロパティを参照してください",
    "en": "'{p0}' is a sprite or stage name. To use a value, refer to a property such as '{p1}.x'."
  },
  "property.access": {
    "ja": "プロパティアクセスは「スプライト名.プロパティ」の形でのみ使えます",
    "en": "Property access must have the form spriteName.property."
  },
  "property.stageOnly": {
    "ja": "'{p0}' はステージのみが持つプロパティです ({p1} にはありません)",
    "en": "'{p0}' is a stage-only property ({p1} does not have it)."
  },
  "property.spriteOnly": {
    "ja": "'{p0}' はスプライトのプロパティです。ステージにはありません",
    "en": "'{p0}' is a sprite property and is not available on the stage."
  },
  "property.listReference": {
    "ja": "'{p0}.{p1}' はリストです。リストは他のスプライトから直接参照できません",
    "en": "'{p0}.{p1}' is a list. Lists cannot be referenced directly from another sprite."
  },
  "builtin.methodNoValue": {
    "ja": "'{p0}' は値を返しません(文としてのみ使用できます)",
    "en": "'{p0}' does not return a value; use it only as a statement."
  },
  "block.arity": {
    "ja": "ブロック '{p0}' の引数は {p1} 個ですが、{p2} 個渡されています",
    "en": "Block '{p0}' takes {p1} {argumentWord}, but {p2} {givenVerb} given."
  },
  "block.argumentType": {
    "ja": "ブロック '{p0}' の引数 '{p1}' は {p2} 型です。{p3} は渡せません",
    "en": "Parameter '{p1}' of block '{p0}' is {p2}; cannot pass {p3}."
  },
  "var.referenceSyntax": {
    "ja": "var(\"変数名\") の形で使ってください",
    "en": "Use var(\"variable name\")."
  },
  "list.referenceSyntax": {
    "ja": "list(\"リスト名\") の形で使ってください",
    "en": "Use list(\"list name\")."
  },
  "monitor.argument": {
    "ja": "{p0}(...) の引数は変数名またはリスト名です (スプライト自体の表示/非表示は引数なしの {p1}() を使ってください)",
    "en": "The argument to {p0}(...) must be a variable or list name. Use {p1}() without arguments to show or hide the sprite itself."
  },
  "builtin.lenArity": {
    "ja": "len() の引数は1個です",
    "en": "len() takes one argument."
  },
  "builtin.itemNumberArity": {
    "ja": "item_number() はリストと項目の2引数が必要です",
    "en": "item_number() takes two arguments: a list and an item."
  },
  "builtin.itemNumberList": {
    "ja": "item_number() の第1引数にはリスト名を指定してください（実際: {p0}）。例: item_number(items, 1)",
    "en": "The first argument of item_number() must be a list name (got {p0}). Example: item_number(items, 1)."
  },
  "builtin.itemNumberItem": {
    "ja": "item_number() の第2引数にはリストではなく、探す値を指定してください",
    "en": "The second argument of item_number() must be the value to find, not a list."
  },
  "builtin.dragModeLiteral": {
    "ja": "set_drag_mode() の設定は文字列リテラルで指定してください",
    "en": "Specify the set_drag_mode() setting as a string literal."
  },
  "export.literal": {
    "ja": "この位置にはリテラル(数値・文字列・true/false)のみ指定できます",
    "en": "Only a literal (number, string, true/false) is supported here."
  },
  "export.variableLiteral": {
    "ja": "変数の初期値はリテラル(数値・文字列・true/false)のみ対応しています",
    "en": "Variable initial values must be literals (number, string, true/false)."
  },
  "export.keyLiteral": {
    "ja": "on key のキー名は文字列リテラルで指定してください",
    "en": "The on key key name must be a string literal."
  },
  "export.receiveLiteral": {
    "ja": "on receive のメッセージ名は文字列リテラルで指定してください",
    "en": "The on receive message name must be a string literal."
  },
  "export.backdropLiteral": {
    "ja": "on backdrop の背景名は文字列リテラルで指定してください",
    "en": "The on backdrop name must be a string literal."
  },
  "export.cloneLiteral": {
    "ja": "create_clone() の対象は文字列リテラル(スプライト名 または \"myself\")で指定してください",
    "en": "The create_clone() target must be a string literal (sprite name or \"myself\")."
  },
  "export.monitorNotFound": {
    "ja": "変数/リスト '{p0}' が見つかりません",
    "en": "Variable or list '{p0}' was not found."
  },
  "export.assignmentTarget": {
    "ja": "代入対象が不正です",
    "en": "Invalid assignment target."
  },
  "export.indexList": {
    "ja": "添字代入の対象はリスト名のみ対応しています",
    "en": "Indexed assignment is only supported for named lists."
  },
  "export.if": {
    "ja": "if 文を変換できません",
    "en": "Could not convert the if statement."
  },
  "export.statementCall": {
    "ja": "文として実行できるのは関数呼び出しだけです",
    "en": "Only function calls can be executed as statements."
  },
  "export.command": {
    "ja": "'{p0}' をコマンド(文)として実行できません",
    "en": "'{p0}' cannot be executed as a command (statement)."
  },
  "export.resolve": {
    "ja": "'{p0}' を解決できません",
    "en": "Could not resolve '{p0}'."
  },
  "export.parameter": {
    "ja": "引数 '{p0}' はブロック定義(def)内でのみ使えます",
    "en": "Parameter '{p0}' can only be used inside a block definition (def)."
  },
  "export.listValue": {
    "ja": "リスト '{p0}' は値として直接使用できません({p1}[i] や len({p2}) を使ってください)",
    "en": "List '{p0}' cannot be used directly as a value. Use {p1}[i] or len({p2})."
  },
  "export.index": {
    "ja": "添字アクセス [ ] の対象はリストか文字列のみ変換できます",
    "en": "Index access [ ] can only be converted for a list or string."
  },
  "export.noValue": {
    "ja": "'{p0}' は値を返しません(文として使用してください)",
    "en": "'{p0}' does not return a value; use it as a statement."
  },
  "export.lenList": {
    "ja": "len() の対象リストを解決できません",
    "en": "Could not resolve the list used by len()."
  },
  "export.itemNumberList": {
    "ja": "item_number() のリストを解決できません",
    "en": "Could not resolve the list used by item_number()."
  },
  "export.blockNoValue": {
    "ja": "ブロック '{p0}' は値を返しません(文として使用してください)",
    "en": "Block '{p0}' does not return a value; use it as a statement."
  },
  "export.commandValue": {
    "ja": "'{p0}' は値を返す式としては使えません(コマンドは文の位置に書いてください)",
    "en": "'{p0}' cannot be used as a value; put commands in a statement position."
  },
  "export.expression": {
    "ja": "式を変換できません ({p0})",
    "en": "Could not convert expression ({p0})."
  },
  "export.operator": {
    "ja": "演算子 '{p0}' は変換できません",
    "en": "Operator '{p0}' cannot be converted."
  },
  "export.propertySyntax": {
    "ja": "プロパティ参照は「スプライト名.プロパティ」形式のみ変換できます",
    "en": "Property references can only be converted in spriteName.property form."
  },
  "export.spriteNotFound": {
    "ja": "'{p0}' はスプライト名ではありません",
    "en": "'{p0}' is not a sprite name."
  },
  "export.property": {
    "ja": "'{p0}.{p1}' を変換できません",
    "en": "Could not convert '{p0}.{p1}'."
  },
  "export.stringLiteral": {
    "ja": "{p0}() の引数{p1}は文字列リテラルが必要です",
    "en": "Argument {p1} of {p0}() must be a string literal."
  }
});

Object.assign(DIAGNOSTIC_MESSAGES, {
  "config.useSprite": {
    "ja": "設定 '{p0}' はスプライトに書いてください",
    "en": "Setting '{p0}' belongs on a sprite."
  },
  "config.useStage": {
    "ja": "設定 '{p0}' はステージに書いてください",
    "en": "Setting '{p0}' belongs on the stage."
  },
  "config.unknownStage": {
    "ja": "不明な設定項目 '{p0}' (ステージでは tempo/video_state/video_transparency/volume/current_costume/tts_language が使えます)",
    "en": "Unknown setting '{p0}'. On the stage, use tempo/video_state/video_transparency/volume/current_costume/tts_language."
  },
  "config.unknownSprite": {
    "ja": "不明な設定項目 '{p0}' (スプライトでは x/y/direction/size/visible/draggable/rotation_style/volume/current_costume/layer_order が使えます)",
    "en": "Unknown setting '{p0}'. On sprites, use x/y/direction/size/visible/draggable/rotation_style/volume/current_costume/layer_order."
  },
  "internal.export": {
    "ja": "エクスポート中に内部エラー: {p0}",
    "en": "Internal error during export: {p0}."
  }
});

Object.assign(DIAGNOSTIC_MESSAGES, {
  "note.extension": {
    "ja": "拡張機能「{p0}」のブロックはコメントとして保持されます(実行コードには変換されません)",
    "en": "Blocks from extension \"{p0}\" are kept as comments and are not converted into executable code."
  },
  "note.unsupported": {
    "ja": "未対応ブロック: {p0} → コメント行に変換されました(再エクスポート時には失われます)",
    "en": "Unsupported blocks: {p0} were converted to comment lines and will be lost when re-exported."
  },
  "note.monitorDuplicate": {
    "ja": "値モニター {p0} が重複しているため、最初の表示設定のみを使用します",
    "en": "Monitor {p0} is duplicated; only the first visibility setting is used."
  },
  "note.monitorMode": {
    "ja": "値モニター {p0} の表示形式は変換後に標準化されます",
    "en": "The display mode of monitor {p0} will be normalized after conversion."
  },
  "note.monitorIgnored": {
    "ja": "値モニター({p0})は変換対象外のため無視しました",
    "en": "Monitors ({p0}) are not supported by the converter and were ignored."
  },
  "note.cloudNormalized": {
    "ja": "クラウド変数「{p0}」の初期値「{p1}」は数値として「{p2}」に正規化されます",
    "en": "The initial value \"{p1}\" of cloud variable \"{p0}\" will be normalized to the number \"{p2}\"."
  },
  "note.cloudInvalid": {
    "ja": "クラウド変数「{p0}」の初期値は安全に数値へ変換できません。元の値を保持するため、書き出し前に修正が必要です",
    "en": "The initial value of cloud variable \"{p0}\" cannot safely be converted to a number. Correct it before exporting to preserve the original value."
  },
  "note.costumeMissing": {
    "ja": "コスチューム「{p0}」({p1}) の実ファイル {p2} が zip 内に見つかりませんでした。再エクスポート時はデフォルト画像になります",
    "en": "The file {p2} for costume \"{p0}\" ({p1}) was not found in the zip. A default image will be used when re-exported."
  },
  "note.soundMissing": {
    "ja": "音「{p0}」({p1}) の実ファイル {p2} が zip 内に見つかりませんでした。再エクスポート時は無音になります",
    "en": "The file {p2} for sound \"{p0}\" ({p1}) was not found in the zip. It will be silent when re-exported."
  },
  "note.scratchComments": {
    "ja": "{p0}: Scratch のコメントブロック({p1}個)はテキストのコメントとしては復元されません",
    "en": "{p0}: Scratch comment blocks ({p1}) will not be restored as text comments."
  },
  "note.orphanReporter": {
    "ja": "{p0}: 孤立したレポータブロック「{p1}」(値を返すだけのブロック)は無視しました",
    "en": "{p0}: Ignored orphan reporter block \"{p1}\" (a block that only returns a value)."
  },
  "note.orphanScript": {
    "ja": "{p0}: ハットブロックなしの孤立したスクリプト({p1})はコメント化しました",
    "en": "{p0}: Converted an orphan script without a hat block ({p1}) into comments."
  },
  "note.parameterRenamed": {
    "ja": "{p0}: ブロック「{p1}」の引数名「{p2}」を「{p3}」に変換しました",
    "en": "{p0}: Renamed parameter \"{p2}\" of block \"{p1}\" to \"{p3}\"."
  },
  "note.procedureSimplified": {
    "ja": "{p0}: プロシージャ「{p1}」のラベルテキストは簡略化されました (ScratchPy名: {p2})",
    "en": "{p0}: Simplified the label text of procedure \"{p1}\" (ScratchPy name: {p2})."
  },
  "note.procedureConverted": {
    "ja": "{p0}: プロシージャ「{p1}」→ def {p2}(...) に変換 (ラベル文字列は省略されます)",
    "en": "{p0}: Converted procedure \"{p1}\" to def {p2}(...) (label text omitted)."
  },
  "note.undefinedBlock": {
    "ja": "{p0}: 定義のないカスタムブロック「{p1}」の呼び出しをコメント化しました",
    "en": "{p0}: Converted the call to undefined custom block \"{p1}\" into a comment."
  },
  "note.appearanceChoice": {
    "ja": "不明な見た目レポータの選択肢 {p0} は number に変換されます",
    "en": "Unknown appearance reporter option {p0} will be converted to number."
  },
  "note.parameterSanitized": {
    "ja": "識別子化できない引数名「{p0}」を検出しました。sanitize して参照します",
    "en": "Parameter name \"{p0}\" cannot be used as an identifier and will be sanitized for references."
  },
  "note.dynamicInput": {
    "ja": "{p0} の {p1} は動的な値を使っています。ScratchPyでは未対応のため、元の .sb3 を保存してください",
    "en": "{p0} input {p1} uses a dynamic value. This is unsupported in ScratchPy; keep the original .sb3."
  },
  "note.variableInput": {
    "ja": "{p0} の {p1} は変数を使っています。ScratchPyでは未対応のため、元の .sb3 を保存してください",
    "en": "{p0} input {p1} uses a variable. This is unsupported in ScratchPy; keep the original .sb3."
  }
});

Object.assign(DIAGNOSTIC_MESSAGES, {
  "validation.object": {
    "ja": "プロジェクトがオブジェクトではありません",
    "en": "Project is not an object."
  },
  "validation.targetsEmpty": {
    "ja": "targets が空です",
    "en": "The targets list is empty."
  },
  "validation.stages": {
    "ja": "ステージはちょうど1つ必要です (実際: {p0})",
    "en": "Exactly one stage is required (got {p0})."
  },
  "validation.stageFirst": {
    "ja": "最初のターゲットはステージであるべきです",
    "en": "The first target should be the stage."
  },
  "validation.duplicateTarget": {
    "ja": "ターゲット名「{p0}」が重複しています",
    "en": "Target name \"{p0}\" is duplicated."
  },
  "validation.emptyTarget": {
    "ja": "ターゲット名が空です",
    "en": "The target name is empty."
  },
  "validation.monitorId": {
    "ja": "モニターに id がありません",
    "en": "The monitor has no id."
  },
  "validation.monitorMode": {
    "ja": "不明なモニターモード: {p0}",
    "en": "Unknown monitor mode: {p0}."
  },
  "validation.costumes": {
    "ja": "コスチュームが1つもありません",
    "en": "There are no costumes."
  },
  "validation.costumeRange": {
    "ja": "currentCostume={p0} が範囲外です",
    "en": "currentCostume={p0} is out of range."
  },
  "validation.assetFields": {
    "ja": "assetId/md5ext がありません",
    "en": "Missing assetId/md5ext."
  },
  "validation.assetName": {
    "ja": "md5ext が assetId と一致しません",
    "en": "md5ext does not match assetId."
  },
  "validation.assetMissing": {
    "ja": "アセットファイル {p0} が zip に含まれていません",
    "en": "Asset file {p0} is missing from the zip."
  },
  "validation.assetMd5": {
    "ja": "アセットの MD5 が一致しません (期待: {p0}, 実際: {p1})",
    "en": "Asset MD5 does not match (expected {p0}, got {p1})."
  },
  "validation.opcode": {
    "ja": "opcode がありません",
    "en": "Missing opcode."
  },
  "validation.next": {
    "ja": "next={p0} が存在しないブロックを指しています",
    "en": "next={p0} refers to a nonexistent block."
  },
  "validation.parent": {
    "ja": "parent={p0} が存在しません",
    "en": "parent={p0} does not exist."
  },
  "validation.nextParent": {
    "ja": "next ブロックの parent が {p0} になっていません (実際: {p1})",
    "en": "The next block parent should be {p0} (got {p1})."
  },
  "validation.topLevelParent": {
    "ja": "topLevel なのに parent があります",
    "en": "A top-level block has a parent."
  },
  "validation.noParent": {
    "ja": "topLevel=false なのに parent がありません",
    "en": "A non-top-level block has no parent."
  },
  "validation.topLevelPosition": {
    "ja": "topLevel ブロックに x/y がありません",
    "en": "A top-level block has no x/y position."
  },
  "validation.shadowTopLevel": {
    "ja": "shadow ブロックが topLevel です",
    "en": "A shadow block is top-level."
  },
  "validation.inputArray": {
    "ja": "input が配列ではありません",
    "en": "The input is not an array."
  },
  "validation.inputMode": {
    "ja": "input モードが不正: {p0}",
    "en": "Invalid input mode: {p0}."
  },
  "validation.substackParent": {
    "ja": "サブスタック先頭ブロックの parent が {p0} ではありません",
    "en": "The first substack block parent should be {p0}."
  },
  "validation.inputParent": {
    "ja": "入力ブロック {p0} の parent が設定されていません",
    "en": "Input block {p0} has no parent."
  },
  "validation.variableId": {
    "ja": "変数 id {p0} (name={p1}) がプロジェクト内に登録されていません",
    "en": "Variable id {p0} (name={p1}) is not registered in the project."
  },
  "validation.listId": {
    "ja": "リスト id {p0} がプロジェクト内に登録されていません",
    "en": "List id {p0} is not registered in the project."
  },
  "validation.broadcastId": {
    "ja": "ブロードキャスト id {p0} が登録されていません",
    "en": "Broadcast id {p0} is not registered."
  },
  "validation.procedureMutation": {
    "ja": "procedures に mutation がありません",
    "en": "The procedure has no mutation."
  },
  "validation.procedureCode": {
    "ja": "proccode がありません",
    "en": "Missing proccode."
  },
  "validation.procedureArgs": {
    "ja": "argumentids がありません(文字列化JSON)",
    "en": "Missing argumentids (JSON string)."
  },
  "validation.stopMutation": {
    "ja": "control_stop に mutation(hasnext) がありません",
    "en": "control_stop has no mutation (hasnext)."
  },
  "validation.unreachableBlock": {
    "ja": "ブロック({p0})がどのスクリプトからも到達できません",
    "en": "Block ({p0}) is not reachable from any script."
  },
  "validation.missingBlock": {
    "ja": "入力値が存在しないブロック id を指しています: {p0}",
    "en": "Input refers to nonexistent block id: {p0}."
  },
  "validation.literalKind": {
    "ja": "リテラルの種類が不正: {p0}",
    "en": "Invalid literal kind: {p0}."
  },
  "validation.literalFields": {
    "ja": "リテラル [{p0}] には name と id が必要です",
    "en": "Literal [{p0}] requires a name and id."
  },
  "validation.inputType": {
    "ja": "入力値の型が不正です",
    "en": "Invalid input value type."
  }
});

Object.assign(DIAGNOSTIC_MESSAGES, {
  "zip.unzip": {
    "ja": ".sb3 ファイルの展開に失敗しました (ZIP 形式が壊れているか、.sb3 ファイルではありません)",
    "en": "Could not unpack the .sb3 file. The ZIP may be damaged or the file may not be an .sb3."
  },
  "zip.noProject": {
    "ja": "zip 内に project.json が見つかりません (.sb3 ファイルですか?)",
    "en": "project.json was not found in the ZIP. Is this an .sb3 file?"
  },
  "zip.badJson": {
    "ja": "project.json の JSON 解析に失敗しました",
    "en": "Could not parse the JSON in project.json."
  },
  "import.needTargets": {
    "ja": "project.json が不正です (targets がありません)",
    "en": "Invalid project.json: targets are missing or empty."
  },
  "import.needStage": {
    "ja": "project.json にステージがありません",
    "en": "The project.json has no stage."
  },
  "import.oneStage": {
    "ja": "ステージは1つである必要があります",
    "en": "The project must have exactly one stage."
  },
  "import.duplicateNames": {
    "ja": "ターゲット名「{p0}」が空または重複しています。参照が曖昧なため、Scratchで名前を修正してください",
    "en": "Target name \"{p0}\" is empty or duplicated. Fix the names in Scratch to avoid ambiguous references."
  },
  "import.depth": {
    "ja": "ブロックの入れ子が深すぎます (最大80段)。データを失わないよう読み込みを中止しました",
    "en": "Block nesting is too deep (maximum 80 levels). Import was stopped to avoid losing data."
  },
  "sb3.unknown": {
    "ja": ".sb3 ファイルを読み込めませんでした",
    "en": "Could not load the .sb3 file."
  },
  "api.depth": {
    "ja": "ブロックまたは式の入れ子が深すぎます。元の .sb3 は保持してください",
    "en": "Block or expression nesting is too deep. Keep the original .sb3 file."
  }
});

Object.assign(DIAGNOSTIC_MESSAGES, {
  "zip.tooLarge": {
    "ja": "ファイルが大きすぎます (上限 {p0})。元の .sb3 を確認してください",
    "en": "The file is too large (limit {p0}). Check the original .sb3 file."
  },
  "zip.projectJsonTooLarge": {
    "ja": "project.json が大きすぎます (上限 {p0})。読み込みを中止しました",
    "en": "project.json is too large (limit {p0}). Import was stopped."
  },
  "export.assetNameSkippedMore": {
    "ja": "ほか {p0} 件のアセットも名前が安全でないため .sb3 に含めませんでした",
    "en": "{p0} more asset(s) were also left out of the .sb3 because their names are not safe."
  },
  "export.assetNameSkipped": {
    "ja": "アセット名「{p0}」は安全でない文字を含むため .sb3 に含めませんでした。Scratch で表示されない可能性があります",
    "en": "Asset \"{p0}\" was left out of the .sb3 because its name is not safe. It may not appear in Scratch."
  },
  "zip.tooManyEntries": {
    "ja": "zip 内のファイル数が多すぎます (上限 {p0} 件)",
    "en": "The ZIP contains too many entries (limit {p0})."
  },
  "zip.expandsTooMuch": {
    "ja": "展開後のサイズが大きすぎます (上限 {p0})",
    "en": "The expanded size is too large (limit {p0})."
  },
  "text.tooLarge": {
    "ja": "コードが大きすぎます (上限 {p0} 行 / {p1})。分割してください",
    "en": "The code is too large (limit {p0} lines / {p1}). Split it up."
  }
});

export type DiagnosticParams = Record<string, string | number | readonly string[] | readonly number[]>;
export interface DiagnosticMessage { id: string; params: DiagnosticParams; message: string }
export function formatDiagnostic(id: string, params: DiagnosticParams, lang: 'ja' | 'en'): string | undefined {
  const template = DIAGNOSTIC_MESSAGES[id]?.[lang];
  if (template === undefined) return undefined;
  const expected = params.p1;
  const singular = Array.isArray(expected) ? expected.length === 1 && Number(expected[0]) === 1 : Number(expected) === 1;
  const pattern = lang === 'en' && (id === 'builtin.arity' || id === 'block.arity')
    ? template.replace('{argumentWord}', singular ? 'argument' : 'arguments').replace('{givenVerb}', Number(params.p2) === 1 ? 'was' : 'were')
    : template;
  return pattern.replace(/\{(p\d+)\}/g, (_, key: string) => Array.isArray(params[key]) ? (params[key] as readonly (string | number)[]).map(x => typeof x === 'string' ? JSON.stringify(x) : String(x)).join(lang === 'ja' && id === 'builtin.arity' ? ' または ' : id === 'builtin.arity' ? ' or ' : ', ') : String(params[key] ?? ''));
}
export function diag(id: string, params: DiagnosticParams = {}): DiagnosticMessage {
  const message = formatDiagnostic(id, params, 'ja');
  if (message === undefined) throw new Error(`Unknown diagnostic ID: ${id}`);
  return { id, params, message };
}
export function diagnosticFields(value: string | DiagnosticMessage, fallbackCode: string) {
  return typeof value === 'string' ? { message: value, code: fallbackCode } : { message: value.message, code: value.id, params: value.params };
}
