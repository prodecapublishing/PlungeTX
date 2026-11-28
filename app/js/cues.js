/** Clip ids for every spoken line. Dynamic lines are pre-split in the audio pack. */

export const C = {
  preview: 'preview_breathe',
  welcome: 'welcome_plungetx',
  breathIntro: 'breath_intro',
  breathBegin: 'breath_begin',
  belly: 'belly_chest',
  halfway: 'halfway',
  fiveMore: 'five_more',
  lastOne: 'last_one',
  letGoHold: 'let_go_hold',
  breatheInHold: 'breathe_in_hold',
  letGo: 'let_go',
  finalRound: 'final_round_notice',
  holdRelax: 'hold_relax',
  thirtySeconds: 'thirty_seconds',
  holdStaySoft: 'hold_stay_soft',
  oneMinute: 'one_minute',
  holdBeStill: 'hold_be_still',
  oneMinuteThirty: 'one_minute_thirty',
  holdCalmQuiet: 'hold_calm_quiet',
  twoMinutes: 'two_minutes',
  threeTwoOne: 'three_two_one',
  prep: 'prep_breathe',
  breatheIn: 'breathe_in',
  andOut: 'and_out_slowly',
  relaxJaw: 'relax_jaw',
  oneMinuteLeftSteady: 'one_minute_left_steady',
  thirtyHeadToTub: 'thirty_seconds_head_to_tub',
  tenSeconds: 'ten_seconds',
  stepIn: 'step_in_slowly',
  timerStarted: 'timer_started',
  clockRunning: 'clock_running',
  oneMinuteIn: 'one_minute_in',
  halfwayThere: 'halfway_there',
  thirtyLeft: 'thirty_seconds_left',
  shouldersDrop: 'let_shoulders_drop',
  timeStepOut: 'time_step_out',
  timeYouDid: 'time_you_did',
  thirtyAdded: 'thirty_seconds_added',
  welcomeHeat: 'welcome_to_heat',
  intoHeatHard: 'into_the_heat_hard',
  breathFourSix: 'breath_four_six',
  halfwayCheck: 'halfway_check_in',
  halfwayCheckStep: 'halfway_check_in_step_out',
  oneMinuteLeftHeat: 'one_minute_left_heat',
  timeSitUp: 'time_sit_up',
  timeYouEarned: 'time_you_earned',
  intoHeatSettle: 'into_heat_settle',
  backIntoHeat: 'back_into_heat',
  intoHeatOwn: 'into_heat_own_it',
  intoTheCold: 'into_the_cold',
  getIn: 'get_in_no_hesitating',
  switchPlungeCalm: 'switch_to_plunge_calm',
  switchPlungeHard: 'switch_to_plunge_hard',
  outOfCold: 'out_of_cold',
  oneMinuteLeftInHeat: 'one_minute_left_in_heat',
  tenGetReady: 'ten_seconds_get_ready',
  shouldersDown: 'shoulders_down',
  contrastEndCold: 'contrast_end_cold_calm',
  contrastEndHeat: 'contrast_end_heat_calm',
  contrastEndHard: 'contrast_end_hard',
  newAward: 'new_award'
};

export const CALM = Array.from({ length: 8 }, (_, i) => `calm_${i}`);
export const HARD_COLD = Array.from({ length: 8 }, (_, i) => `hard_cold_${i}`);
export const SCAN = Array.from({ length: 10 }, (_, i) => `scan_${i}`);
export const HARD_HEAT = Array.from({ length: 8 }, (_, i) => `hard_heat_${i}`);

export const AWARD_IDS = [
  'first_plunge', 'first_sauna', 'first_breath', 'contrast', 'contrast10', 'cx_session', 'cx3',
  'hard', 'streak3', 'streak7', 'streak30', 'plunge10', 'plunge50', 'polar', 'ice40', 'cold60',
  'sauna10', 'sauna50', 'hot190', 'long20', 'hold2', 'hold3', 'early'
];

const HOLD_AT = {
  8: C.holdRelax,
  30: C.thirtySeconds,
  45: C.holdStaySoft,
  60: C.oneMinute,
  75: C.holdBeStill,
  90: C.oneMinuteThirty,
  105: C.holdCalmQuiet,
  120: C.twoMinutes
};

export function breathIntro(rounds, breaths) {
  return [C.breathIntro, `well_do_r${rounds}_b${breaths}`, C.breathBegin];
}

export function letGoRound(n) {
  return [`let_go_round_${n}`];
}

/** Spoken hold marks. Past 12:00 the pack has no clip, so the timer stays quiet. */
export function holdCue(sec) {
  if (HOLD_AT[sec]) return [HOLD_AT[sec]];
  if (sec > 120 && sec <= 720 && sec % 30 === 0) {
    const m = Math.floor(sec / 60);
    return [sec % 60 ? `minutes_${m}_thirty` : `minutes_${m}`];
  }
  return null;
}

export function minutesIn(k, tail) {
  const id = k === 1 ? C.oneMinuteIn : `minutes_in_${k}`;
  return tail ? [id, tail] : [id];
}

export function roundOf(n, total) {
  return `round_${n}_of_${total}`;
}

export function awardClips(ids) {
  return [C.newAward, ...ids.map((id) => `award_${id}`)];
}

export function coachLine(hard, calmId, hardId) {
  return hard ? hardId : calmId;
}

/** Every id the app can request, for the offline check and the clip test. */
export function catalog() {
  const ids = new Set(Object.values(C));
  CALM.forEach((id) => ids.add(id));
  HARD_COLD.forEach((id) => ids.add(id));
  SCAN.forEach((id) => ids.add(id));
  HARD_HEAT.forEach((id) => ids.add(id));
  AWARD_IDS.forEach((id) => ids.add(`award_${id}`));
  for (let r = 1; r <= 6; r++) {
    for (let b = 20; b <= 50; b += 5) ids.add(`well_do_r${r}_b${b}`);
    for (let n = 1; n <= r; n++) ids.add(roundOf(n, r));
  }
  for (let n = 2; n <= 6; n++) ids.add(`let_go_round_${n}`);
  for (let sec = 150; sec <= 720; sec += 30) holdCue(sec).forEach((id) => ids.add(id));
  for (let k = 2; k <= 30; k++) ids.add(`minutes_in_${k}`);
  return ids;
}
