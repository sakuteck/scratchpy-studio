import { EN, t } from '../i18n';
import { englishDiagnostic } from '../diagnosticText';
import type { TextAnalysis } from '../../core/api';
import { IconCheckCircle, IconXCircle, IconAlertTriangle, IconInfo } from './Icons';

interface Props {
  analysis: TextAnalysis | null;
  onJump(line: number): void;
  assetsUnavailable?: boolean;
  /** コードが空のときは「問題なし」ではなく「まだ何も書かれていない」と伝える（診断 N11）。 */
  empty?: boolean;
}

/** 一度に描く診断の上限（診断 N19）。100 件でも 1.6 秒かかっていたため、超えた分はまとめて伝える。 */
const MAX_ROWS = 200;

export default function DiagnosticsPanel({ analysis, onJump, assetsUnavailable = false, empty = false }: Props) {
  if (!analysis) {
    return <div className="panel-body"><div className="empty-note">{t('解析結果がありません', 'No analysis available.')}</div></div>;
  }
  const diags = analysis.diagnostics;
  if (diags.length === 0) {
    if (empty) {
      return (
        <div className="panel-body">
          <div className="ok-note">
            <IconInfo size={20} style={{ color: 'var(--info)' }} /> {t('まだコードがありません', 'There is no code yet')}<br />
            <span style={{ fontWeight: 400, color: 'var(--muted)' }}>
              {t('エディタにコードを書くか、サンプルを読み込んでください。空のまま書き出すと、何も入っていない作品になります。',
                 'Write some code in the editor, or load a sample. Exporting now produces an empty project.')}
            </span>
          </div>
        </div>
      );
    }
    return (
      <div className="panel-body">
        <div className="ok-note">
          <IconCheckCircle size={20} style={{ color: 'var(--ok)' }} /> {t('エラー・警告はありません', 'No errors or warnings')}<br />
          <span style={{ fontWeight: 400, color: 'var(--muted)' }}>
            {assetsUnavailable ? t('アセットを復元するまで書き出しはできません', 'Restore the assets before exporting.') : t('このコードは .sb3 として書き出せます', 'This code is ready to export as .sb3.')}
          </span>
        </div>
      </div>
    );
  }
  const shown = diags.length > MAX_ROWS ? diags.slice(0, MAX_ROWS) : diags;
  const hidden = diags.length - shown.length;
  return (
    <div className="panel-body">
      <div className="diag-list">
        {shown.map((d, i) => {
          const jump = () => d.loc && onJump(d.loc.line);
          // 位置のある診断は <button> にする（キーボードでも「該当行へ移動」に届く・診断 N6）。
          const Tag = d.loc ? 'button' : 'div';
          return (
          <Tag
            key={i}
            type={d.loc ? 'button' : undefined}
            className={`diag ${d.severity}`}
            onClick={d.loc ? jump : undefined}
            title={d.loc ? t('この行へ移動（Enter でも移動できます）', 'Jump to this line (Enter works too)') : undefined}
          >
            <div className="icon">
              {d.severity === 'error' ? <IconXCircle size={14} />
                : d.severity === 'warning' ? <IconAlertTriangle size={14} />
                : <IconInfo size={14} />}
            </div>
            <div className="msg">{EN ? englishDiagnostic(d) : d.message}</div>
            {d.loc && <div className="pos">{d.loc.line}:{d.loc.col}</div>}
          </Tag>
          );
        })}
        {hidden > 0 && (
          <div className="diag-more" role="status">
            {t(`ほかに ${hidden} 件の診断があります（表示は最初の ${MAX_ROWS} 件まで）`,
               `${hidden} more diagnostics (showing the first ${MAX_ROWS})`)}
          </div>
        )}
      </div>
    </div>
  );
}
