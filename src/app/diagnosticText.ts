import { ExportError } from '../core/sb3/exporter';
import { ParseError } from '../core/lang/parser';
import { Sb3ParseError } from '../core/sb3/zip';
import { BlocklyReject, englishBridgeError } from './blockly/messages';
import { LexError } from '../core/lang/lexer';
import { formatDiagnostic } from '../core/lang/diagnostics';
import type { Diagnostic } from '../core/api';

/** Stable codes choose a dictionary entry; unknown/external diagnostics stay intact. */
export function englishDiagnostic(d: Diagnostic): string {
  return formatDiagnostic(d.code, d.params ?? {}, 'en') ?? d.message;
}

/** Conversion exceptions carry diagnostics; unknown external exceptions keep their original details. */
export function englishError(e: unknown): string {
  if (e instanceof ExportError) return e.diagnostics.map(d => `${d.path ? `[Validation] ${d.path}: ` : ''}${englishDiagnostic(d)}`).join('; ');
  if (e instanceof BlocklyReject) return englishBridgeError(e);
  if (e instanceof ParseError || e instanceof LexError || e instanceof Sb3ParseError) return englishDiagnostic({severity:'error',code:e.code ?? 'unknown',params:e.params,message:e.message});
  return e instanceof Error ? e.message : String(e);
}
