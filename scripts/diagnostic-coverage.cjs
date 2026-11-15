// Static AST audit for diagnostic producers. Baseline is explicit and never auto-updated by CI.
//
// 対象:
//   - src/core ... this.err / this.warn / new ParseError / new LexError / new Sb3ParseError / this.note / validate の err/warn
//   - src/app, src/education (.ts/.tsx) ... throw 文の日本語リテラル（三項・論理式の中も含む）、
//     BlocklyReject のコード・パラメータ（呼び出し単位）、setTooltip / setWarningText / alert / confirm、
//     aria-label などの属性、JSX の固定テキストと式コンテナ ({'日本語'}),
//     直接 DOM へ書く textContent / innerText / title の代入
// 対象外（既知の限界）:
//   - 関数の外で組み立てた文言（変数経由の throw、new Error して throw しないもの）
//   - t('ja','en') や、条件が EN の三項（EN ? 'En' : '日本語'）のように、その場で対訳している式
//     ※ throw は例外で、EN ? ... でも辞書化漏れとして検出する（可視テキストだけが除外対象）
//   - 外部ライブラリ（Blockly 本体など）が投げる例外の文言
//   - 実行時に組み立てられる利用者入力・作品データ
// 注意: EN バンドルに日本語文字列が同梱されていても漏れとは限らない。
//   EN ? en : ja のように実行時に選ぶ表（BLOCK_TIPS など）は、表示が必ず英語になるための設計。
//   この監査は「生成される文言」ではなく「コードに直書きされた可視文言」を見る。
// 英語版が別ファイルになっているガイドページなどは、理由付きで
// src/tests/ui-text-allowlist.json にファイル単位で明示する。
const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const root=path.join(process.cwd(),'src/core');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(path.join(dir,d.name)):(d.name.endsWith('.ts')||d.name.endsWith('.tsx'))?[path.join(dir,d.name)]:[])}
const kind=(file)=>file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS;
function collect(overrides={}){const legacy=new Set(), ids=new Set(), calls=[], errors=[];
 for(const full of files(root)){
  const file=path.relative(process.cwd(),full).replaceAll('\\','/');if(file.endsWith('/diagnostics.ts'))continue;
  const source=overrides[file] ?? fs.readFileSync(full,'utf8'),sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,kind(file));
  const fail=(n,msg)=>errors.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1}: ${msg}`);
  const record=(kind,n)=>legacy.add(`${file} | ${kind} | ${n.getText(sf)}`);
  const idExpr=(n)=>{if(ts.isStringLiteral(n)){ids.add(n.text);return true}if(ts.isConditionalExpression(n))return idExpr(n.whenTrue)&&idExpr(n.whenFalse);return false};
  function visit(n){
   if(ts.isCallExpression(n)||ts.isNewExpression(n)){
    const expression=n.expression.getText(sf), args=n.arguments ?? [];
    const primary=['this.err','this.warn','new ParseError','new LexError','new Sb3ParseError','this.note'].includes(ts.isNewExpression(n)?'new '+expression:expression);
    const validation=file.endsWith('/validate.ts') && ['err','warn'].includes(expression);
    const unstructuredNotes=expression==='this.notes.push' && file.endsWith('/importer.ts');
    if(primary||validation||unstructuredNotes){const arg=args[validation?1:0];
      const inspectArg = a => { if(ts.isConditionalExpression(a)){inspectArg(a.whenTrue);inspectArg(a.whenFalse)}
       else if(ts.isCallExpression(a)&&a.expression.getText(sf)==='diag'){if(!a.arguments[0]||!idExpr(a.arguments[0]))fail(a,'diagnostic id must be a literal or literal-only conditional')}
       else record(expression,a);};
      if(!arg)fail(n,'missing diagnostic argument');else inspectArg(arg);
    }
    if(ts.isCallExpression(n)&&expression==='diag') {
      if (!args[0] || !idExpr(args[0])) fail(n,'diagnostic id must be a literal or literal-only conditional');
      else {
       const callIds=[]; const visitId=x=>{if(ts.isStringLiteral(x))callIds.push(x.text);else if(ts.isConditionalExpression(x)){visitId(x.whenTrue);visitId(x.whenFalse)}};visitId(args[0]);
       const params=args[1];if(params && !ts.isObjectLiteralExpression(params))fail(n,'diagnostic params must be a statically checked object literal');
       calls.push({file, ids:callIds, keys:params && ts.isObjectLiteralExpression(params) ? params.properties.filter(ts.isPropertyAssignment).map(p=>p.name.getText(sf)) : []});
      }
    }
   }
   if(ts.isObjectLiteralExpression(n)){
    const props=n.properties.filter(ts.isPropertyAssignment);const severity=props.find(p=>p.name.getText(sf)==='severity');const message=props.find(p=>p.name.getText(sf)==='message');
    if(severity&&message)record('object.message',message.initializer);
    if(severity&&!message) {
      const spreads=n.properties.filter(ts.isSpreadAssignment);
      if(!spreads.length)fail(n,'severity object has no diagnostic message');
      for(const spread of spreads) {
        const expr=spread.expression;
        // Direct dictionary-generated fields are checked through the nested diag() call.
        if(!(ts.isCallExpression(expr)&&expr.expression.getText(sf)==='diagnosticFields'&&expr.arguments[0]&&ts.isCallExpression(expr.arguments[0])&&expr.arguments[0].expression.getText(sf)==='diag')) record('object.spread',expr);
      }
    }
   }
   ts.forEachChild(n,visit)
  }visit(sf)
 }
 return {legacy:[...legacy].sort(),ids:[...ids].sort(),calls,errors};
}
// UI 層（src/app, src/education）の拒否メッセージと可視文言も同じ方針で凍結する。
// bridge.ts は BlocklyReject のコードだけを渡し、表示側が言語を選ぶ。
// .tsx も走査し、throw・ツールチップ・属性・JSX テキストを見る。
const UI_ROOTS=['src/app','src/education'];
const CJK=/[\u3040-\u30ff\u3400-\u9fff]/u;
const TEXT_ATTRS=new Set(['aria-label','aria-description','title','placeholder','alt']);
// ユーザーに見える文言を受け取る呼び出し（Window を挟む形も許容）。
const TEXT_CALLS=['setTooltip','setWarningText','alert','confirm'];
// 直接 DOM に書き込む可視テキスト（textContent / innerText / document.title）。
const DOME_TEXT_PROPS=new Set(['textContent','innerText','title']);
function bridgeDictionary(){
 const file=path.join(process.cwd(),'src/app/blockly/messages.ts');
 const sf=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const map=new Map();
 function visit(n){
  if(ts.isVariableDeclaration(n)&&n.name.getText(sf)==='BRIDGE_MESSAGES'&&n.initializer&&ts.isObjectLiteralExpression(n.initializer)){
   for(const prop of n.initializer.properties){
    if(!ts.isPropertyAssignment(prop))continue;
    const id=ts.isStringLiteralLike(prop.name)?prop.name.text:prop.name.getText(sf);
    let text='';
    if(ts.isObjectLiteralExpression(prop.initializer)) for(const field of prop.initializer.properties)
     if(ts.isPropertyAssignment(field)&&ts.isStringLiteralLike(field.initializer)) text+=field.initializer.text;
    map.set(id,new Set([...text.matchAll(/\{(p\d+)\}/g)].map(m=>m[1])));
   }
  }
  ts.forEachChild(n,visit);
 }
 visit(sf);return map;
}
/** 既定の除外は allowlist から読む。引数なしでも除外が効くので、除外漏れに気づける。 */
function defaultSkipFiles(){try{const j=JSON.parse(fs.readFileSync(path.join(process.cwd(),'src/tests/ui-text-allowlist.json'),'utf8'));return Object.keys((j&&j.files)||{})}catch{return []}}
function collectUi(overrides={},skipFiles=defaultSkipFiles()){const frozen=new Set(), ids=new Set(), calls=[], errors=[];
 const uiFiles=UI_ROOTS.flatMap(dir=>files(path.join(process.cwd(),dir)));
 for(const full of uiFiles){
  const file=path.relative(process.cwd(),full).replaceAll('\\','/');
  const source=overrides[file] ?? fs.readFileSync(full,'utf8'),sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,kind(file));
  const fail=(n,msg)=>errors.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1}: ${msg}`);
  const isLiteral=(x)=>ts.isStringLiteral(x)||ts.isNoSubstitutionTemplateLiteral(x)||ts.isTemplateExpression(x);
  const isTranslation=(x)=>ts.isCallExpression(x)&&x.expression.getText(sf)==='t';
  // テンプレート文字列は「地の文」と「埋め込み式」を分けて見る（${t(...)} を誤検出しない）。
  const templateChunks=(node)=>[node.head.text,...node.templateSpans.map(sp=>sp.literal.text)];
  // throw 用: EN ? 'x' : '日本語' も「未コード化の文言」として検出する（辞書化を促す）。
  const cjkLiterals=(node,out=[])=>{
   if(isTranslation(node))return out;
   if(ts.isTemplateExpression(node)){
    if(templateChunks(node).some(t=>CJK.test(t)))out.push(node.getText(sf));
    for(const sp of node.templateSpans)cjkLiterals(sp.expression,out);
    return out;
   }
   if(isLiteral(node)){if(CJK.test(node.getText(sf)))out.push(node.getText(sf));return out}
   ts.forEachChild(node,child=>{cjkLiterals(child,out)});return out;
  };
  // 可視テキスト用: 条件が EN の対訳ペア（EN ? 'English' : '日本語'）と t() は望ましい形なので除外する。
  // flag ? 'A' : '日本語' のように言語フラグ以外の三項は通常どおり検出する。
  const cjkVisibleText=(node,out=[])=>{
   if(isTranslation(node))return out;
   if(ts.isTemplateExpression(node)){
    if(templateChunks(node).some(t=>CJK.test(t)))out.push(node.getText(sf));
    for(const sp of node.templateSpans)cjkVisibleText(sp.expression,out);
    return out;
   }
   if(isLiteral(node)){if(CJK.test(node.getText(sf)))out.push(node.getText(sf));return out}
   if(ts.isConditionalExpression(node)&&/\bEN\b/.test(node.condition.getText(sf))&&isLiteral(node.whenTrue)&&isLiteral(node.whenFalse))return out;
   ts.forEachChild(node,child=>{cjkVisibleText(child,out)});return out;
  };
  function visit(n){
   // 対象は throw だけ。Blockly のフィールド定義など、意図的に日本語キーを持つ
   // コンストラクタ引数（日英対応表のキー）は翻訳漏れではないため拾わない。
   if(ts.isThrowStatement(n)&&n.expression){
    const arg=n.expression, isNew=ts.isNewExpression(arg), name=isNew?arg.expression.getText(sf):'throw', args=isNew?(arg.arguments??[]):[];
    if(isNew&&name==='BlocklyReject'){
     if(!args[0]||!ts.isStringLiteral(args[0]))fail(n,'bridge reject code must be a literal');
     else{
      const id=args[0].text;ids.add(id);
      const keys=args[1]&&ts.isObjectLiteralExpression(args[1])?args[1].properties.filter(ts.isPropertyAssignment).map(p=>ts.isStringLiteralLike(p.name)?p.name.text:p.name.getText(sf)):[];
      if(args[1]&&!ts.isObjectLiteralExpression(args[1]))fail(n,'bridge reject params must be an object literal');
      calls.push({file,line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,id,keys});
      // パラメータの「値」も見る。利用者入力（識別子）は自由だが、固定の日本語を渡すと EN に漏れる。
      const params=args[1];
      if(params&&ts.isObjectLiteralExpression(params)) for(const prop of params.properties){
       if(!ts.isPropertyAssignment(prop))continue;
       const hole=ts.isStringLiteralLike(prop.name)?prop.name.text:prop.name.getText(sf);
       for(const literal of cjkLiterals(prop.initializer)) fail(prop,`bridge reject parameter ${hole} must not be a Japanese literal (pass an identifier or value)`);
      }
     }
    } else for(const literal of cjkLiterals(arg)) frozen.add(`${file} | ${name} | ${literal}`);
   }
   // ツールチップ・警告文・ダイアログ・アクセシビリティ属性・JSX の固定文言も可視テキスト。
   if(ts.isCallExpression(n)&&n.arguments[0]&&TEXT_CALLS.some(c=>{const callee=n.expression.getText(sf).replace(/^window\./,'');return callee===c||callee.endsWith('.'+c)})){
    const name=n.expression.getText(sf).replace(/^window\./,'').split('.').pop();
    for(const literal of cjkVisibleText(n.arguments[0])) frozen.add(`${file} | ${name} | ${literal}`);
   }
   // e.textContent = '日本語' / document.title = '日本語' のような直接 DOM 代入も可視テキスト。
   if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(n.left)&&DOME_TEXT_PROPS.has(n.left.name.getText(sf))){
    const prop=n.left.name.getText(sf);
    for(const literal of cjkVisibleText(n.right)) frozen.add(`${file} | ${prop} | ${literal}`);
   }
   if(ts.isJsxAttribute(n)&&n.initializer&&ts.isStringLiteral(n.initializer)&&TEXT_ATTRS.has(n.name.getText(sf)))
    for(const literal of cjkVisibleText(n.initializer)) frozen.add(`${file} | jsx:${n.name.getText(sf)} | ${literal}`);
   if(ts.isJsxText(n)&&CJK.test(n.getText(sf))) frozen.add(`${file} | jsx-text | ${JSON.stringify(n.getText(sf).replace(/\s+/g,' ').trim())}`);
   // {'日本語'} のような式コンテナも可視テキスト（t() と EN ? : は cjkVisibleText が除外）。
   if(ts.isJsxExpression(n)&&n.expression)
    for(const literal of cjkVisibleText(n.expression)) frozen.add(`${file} | jsx-expr | ${literal}`);
   ts.forEachChild(n,visit);
  }
  visit(sf);
 }
 // 呼び出し単位で辞書のパラメータが揃っているかを確認する。
 const dictionary=bridgeDictionary();
 for(const call of calls){
  if(!dictionary.has(call.id)){errors.push(`${call.file}:${call.line}: unknown bridge message id ${call.id}`);continue}
  for(const hole of dictionary.get(call.id)) if(!call.keys.includes(hole)) errors.push(`${call.file}:${call.line}: ${call.id} is missing {${hole}}`);
 }
 // 除外ファイル（英語版が別ファイルのガイドなど）の分は skipped に分けて返す。
 const skipSet=new Set(skipFiles),all=[...frozen].sort();
 const skipped=all.filter(e=>skipSet.has(e.split(' | ')[0]));
 return {files:uiFiles.map(f=>path.relative(process.cwd(),f).replaceAll('\\','/')).sort(),frozen:all.filter(e=>!skipSet.has(e.split(' | ')[0])),skipped,skipFiles:[...skipSet].sort(),ids:[...ids].sort(),calls,errors};
}
module.exports={collect,collectUi,defaultSkipFiles};
