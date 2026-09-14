/**
 * swapValidator.js — Client-side timetable swap validator
 *
 * Mirrors the hard constraints from the Python CP-SAT solver:
 *   C2  Teacher no-double-booking     (teacher at same day:period → BLOCK)
 *   C3  Section no-double-booking     (section at same day:period → BLOCK)
 *   C4  Lab-room no-double-booking    (lab room at same day:period → BLOCK)
 *   C5  Teacher unavailability        (teacher in unavail slot   → BLOCK)
 *   C6  Weekly cap                    (swap preserves counts → always OK)
 *   Lab block consecutiveness         (partial lab-block moves   → BLOCK)
 *   Home-room fixation                (non-lab moved to wrong room → BLOCK)
 *   Lab category match                (lab in wrong lab_type room → BLOCK)
 *
 * Soft objective checks (O1 / O2):
 *   O1  Even weekly spread            (excess on a day increases → WARN)
 *   O2  Teacher preference            (lands on avoid / leaves preferred → WARN)
 *
 * Public API
 * ──────────
 *   validateSwap(slotA, slotB, targetCell, allSlots, meta) → { ok, violations, warnings }
 *   applySwap(slotA, slotB, targetCell, allSlots, subjectMap) → Slot[]
 *   findLabBlock(slot, allSlots)                              → Slot[]
 */

function slotsEqual(a, b) {
  return (
    a.day_of_week   === b.day_of_week &&
    a.period_index  === b.period_index &&
    a.section_id    === b.section_id  &&
    a.subject_id    === b.subject_id  &&
    a.teacher_id    === b.teacher_id  &&
    a.room_id       === b.room_id
  )
}

export function findLabBlock(slot, allSlots) {
  const candidates = allSlots.filter(
    s =>
      s.section_id  === slot.section_id  &&
      s.subject_id  === slot.subject_id  &&
      s.teacher_id  === slot.teacher_id  &&
      s.room_id     === slot.room_id     &&
      s.day_of_week === slot.day_of_week
  )
  candidates.sort((a, b) => a.period_index - b.period_index)

  const idx = candidates.findIndex(s => s.period_index === slot.period_index)
  if (idx < 0) return [slot]

  let start = idx
  while (start > 0 && candidates[start - 1].period_index === candidates[start].period_index - 1) {
    start--
  }
  let end = idx
  while (end < candidates.length - 1 && candidates[end + 1].period_index === candidates[end].period_index + 1) {
    end++
  }
  return candidates.slice(start, end + 1)
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function validateSwap(slotA, slotB, targetCell, allSlots, meta) {
  const violations = []
  const warnings   = []

  const {
    subjectMap        = {},
    teacherMap        = {},
    sectionMap        = {},
    roomMap           = {},
    teacherUnavailMap = {},
    teacherPrefsMap   = {},
    workingDays       = [0, 1, 2, 3, 4],
    periodsPerDay     = 8,
  } = meta

  const numDays = workingDays.length

  // Resolve lab block anchor for slotA (dragging any cell of a lab block uses the block anchor)
  const subjA      = subjectMap[slotA.subject_id] ?? {}
  const isLabA     = !!subjA.lab
  const blockA     = isLabA ? findLabBlock(slotA, allSlots) : [slotA]
  const anchorA    = blockA[0] ?? slotA
  const blockSizeA = isLabA ? (subjA.lab_consecutive_periods ?? blockA.length) : 1

  // Resolve lab block anchor for slotB (if target cell contains a slot)
  const subjB      = slotB ? (subjectMap[slotB.subject_id] ?? {}) : null
  const isLabB     = !!subjB?.lab
  const blockB     = (slotB && isLabB) ? findLabBlock(slotB, allSlots) : (slotB ? [slotB] : [])
  const anchorB    = blockB[0] ?? slotB
  const blockSizeB = isLabB ? (subjB.lab_consecutive_periods ?? blockB.length) : 1

  if (
    anchorA.day_of_week  === targetCell.day_of_week &&
    anchorA.period_index === targetCell.period_index
  ) {
    return { ok: true, violations: [], warnings: ['Dropped on same cell — no change.'] }
  }

  // ── Bounds check: lab block extending past max periods in a day ───────────
  if (targetCell.period_index + blockSizeA > periodsPerDay) {
    violations.push(
      `Cannot Swap: ${blockSizeA}-period lab block "${subjA.name ?? slotA.subject_id}" ` +
      `would extend past Period ${periodsPerDay} on target day.`
    )
  }

  if (slotB && anchorA.period_index + blockSizeB > periodsPerDay) {
    violations.push(
      `Cannot Swap: Swapped ${blockSizeB}-period lab block "${subjB.name ?? slotB.subject_id}" ` +
      `would extend past Period ${periodsPerDay} on original day.`
    )
  }

  // ── Consecutive free periods check for block A ────────────────────────────
  if (blockSizeA > 1) {
    const targetStart   = targetCell.period_index
    const targetPeriods = Array.from({ length: blockSizeA }, (_, i) => targetStart + i)
    const blockAKeys    = new Set(blockA.map(s => `${s.day_of_week}:${s.period_index}`))
    const blockBKeys    = new Set(blockB.map(s => `${s.day_of_week}:${s.period_index}`))

    const occupiedOnTargetDay = new Set(
      allSlots
        .filter(s => {
          const k = `${s.day_of_week}:${s.period_index}`
          return (
            s.day_of_week === targetCell.day_of_week &&
            !blockAKeys.has(k) &&
            !blockBKeys.has(k)
          )
        })
        .map(s => s.period_index)
    )

    const blocked = targetPeriods.filter(p => occupiedOnTargetDay.has(p))
    if (blocked.length > 0) {
      const dayLabel = DAY_LABELS[targetCell.day_of_week] ?? `Day ${targetCell.day_of_week + 1}`
      violations.push(
        `Cannot Swap: Not enough consecutive free slots on ${dayLabel} for ${blockSizeA}-period lab block ` +
        `"${subjA.name ?? slotA.subject_id}". Period(s) P${blocked.map(p => p + 1).join(', P')} are occupied.`
      )
    }
  }

  // ── Consecutive free periods check for block B ────────────────────────────
  if (slotB && blockSizeB > 1) {
    const targetStartB   = anchorA.period_index
    const targetPeriodsB = Array.from({ length: blockSizeB }, (_, i) => targetStartB + i)
    const blockAKeys     = new Set(blockA.map(s => `${s.day_of_week}:${s.period_index}`))
    const blockBKeys     = new Set(blockB.map(s => `${s.day_of_week}:${s.period_index}`))

    const occupiedOnOrigDay = new Set(
      allSlots
        .filter(s => {
          const k = `${s.day_of_week}:${s.period_index}`
          return (
            s.day_of_week === anchorA.day_of_week &&
            !blockAKeys.has(k) &&
            !blockBKeys.has(k)
          )
        })
        .map(s => s.period_index)
    )

    const blocked = targetPeriodsB.filter(p => occupiedOnOrigDay.has(p))
    if (blocked.length > 0) {
      const dayLabel = DAY_LABELS[anchorA.day_of_week] ?? `Day ${anchorA.day_of_week + 1}`
      violations.push(
        `Cannot Swap: Not enough consecutive free slots on ${dayLabel} for ${blockSizeB}-period lab block ` +
        `"${subjB.name ?? slotB.subject_id}". Period(s) P${blocked.map(p => p + 1).join(', P')} are occupied.`
      )
    }
  }

  if (violations.length > 0) return { ok: false, violations, warnings }

  function inBlockA(s) { return blockA.some(b => slotsEqual(b, s)) }
  function inBlockB(s) { return blockB.some(b => slotsEqual(b, s)) }

  const remaining = allSlots.filter(s => !inBlockA(s) && !inBlockB(s))

  const movedBlockA = blockA.map((s, i) => ({
    ...s,
    day_of_week:  targetCell.day_of_week,
    period_index: targetCell.period_index + i,
  }))

  const movedBlockB = slotB
    ? blockB.map((s, i) => ({
        ...s,
        day_of_week:  anchorA.day_of_week,
        period_index: anchorA.period_index + i,
      }))
    : []


  const proposed = [...remaining, ...movedBlockA, ...movedBlockB]

  // C2: Teacher no-double-booking
  {
    const seen = new Map()
    for (const s of proposed) {
      const k = `${s.teacher_id}:${s.day_of_week}:${s.period_index}`
      if (seen.has(k)) {
        const tName = teacherMap[s.teacher_id]?.name ?? s.teacher_id
        const dLabel = DAY_LABELS[s.day_of_week] ?? `Day ${s.day_of_week + 1}`
        violations.push(
          `Cannot Swap (Teacher Double-Booking): Teacher "${tName}" would be scheduled in two classes at ` +
          `the same time (${dLabel} P${s.period_index + 1}).`
        )
        break
      }
      seen.set(k, true)
    }
  }

  // C3: Section no-double-booking
  {
    const seen = new Map()
    for (const s of proposed) {
      const k = `${s.section_id}:${s.day_of_week}:${s.period_index}`
      if (seen.has(k)) {
        const secName = sectionMap[s.section_id]?.name ?? s.section_id
        const dLabel = DAY_LABELS[s.day_of_week] ?? `Day ${s.day_of_week + 1}`
        violations.push(
          `Cannot Swap (Class Double-Booking): Section "${secName}" would have two subjects at ` +
          `the same time (${dLabel} P${s.period_index + 1}).`
        )
        break
      }
      seen.set(k, true)
    }
  }

  // C4: Lab-room no-double-booking
  {
    const seen = new Map()
    for (const s of proposed) {
      const room = roomMap[s.room_id]
      if (!room || room.room_type !== 'lab') continue
      const k = `${s.room_id}:${s.day_of_week}:${s.period_index}`
      if (seen.has(k)) {
        const rName = room.code ?? room.name ?? s.room_id
        const dLabel = DAY_LABELS[s.day_of_week] ?? `Day ${s.day_of_week + 1}`
        violations.push(
          `Cannot Swap (Room Double-Booking): Lab Room "${rName}" would be occupied by two classes at ` +
          `the same time (${dLabel} P${s.period_index + 1}).`
        )
        break
      }
      seen.set(k, true)
    }
  }

  // C5: Teacher unavailability
  for (const movedSlot of [...movedBlockA, ...movedBlockB]) {
    const unavail = teacherUnavailMap[movedSlot.teacher_id] ?? []
    const blocked = unavail.some(
      u => u.day_of_week === movedSlot.day_of_week && u.period_index === movedSlot.period_index
    )
    if (blocked) {
      const tName    = teacherMap[movedSlot.teacher_id]?.name ?? movedSlot.teacher_id
      const subjName = subjectMap[movedSlot.subject_id]?.name ?? movedSlot.subject_id
      const dLabel   = DAY_LABELS[movedSlot.day_of_week] ?? `Day ${movedSlot.day_of_week + 1}`
      violations.push(
        `Cannot Swap (Teacher Unavailable): "${tName}" is marked unavailable on ` +
        `${dLabel} P${movedSlot.period_index + 1} (teaching "${subjName}").`
      )
    }
  }

  // Home-room fixation
  for (const movedSlot of [...movedBlockA, ...movedBlockB]) {
    const subj = subjectMap[movedSlot.subject_id] ?? {}
    if (subj.lab) continue
    const sec = sectionMap[movedSlot.section_id]
    if (!sec?.homeroom_id) continue
    if (movedSlot.room_id !== sec.homeroom_id) {
      const secName  = sec.name ?? movedSlot.section_id
      const homeName = roomMap[sec.homeroom_id]?.code ?? sec.homeroom_id
      const curName  = roomMap[movedSlot.room_id]?.code ?? movedSlot.room_id
      violations.push(
        `Home-room conflict: Section "${secName}" must hold non-lab classes in ` +
        `room "${homeName}", but this swap would put it in "${curName}".`
      )
    }
  }

  // Lab category match
  for (const movedSlot of [...movedBlockA, ...movedBlockB]) {
    const subj = subjectMap[movedSlot.subject_id] ?? {}
    if (!subj.lab) continue
    const room = roomMap[movedSlot.room_id] ?? {}
    if (room.room_type !== 'lab') {
      violations.push(
        `Room type mismatch: "${subj.name ?? movedSlot.subject_id}" is a lab subject ` +
        `but room "${room.code ?? movedSlot.room_id}" is not a lab room.`
      )
      continue
    }
    if (subj.required_lab_type && room.lab_type && subj.required_lab_type !== room.lab_type) {
      violations.push(
        `Lab category mismatch: "${subj.name ?? movedSlot.subject_id}" requires a ` +
        `"${subj.required_lab_type}" lab, but room "${room.code ?? movedSlot.room_id}" ` +
        `is a "${room.lab_type}" lab.`
      )
    }
  }

  if (violations.length > 0) return { ok: false, violations, warnings }

  // O1: Even weekly spread
  function computeSpreadViolations(slots) {
    const counts = new Map()
    for (const s of slots) {
      const k = `${s.section_id}:${s.subject_id}`
      if (!counts.has(k)) counts.set(k, new Map())
      const dayMap = counts.get(k)
      dayMap.set(s.day_of_week, (dayMap.get(s.day_of_week) ?? 0) + 1)
    }
    return counts
  }

  function maxDayCount(counts, sectionId, subjectId) {
    const dayMap = counts.get(`${sectionId}:${subjectId}`)
    if (!dayMap) return 0
    return Math.max(...dayMap.values())
  }

  const beforeCounts = computeSpreadViolations(allSlots)
  const afterCounts  = computeSpreadViolations(proposed)

  const affectedPairs = new Set([
    ...blockA.map(s => `${s.section_id}:${s.subject_id}`),
    ...blockB.map(s => `${s.section_id}:${s.subject_id}`),
  ])

  for (const pair of affectedPairs) {
    const [sectionId, subjectId] = pair.split(':')
    const subj      = subjectMap[subjectId] ?? {}
    const isLab     = !!subj.lab
    const weekly    = isLab ? (subj.weekly_lab_sessions ?? 1) : (subj.weekly_periods ?? 3)
    const fairShare = Math.ceil(weekly / numDays)

    const before = maxDayCount(beforeCounts, sectionId, subjectId)
    const after  = maxDayCount(afterCounts,  sectionId, subjectId)

    if (after > fairShare && after > before) {
      const secName  = sectionMap[sectionId]?.name  ?? sectionId
      const subjName = subjectMap[subjectId]?.name ?? subjectId
      warnings.push(
        `Spread warning: "${subjName}" for section "${secName}" will have ` +
        `${after} session(s) on one day (ideal ≤ ${fairShare}). ` +
        `This worsens the even-spread objective.`
      )
    }
  }

  // O2: Teacher preference
  for (const s of [...movedBlockA, ...movedBlockB]) {
    const prefs = teacherPrefsMap[s.teacher_id] ?? []
    const pref  = prefs.find(p => p.subject_id === s.subject_id)
    if (!pref) continue
    const tName = teacherMap[s.teacher_id]?.name ?? s.teacher_id
    const sName = subjectMap[s.subject_id]?.name ?? s.subject_id
    if (pref.preference_type === 'avoid') {
      warnings.push(
        `Preference warning: "${tName}" prefers to avoid "${sName}". ` +
        `This worsens the teacher-preference objective.`
      )
    }
  }

  return { ok: violations.length === 0, violations, warnings }
}

export function applySwap(slotA, slotB, targetCell, allSlots, subjectMap) {
  const subjA   = subjectMap[slotA.subject_id] ?? {}
  const isLabA  = !!subjA.lab
  const blockA  = isLabA ? findLabBlock(slotA, allSlots) : [slotA]
  const anchorA = blockA[0] ?? slotA

  const subjB   = slotB ? (subjectMap[slotB.subject_id] ?? {}) : null
  const isLabB  = !!subjB?.lab
  const blockB  = (slotB && isLabB) ? findLabBlock(slotB, allSlots) : (slotB ? [slotB] : [])

  function inBlockA(s) { return blockA.some(b => slotsEqual(b, s)) }
  function inBlockB(s) { return blockB.some(b => slotsEqual(b, s)) }

  const remaining = allSlots.filter(s => !inBlockA(s) && !inBlockB(s))

  const movedBlockA = blockA.map((s, i) => ({
    ...s,
    day_of_week:  targetCell.day_of_week,
    period_index: targetCell.period_index + i,
  }))

  const movedBlockB = slotB
    ? blockB.map((s, i) => ({
        ...s,
        day_of_week:  anchorA.day_of_week,
        period_index: anchorA.period_index + i,
      }))
    : []

  return [...remaining, ...movedBlockA, ...movedBlockB]
}
