import type { FocusItem, ReportDraft, ReportNote, WeeklyReport, Wording } from "@blunderstruck/contracts";
import { HttpError } from "./http";
import { pickModel } from "./models";
import { buildPrompt, WORDING_SCHEMA } from "./prompt";
import { type CoachProvider, ProviderResponseError } from "./provider";
import { templateWording } from "./templates";
import { parseWording, type WordingText } from "./validate";

/** Model calls allowed for one period: the plan, one repair and one reword. */
const MAX_CALLS = 3;

type ItemText = WordingText["focus"][number];

export interface WriteOptions {
  /** Told why model wording was not used: the provider's (already redacted) error or the validation failure. */
  onModelError?: (message: string) => void;
}

interface Attempt {
  text?: WordingText;
  calls: number;
}

/** The weekly-plan route with the provider's own model id. */
function choiceFor(provider: CoachProvider) {
  return pickModel("weekly-plan", provider.name, { BLUNDERSTRUCK_MODEL_WEEKLY_PLAN: provider.model });
}

/** A provider failure that means "fall back to templates". Anything else is a bug and propagates. */
function isProviderFailure(e: unknown): e is Error {
  return e instanceof HttpError || e instanceof ProviderResponseError;
}

/**
 * Ask the model for wording. A provider error ends the attempt; an answer that fails the
 * checks gets one repair call (when `repair` and the budget allow) with the errors attached.
 */
async function ask(
  provider: CoachProvider,
  draft: ReportDraft,
  only: string[] | undefined,
  budget: number,
  repair: boolean,
  onError: (message: string) => void,
): Promise<Attempt> {
  if (budget < 1) return { calls: 0 };
  const { system, user } = buildPrompt(draft, only);
  const choice = choiceFor(provider);
  let calls = 0;

  const call = async (userText: string): Promise<string | undefined> => {
    calls++;
    try {
      return (await provider.complete({ system, user: userText, schema: WORDING_SCHEMA, choice })).text;
    } catch (e) {
      if (!isProviderFailure(e)) throw e;
      onError(e.message);
      return undefined;
    }
  };

  const answer = await call(user);
  if (answer === undefined) return { calls };
  const first = parseWording(answer, draft, only);
  if (first.ok) return { text: first.value, calls };
  if (!repair || budget < 2) {
    onError(`the reply failed validation: ${first.errors[0]}`);
    return { calls };
  }

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
  const second = await call(repairUser);
  if (second === undefined) return { calls };
  const parsed = parseWording(second, draft, only);
  if (parsed.ok) return { text: parsed.value, calls };
  onError(`the reply failed validation twice: ${parsed.errors[0]}`);
  return { calls };
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
    return { ...choice, title: t.title, why: t.why, drill: t.drill, steps: [] };
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
 *
 * Summary rule for a later revision: a model summary is kept only when the focus set is
 * exactly the same, since it may name or count the items. When items were only dropped, the
 * kept items keep their text, no call is made and the summary comes from the template. When
 * new items appear, one reword call writes them and the summary.
 */
export async function writeReport(
  draft: ReportDraft,
  provider?: CoachProvider,
  previous?: WeeklyReport,
  opts: WriteOptions = {},
): Promise<WeeklyReport> {
  const onError = opts.onModelError ?? (() => {});
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
    const got = await ask(provider!, draft, undefined, MAX_CALLS, true, onError);
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
  const added = ids.filter((id) => !prevText.has(id));
  const sameSet = added.length === 0 && ids.length === previous.focus.length;

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

  if (added.length === 0) {
    const keepSummary = sameSet && previous.wording.source === "model";
    const summary = keepSummary ? previous.summary : template.summary;
    const source = wordedFor.length > 0 || keepSummary ? "model" : "template";
    return assemble(
      draft,
      summary,
      texts,
      { source, ...(source === "model" ? prevMeta : {}), wordedFor, calls: priorCalls },
      notes,
    );
  }

  // New items: one reword call for them and the summary.
  const got = needsModel ? await ask(provider!, draft, added, MAX_CALLS - priorCalls, false, onError) : { calls: 0 };
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
