# Onboarding — Schedule Selection

**Status:** Locked (LDTKB-034, ka-tic removed LDTKB-055), 19 August 2026 / 24 August 2026
**Sent:** During onboarding, per LDTKB-004
**Timezone:** All times are Thailand time (UTC+7), stated explicitly in step 1 only

---

Two-step flow: period first, then a specific time within that period. Exact text below, implement verbatim.

## Step 1 — period

```
What time works best for your daily lesson? (Thailand time 🇹🇭)
```

**Buttons:**
- `🌅 Morning`
- `☀️ Afternoon`
- `🌙 Evening`

## Step 2 — specific time (shown after step 1 selection)

```
Pick your time:
```

**If Morning selected, buttons:**
- `08:00`
- `09:00`
- `10:00`
- `11:00`

**If Afternoon selected, buttons:**
- `12:00`
- `13:00`
- `14:00`
- `15:00`
- `16:00`
- `17:00`

**If Evening selected, buttons:**
- `18:00`
- `19:00`
- `20:00`
- `21:00`

**On selection:** the chosen time (Thailand time, UTC+7) is stored as the learner's daily lesson delivery time. Assumes one lesson delivery per day (see LDTKB-034 boundary note). No confirmation message after selection is designed yet — flow continues directly to the next onboarding step (notification test).
