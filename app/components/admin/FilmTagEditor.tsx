"use client";

import { useState, useTransition } from "react";
import { setFilmTags } from "@/lib/actions/admin/film-tags";
import type { TagsByFacet, TagOption } from "@/lib/queries/film-tags";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type ModFacet = "subject" | "tone" | "theme" | "setting" | "content";
type FacetWithCap = {
  key: ModFacet;
  label: string;
  capLabel: string;
  min: number;
  max: number | null;
};

const MOD_FACETS: FacetWithCap[] = [
  { key: "subject", label: "Subjects",  capLabel: "0–3",  min: 0, max: 3 },
  { key: "tone",    label: "Tones",     capLabel: "1–3",  min: 1, max: 3 },
  { key: "theme",   label: "Themes",    capLabel: "0–3",  min: 0, max: 3 },
  { key: "setting", label: "Settings",  capLabel: "0–2",  min: 0, max: 2 },
  { key: "content", label: "Content",   capLabel: "any",  min: 0, max: null },
];

interface InitialState {
  primarySubgenreId: string | null;
  secondarySubgenreIds: string[];
  subjectIds: string[];
  toneIds: string[];
  themeIds: string[];
  settingIds: string[];
  contentIds: string[];
  orderedTagIds: string[];
}

interface Props {
  filmId: string;
  director: string;
  vocab: TagsByFacet;
  initial: InitialState;
}

interface OrderedRow {
  id: string;             // tag id, or "__director__" for the virtual director slot
  label: string;
  facet: string;          // "subgenre" / "subject" / etc., or "director"
  isPrimary: boolean;     // true only for the Primary subgenre tag
  isVirtual: boolean;     // director row — non-draggable
  isPrimaryRow: boolean;  // primary subgenre — non-draggable, locked at slot 1
}

function SortableRowItem({ row }: { row: OrderedRow }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id, disabled: row.isVirtual || row.isPrimaryRow,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const meta = row.isVirtual
    ? "director · auto"
    : row.isPrimaryRow
      ? "subgenre · Primary"
      : row.facet === "subgenre"
        ? "subgenre · Secondary"
        : row.facet;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`tag-order-row ${row.isVirtual ? "is-virtual" : ""} ${row.isPrimaryRow ? "is-locked" : ""}`}
      {...attributes}
    >
      <span
        className="tag-order-handle"
        {...(row.isVirtual || row.isPrimaryRow ? {} : listeners)}
      >
        {row.isVirtual || row.isPrimaryRow ? "—" : "☰"}
      </span>
      <span className="tag-order-label">{row.label}</span>
      <span className="tag-order-meta">{meta}</span>
    </div>
  );
}

export default function FilmTagEditor({ filmId, director, vocab, initial }: Props) {
  const [primary, setPrimary] = useState<string | null>(initial.primarySubgenreId);
  const [secondaries, setSecondaries] = useState<string[]>(initial.secondarySubgenreIds);
  const [subjects, setSubjects] = useState<string[]>(initial.subjectIds);
  const [tones, setTones] = useState<string[]>(initial.toneIds);
  const [themes, setThemes] = useState<string[]>(initial.themeIds);
  const [settings, setSettings] = useState<string[]>(initial.settingIds);
  const [contents, setContents] = useState<string[]>(initial.contentIds);
  const [ordered, setOrdered] = useState<string[]>(initial.orderedTagIds);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function lookupTag(id: string): { facet: string; name: string } | null {
    const facets: (keyof TagsByFacet)[] = ["subgenre", "subject", "tone", "theme", "setting", "content"];
    for (const f of facets) {
      const found = vocab[f].find(o => o.id === id);
      if (found) return { facet: f, name: found.name };
    }
    return null;
  }

  const orderedRows: OrderedRow[] = (() => {
    const rows: OrderedRow[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const tagId = ordered[i];
      const t = lookupTag(tagId);
      if (!t) continue;
      rows.push({
        id: tagId,
        label: t.name,
        facet: t.facet,
        isPrimary: tagId === primary,
        isVirtual: false,
        isPrimaryRow: tagId === primary,
      });
      // Insert virtual director row right after the Primary subgenre (i=0 case).
      if (i === 0) {
        rows.push({
          id: "__director__",
          label: director || "(no director set)",
          facet: "director",
          isPrimary: false,
          isVirtual: true,
          isPrimaryRow: false,
        });
      }
    }
    return rows;
  })();

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    if (active.id === "__director__" || over.id === "__director__") return;
    if (primary && (active.id === primary || over.id === primary)) return;
    const oldIdx = ordered.indexOf(String(active.id));
    const newIdx = ordered.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    setOrdered(prev => arrayMove(prev, oldIdx, newIdx));
  }

  // Sync ordered when picker selection changes:
  // - filter out ids that aren't picked anymore
  // - append newly-picked ids to the tail
  // - keep primary anchored at index 0
  function reconcileOrdered(allPicked: string[], primaryId: string | null) {
    setOrdered(prev => {
      const presentSet = new Set(allPicked);
      const surviving = prev.filter(id => presentSet.has(id) && id !== primaryId);
      const known = new Set([...(primaryId ? [primaryId] : []), ...surviving]);
      const newcomers = allPicked.filter(id => id !== primaryId && !known.has(id));
      const head = primaryId ? [primaryId] : [];
      return [...head, ...surviving, ...newcomers];
    });
  }

  function pickedAfter(
    next: { primary?: string | null; secondaries?: string[]; subjects?: string[]; tones?: string[]; themes?: string[]; settings?: string[]; contents?: string[] },
  ): string[] {
    const p = next.primary !== undefined ? next.primary : primary;
    const s = next.secondaries ?? secondaries;
    const sub = next.subjects ?? subjects;
    const t = next.tones ?? tones;
    const th = next.themes ?? themes;
    const set = next.settings ?? settings;
    const c = next.contents ?? contents;
    return [...(p ? [p] : []), ...s, ...sub, ...t, ...th, ...set, ...c];
  }

  function handlePrimaryToggle(id: string) {
    const next = primary === id ? null : id;
    setPrimary(next);
    reconcileOrdered(pickedAfter({ primary: next }), next);
  }

  function handleMultiToggle(
    id: string,
    list: string[],
    setter: (xs: string[]) => void,
    cap: number | null,
    facetKey: ModFacet | "secondary",
  ) {
    const isSelected = list.includes(id);
    let nextList: string[];
    if (isSelected) {
      nextList = list.filter(x => x !== id);
    } else {
      if (cap !== null && list.length >= cap) return;
      nextList = [...list, id];
    }
    setter(nextList);
    const overrides: Parameters<typeof pickedAfter>[0] = {};
    if (facetKey === "secondary") overrides.secondaries = nextList;
    else if (facetKey === "subject") overrides.subjects = nextList;
    else if (facetKey === "tone") overrides.tones = nextList;
    else if (facetKey === "theme") overrides.themes = nextList;
    else if (facetKey === "setting") overrides.settings = nextList;
    else if (facetKey === "content") overrides.contents = nextList;
    reconcileOrdered(pickedAfter(overrides), primary);
  }

  // Save-blocker hint surfaces the most pressing validation issue.
  let saveBlocker: string | null = null;
  if (!primary) saveBlocker = "Pick a Primary sub-genre.";
  else if (tones.length < 1) saveBlocker = "Pick at least one tone.";
  else if (secondaries.some(id => ordered.indexOf(id) < 4)) {
    saveBlocker = "Drag Secondary sub-genres into the hidden tail (slot 6+).";
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const r = await setFilmTags({
        filmId,
        primarySubgenreId: primary ?? "",
        secondarySubgenreIds: secondaries,
        subjectIds: subjects,
        toneIds: tones,
        themeIds: themes,
        settingIds: settings,
        contentIds: contents,
        orderedTagIds: ordered,
      });
      if (r.ok) setMsg("Saved.");
      else setMsg(r.error);
    });
  }

  function ChipRow(props: {
    options: TagOption[];
    selected: string[];
    cap: number | null;
    onToggle: (id: string) => void;
  }) {
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {props.options.map(opt => {
          const sel = props.selected.includes(opt.id);
          const atCap = !sel && props.cap !== null && props.selected.length >= props.cap;
          return (
            <button
              type="button"
              key={opt.id}
              className={`tag-edit-pill ${sel ? "is-selected" : ""} ${atCap ? "is-disabled" : ""}`}
              disabled={atCap}
              onClick={() => props.onToggle(opt.id)}
            >
              {opt.name}
            </button>
          );
        })}
      </div>
    );
  }

  function PrimaryChipRow() {
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {vocab.subgenre.map(opt => {
          const sel = primary === opt.id;
          return (
            <button
              type="button"
              key={opt.id}
              className={`tag-edit-pill ${sel ? "is-selected primary" : ""}`}
              onClick={() => handlePrimaryToggle(opt.id)}
            >
              {opt.name}
            </button>
          );
        })}
      </div>
    );
  }

  function modSelected(key: ModFacet): string[] {
    return key === "subject" ? subjects
      : key === "tone" ? tones
      : key === "theme" ? themes
      : key === "setting" ? settings
      : contents;
  }
  function modSetter(key: ModFacet): (xs: string[]) => void {
    return key === "subject" ? setSubjects
      : key === "tone" ? setTones
      : key === "theme" ? setThemes
      : key === "setting" ? setSettings
      : setContents;
  }

  return (
    <div className="film-tag-editor" style={{ marginTop: 24 }}>
      <h3 className="head" style={{ fontSize: 22, marginBottom: 12 }}>Tags</h3>

      <div className="eyebrow" style={{ fontSize: 11, marginBottom: 18, color: "var(--muted)" }}>Pick</div>

      <div style={{ marginBottom: 16 }}>
        <div className="caps" style={{ fontSize: 10, marginBottom: 6 }}>
          Primary sub-genre <span style={{ color: "var(--muted)" }}>(required, 1)</span>
        </div>
        <PrimaryChipRow />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div className="caps" style={{ fontSize: 10, marginBottom: 6 }}>
          Secondary sub-genres <span style={{ color: "var(--muted)" }}>(0–2)</span> · {secondaries.length} picked
        </div>
        <ChipRow
          options={vocab.subgenre.filter(o => o.id !== primary)}
          selected={secondaries}
          cap={2}
          onToggle={(id) => handleMultiToggle(id, secondaries, setSecondaries, 2, "secondary")}
        />
      </div>

      {MOD_FACETS.map(facet => (
        <div key={facet.key} style={{ marginBottom: 16 }}>
          <div className="caps" style={{ fontSize: 10, marginBottom: 6 }}>
            {facet.label} <span style={{ color: "var(--muted)" }}>({facet.capLabel})</span> · {modSelected(facet.key).length} picked
          </div>
          <ChipRow
            options={vocab[facet.key]}
            selected={modSelected(facet.key)}
            cap={facet.max}
            onToggle={(id) => handleMultiToggle(id, modSelected(facet.key), modSetter(facet.key), facet.max, facet.key)}
          />
        </div>
      ))}

      <div className="eyebrow" style={{ fontSize: 11, marginTop: 24, marginBottom: 8, color: "var(--muted)" }}>Order</div>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 12px" }}>
        Drag to reorder. Slots above the line show on the film page; slots below feed the recommender silently.
      </p>
      {orderedRows.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.6, fontStyle: "italic" }}>
          Pick a Primary sub-genre + at least one tone to populate this list.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={orderedRows.map(r => r.id)} strategy={verticalListSortingStrategy}>
            <div className="tag-order-list">
              {orderedRows.map((row, idx) => (
                <div key={row.id}>
                  <SortableRowItem row={row} />
                  {idx === 4 && (
                    <div className="tag-order-divider">
                      <span>visible above · hidden below</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div style={{ marginTop: 24, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn"
          disabled={pending || !!saveBlocker}
          onClick={onSave}
        >
          {pending ? "Saving…" : "Save tags"}
        </button>
        {saveBlocker && <span style={{ fontSize: 12, color: "var(--muted)" }}>{saveBlocker}</span>}
        {msg && (
          <span style={{ fontSize: 12, color: msg === "Saved." ? "var(--accent)" : "var(--blood)" }}>
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
