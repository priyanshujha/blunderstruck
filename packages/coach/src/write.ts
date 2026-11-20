import type { FocusItem, ReportDraft, ReportNote, WeeklyReport, Wording } from "@blunderstruck/contracts";
import { pickModel } from "./models";
import { buildPrompt, WORDING_SCHEMA } from "./prompt";
import type { CoachProvider } from "./provider";
import { templateWording } from "./templates";
import { parseWording, type WordingText } from "./validate";

/** Model calls allowed for one period: the plan, one repair and one reword. */
const MAX_CALLS = 3;

type ItemText = WordingText["focus"][number];

interface Attempt {
  text?: WordingText;
  calls: number;
}

/** The weekly-plan route with the provider's own model id. */
function choiceFor(provider: CoachProvider) {
  return pickModel("weekly-plan", provider.name, { BLUNDERSTRUCK_MODEL_WEEKLY_PLAN: provider.model });
}

/**
 * Ask the model for wording. A transport error ends the attempt; an answer that fails the
 * checks gets one repair call (when `repair` and the budget allow) with the errors attached.
 */
async function ask(
  provider: CoachProvider,
  draft: ReportDraft,
  only: string[] | undefined,
  budget: number,
  repair: boolean,
): Promise<Attempt> {
  if (budget < 1) return { calls: 0 };
  const { system, user } = buildPrompt(draft, only);
  const choice = choiceFor(provider);
  let calls = 0;
  let answer: string;
  try {
    calls++;
    answer = (await provider.complete({ system, user, schema: WORDING_SCHEMA, choice })).text;
  } catch {
    return { calls };
  }
  const first = parseWording(answer, draft, only);
  if (first.ok) return { text: first.value, calls };
  if (!repair || budget < 2) return { calls };

  const repairUser = [
    user,
    "",
    "Your previous answer was:",
    answer,
    "",
    "It failed these checks:",
    ...first.errors.map((e) => `- ${e}`),
    "",
    "Answer again with the whole corrected JSON object only.",
  ].join("\n");
  try {
    calls++;
    const second = (await provider.complete({ system, user: repairUser, schema: WORDING_SCHEMA, choice })).text;
    const parsed = parseWording(second, draft, only);
    return parsed.ok ? { text: parsed.value, calls } : { calls };
  } catch {
    return { calls };
  }
}

function addNote(notes: readonly ReportNote[], note: ReportNote): ReportNote[] {
  return notes.includes(note) ? [...notes] : [...notes, note];
}

function assemble(
  draft: ReportDraft,
  summary: string,
  texts: ReadonlyMap<string, ItemText>,
  wording: Wording,
  notes: ReportNote[],
): WeeklyReport {
  const focus: FocusItem[] = draft.focus.map((choice) => {
    const t = texts.get(choice.patternId)!;
    return { ...choice, title: t.title, why: t.why, drill: t.drill };
  });
  return { ...draft, focus, summary, wording, notes };
}

const byId = (focus: readonly ItemText[]) => new Map(focus.map((f) => [f.patternId, f]));

/**
 * Turn a draft into a report: one model call, one repair call, then template wording. With
 * `previous`, wording for unchanged patterns is kept and only new ones are worded.
 *
 * `previous` is an earlier revision of the same period: its call count carries over, so the
 * period never goes past three calls. A draft with no focus items, or flagged "few-games",
 * gets template wording and no call.
 */
export async function writeReport(
  draft: ReportDraft,
  provider?: CoachProvider,
  previous?: WeeklyReport,
): Promise<WeeklyReport> {
  const template = templateWording(draft);
  const templateTexts = byId(template.focus);
  let notes = [...draft.notes];
  if (!provider) notes = addNote(notes, "no-key");
  const priorCalls = previous?.wording.calls ?? 0;
  const modelMeta = provider ? { provider: provider.name, model: provider.model } : {};

  const needsModel = provider !== undefined && draft.focus.length > 0 && !draft.notes.includes("few-games");

  if (!previous) {
    if (!needsModel) {
      return assemble(draft, template.summary, templateTexts, { source: "template", wordedFor: [], calls: 0 }, notes);
    }
    const got = await ask(provider!, draft, undefined, MAX_CALLS, true);
    if (!got.text) {
      return assemble(
        draft,
        template.summary,
        templateTexts,
        { source: "template", wordedFor: [], calls: got.calls },
        addNote(notes, "model-failed"),
      );
    }
    return assemble(
      draft,
      got.text.summary,
      byId(got.text.focus),
      { source: "model", ...modelMeta, wordedFor: draft.focus.map((f) => f.patternId), calls: got.calls },
      notes,
    );
  }

  // An earlier revision of this period: keep what it already says for patterns still on the list.
  const prevText = byId(previous.focus);
  const prevModelIds = new Set(previous.wording.source === "model" ? previous.wording.wordedFor : []);
  const ids = draft.focus.map((f) => f.patternId);
  const prevIds = previous.focus.map((f) => f.patternId);
  const changed = ids.filter((id) => !prevText.has(id));
  const sameSet = changed.length === 0 && ids.length === prevIds.length;

  const texts = new Map<string, ItemText>();
  const wordedFor: string[] = [];
  for (const id of ids) {
    if (prevModelIds.has(id)) {
      texts.set(id, prevText.get(id)!);
      wordedFor.push(id);
    } else {
      // Template text is rebuilt, so it follows this draft's band and reasons.
      texts.set(id, templateTexts.get(id)!);
    }
  }
  const prevMeta = previous.wording.provider
    ? { provider: previous.wording.provider, ...(previous.wording.model ? { model: previous.wording.model } : {}) }
    : {};

  if (sameSet) {
    const summary = previous.wording.source === "model" ? previous.summary : template.summary;
    const source = wordedFor.length > 0 || previous.wording.source === "model" ? "model" : "template";
    return assemble(
      draft,
      summary,
      texts,
      { source, ...(source === "model" ? prevMeta : {}), wordedFor, calls: priorCalls },
      notes,
    );
  }

  // The focus set changed: one reword call for the new items and the summary.
  const got = needsModel ? await ask(provider!, draft, changed, MAX_CALLS - priorCalls, false) : { calls: 0 };
  const calls = priorCalls + got.calls;
  if (got.text) {
    for (const f of got.text.focus) {
      texts.set(f.patternId, f);
      wordedFor.push(f.patternId);
    }
    const ordered = ids.filter((id) => wordedFor.includes(id));
    return assemble(draft, got.text.summary, texts, { source: "model", ...modelMeta, wordedFor: ordered, calls }, notes);
  }
  if (got.calls > 0) notes = addNote(notes, "model-failed");
  const source = wordedFor.length > 0 ? "model" : "template";
  return assemble(
    draft,
    template.summary,
    texts,
    { source, ...(source === "model" ? prevMeta : {}), wordedFor, calls },
    notes,
  );
}
