/** Scratch の「表示/非表示」命令を持たない、値レポータのモニター。 */
export interface ReporterMonitorSpec {
  key: string;
  opcode: string;
  params: Record<string, string>;
  /** stage = プロジェクト共通、sprite = スプライト別、both = 各ターゲット別 */
  scope: 'stage' | 'sprite' | 'both';
  id: string;
  extension?: string;
}
const spec = (key:string, opcode:string, scope:ReporterMonitorSpec['scope'], id:string, params:Record<string,string>={}, extension?:string):ReporterMonitorSpec =>
  ({key, opcode, scope, id, params, extension});
export const REPORTER_MONITORS: ReporterMonitorSpec[] = [
  spec('timer_visible','sensing_timer','stage','timer'),
  spec('answer_visible','sensing_answer','stage','answer'),
  spec('loudness_visible','sensing_loudness','stage','loudness'),
  ...(['year','month','date','dayofweek','hour','minute','second'] as const).map(unit =>
    spec(`current_${unit}_visible`, 'sensing_current', 'stage', `current_${unit}`, {CURRENTMENU: unit.toUpperCase()})),
  spec('backdrop_number_visible','looks_backdropnumbername','stage','backdropnumbername_number',{NUMBER_NAME:'number'}),
  spec('backdrop_name_visible','looks_backdropnumbername','stage','backdropnumbername_name',{NUMBER_NAME:'name'}),
  spec('tempo_visible','music_getTempo','stage','music_getTempo',{},'music'),
  // Official extension reporter monitors with no dropdown or other inputs.
  // This preserves visibility metadata; running peripherals/services is separate.
  spec('ev3_distance_visible','ev3_getDistance','stage','ev3_getDistance',{},'ev3'),
  spec('ev3_brightness_visible','ev3_getBrightness','stage','ev3_getBrightness',{},'ev3'),
  spec('wedo2_distance_visible','wedo2_getDistance','stage','wedo2_getDistance',{},'wedo2'),
  spec('force_visible','gdxfor_getForce','stage','gdxfor_getForce',{},'gdxfor'),
  spec('speech_visible','speech2text_getSpeech','stage','speech2text_getSpeech',{},'speech2text'),
  spec('viewer_language_visible','translate_getViewerLanguage','stage','translate_getViewerLanguage',{},'translate'),
  spec('x_position_visible','motion_xposition','sprite','xposition'),
  spec('y_position_visible','motion_yposition','sprite','yposition'),
  spec('direction_visible','motion_direction','sprite','direction'),
  spec('size_visible','looks_size','sprite','size'),
  spec('costume_number_visible','looks_costumenumbername','sprite','costumenumbername_number',{NUMBER_NAME:'number'}),
  spec('costume_name_visible','looks_costumenumbername','sprite','costumenumbername_name',{NUMBER_NAME:'name'}),
  spec('volume_visible','sound_volume','both','volume'),
];
export function reporterMonitorForKey(key:string, isStage:boolean): ReporterMonitorSpec | undefined {
  return REPORTER_MONITORS.find(m=>m.key===key && (m.scope==='both' || (isStage ? m.scope==='stage' : m.scope==='sprite')));
}
export function reporterMonitorForData(opcode:string, params:Record<string,string>):ReporterMonitorSpec|undefined {
  return REPORTER_MONITORS.find(m=>m.opcode===opcode && Object.keys(m.params).length===Object.keys(params).length && Object.entries(m.params).every(([k,v])=>params[k]===v));
}
