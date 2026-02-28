document.addEventListener("DOMContentLoaded", () => {
  const clockTimeEl = document.getElementById("clock-time");
  const timerEl = document.getElementById("timer");
  const startBtn = document.getElementById("startBtn");
  const durationInput = document.getElementById("durationMinutes");
  const durationButtons = document.querySelectorAll(".duration-btn");
  const navLinks = document.querySelectorAll(".nav-link[data-view]");
  const sectionLabelEl = document.getElementById("section-label");
  const pomodoroView = document.getElementById("pomodoro-view");
  const calendarView = document.getElementById("calendar-view");
  const journalView = document.getElementById("journal-view");
  const calendarDatesEl = document.getElementById("calendar-dates");
  const calendarMonthNameEl = document.getElementById("calendar-month-name");
  const calendarYearEl = document.getElementById("calendar-year");
  const calendarTotalEl = document.getElementById("calendar-total");
  const celebrationBannerEl = document.getElementById("celebration-banner");

  // Live Clock: display current time in EST using Eastern time zone,
  // regardless of the user's local machine time zone.
  function formatClockTime(date) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/New_York",
    });

    const parts = formatter.formatToParts(date);
    const hour = parts.find((p) => p.type === "hour")?.value ?? "";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "";
    const period =
      (parts.find((p) => p.type === "dayPeriod")?.value ?? "").toUpperCase();

    return `${hour}:${minute} ${period}`;
  }

  function updateClock() {
    const now = new Date();
    if (clockTimeEl) {
      clockTimeEl.textContent = formatClockTime(now);
    }
  }

  updateClock();
  setInterval(updateClock, 1000);

  // Pomodoro Timer
  let baseDurationSeconds = 25 * 60;
  let remainingSeconds = baseDurationSeconds;
  let timerIntervalId = null;
  let state = "stopped"; // "stopped" | "running" | "paused"

  function renderTimer(text) {
    if (!timerEl) return;
    timerEl.innerHTML = "";
    const chars = text.split("");
    chars.forEach((ch, index) => {
      const span = document.createElement("span");
      span.textContent = ch;
      span.classList.add("timer-char");
      span.dataset.index = String(index);
      span.dataset.char = ch;
      timerEl.appendChild(span);
    });
  }

  function formatTimer(secondsTotal) {
    const hours = Math.floor(secondsTotal / 3600);
    const minutes = Math.floor((secondsTotal % 3600) / 60);
    const seconds = secondsTotal % 60;

    const hStr = String(hours).padStart(2, "0");
    const mStr = String(minutes).padStart(2, "0");
    const sStr = String(seconds).padStart(2, "0");

    return `${hStr}:${mStr}:${sStr}`;
  }

  function updateTimerDisplay() {
    renderTimer(formatTimer(remainingSeconds));
  }

  function clearTimerInterval() {
    if (timerIntervalId !== null) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
  }

  function resetTimer() {
    clearTimerInterval();
    remainingSeconds = baseDurationSeconds;
    state = "stopped";
    if (startBtn) {
      startBtn.textContent = "START";
    }
    updateTimerDisplay();
  }

  function startCountdown() {
    clearTimerInterval();
    timerIntervalId = setInterval(() => {
      remainingSeconds -= 1;
      if (remainingSeconds <= 0) {
        remainingSeconds = 0;
        updateTimerDisplay();
        clearTimerInterval();
        window.alert("Pomodoro Complete!");
        resetTimer();
        return;
      }
      updateTimerDisplay();
    }, 1000);
  }

  if (timerEl) {
    updateTimerDisplay();
  }

  if (durationInput) {
    durationInput.value = String(Math.floor(baseDurationSeconds / 60));
  }

  function setDurationFromMinutes(nextMinutes) {
    const currentMinutes = Math.floor(baseDurationSeconds / 60);
    const raw = Number.isFinite(nextMinutes) ? nextMinutes : currentMinutes;
    const clamped = Math.max(1, Math.min(180, raw));
    baseDurationSeconds = clamped * 60;
    if (durationInput) {
      durationInput.value = String(clamped);
    }
    if (state === "stopped") {
      remainingSeconds = baseDurationSeconds;
      updateTimerDisplay();
    }
  }

  if (durationInput) {
    durationInput.addEventListener("change", () => {
      if (state !== "stopped") {
        durationInput.value = String(Math.floor(baseDurationSeconds / 60));
        return;
      }
      const parsed = parseInt(durationInput.value, 10);
      if (!Number.isFinite(parsed)) {
        durationInput.value = String(Math.floor(baseDurationSeconds / 60));
        return;
      }
      setDurationFromMinutes(parsed);
    });
  }

  durationButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state !== "stopped") return;
      const delta = btn.dataset.action === "decrease" ? -5 : 5;
      const current =
        durationInput && durationInput.value
          ? parseInt(durationInput.value, 10)
          : Math.floor(baseDurationSeconds / 60);
      const next = current + delta;
      setDurationFromMinutes(next);
    });
  });

  function setActiveNav(targetView) {
    navLinks.forEach((link) => {
      const view = link.dataset.view;
      if (!view) return;
      if (view === targetView) {
        link.classList.add("nav-link-active");
      } else {
        link.classList.remove("nav-link-active");
      }
    });
  }

  function updateSectionLabel(activeView) {
    if (!sectionLabelEl) return;
    if (activeView === "calendar") {
      sectionLabelEl.textContent = "CALENDAR";
    } else if (activeView === "journal") {
      sectionLabelEl.textContent = "JOURNAL";
    } else {
      sectionLabelEl.textContent = "POMODORO";
    }
  }

  function showView(targetView) {
    const isCalendar = targetView === "calendar";
    const isJournal = targetView === "journal";

    if (pomodoroView && calendarView && journalView) {
      pomodoroView.classList.remove("view-active");
      calendarView.classList.remove("view-active");
      journalView.classList.remove("view-active");

      if (isCalendar) {
        calendarView.classList.add("view-active");
        buildCalendar();
      } else if (isJournal) {
        journalView.classList.add("view-active");
        ensureJournalInitialized();
      } else {
        pomodoroView.classList.add("view-active");
      }
    }
    setActiveNav(targetView);
    updateSectionLabel(targetView);
  }

  // --- Calendar: dynamic grid (default to today's month/year) ---
  const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  // Track which dates are checked, keyed as "YYYY-M-D"
  const checkedDates = new Set();
  const scheduleHoursByDate = new Map([
    ["2026-3-2", 8],
    ["2026-3-3", 8],
    ["2026-3-4", 8],
    ["2026-3-5", 8],
    ["2026-3-6", 8],
    ["2026-3-7", 8],
    ["2026-3-9", 8],
    ["2026-3-10", 8],
    ["2026-3-11", 8],
    ["2026-3-12", 8],
    ["2026-3-13", 8],
    ["2026-3-14", 8],
    ["2026-3-16", 8],
    ["2026-3-17", 8],
    ["2026-3-18", 8],
    ["2026-3-19", 8],
    ["2026-3-20", 8],
    ["2026-3-21", 8],
    ["2026-3-23", 8],
    ["2026-3-24", 8],
    ["2026-3-25", 8],
    ["2026-3-26", 8],
    ["2026-3-27", 8],
    ["2026-3-28", 8],
    ["2026-3-30", 8],
    ["2026-3-31", 8],
    ["2026-4-1", 8],
    ["2026-4-2", 8],
    ["2026-4-3", 8],
    ["2026-4-4", 8],
    ["2026-4-6", 8],
    ["2026-4-7", 8],
    ["2026-4-8", 8],
    ["2026-4-9", 8],
    ["2026-4-10", 8],
    ["2026-4-13", 8],
    ["2026-4-14", 8],
    ["2026-4-15", 8],
    ["2026-4-16", 8],
    ["2026-4-17", 8],
    ["2026-4-20", 8],
    ["2026-4-21", 8],
    ["2026-4-22", 8],
    ["2026-4-23", 8],
    ["2026-4-24", 8],
    ["2026-4-27", 8],
    ["2026-4-28", 8],
    ["2026-4-29", 8],
    ["2026-4-30", 8],
    ["2026-5-1", 8],
    ["2026-5-4", 8],
    ["2026-5-5", 8],
    ["2026-5-6", 8],
    ["2026-5-7", 8],
    ["2026-5-8", 8],
    ["2026-5-11", 8],
    ["2026-5-12", 8],
    ["2026-5-13", 8],
    ["2026-5-14", 8],
    ["2026-5-15", 8],
    ["2026-5-18", 8],
  ]);
  let totalScheduledHours = 0;
  const todayForCalendar = new Date();
  const DEFAULT_YEAR = todayForCalendar.getFullYear();
  const DEFAULT_MONTH = todayForCalendar.getMonth() + 1; // 1-based
  let currentYear = DEFAULT_YEAR;
  let currentMonth = DEFAULT_MONTH; // 1-based
  let hasCelebrated486 = false;

  // --- Journal (Myjo-inspired lightweight clone) ---
  const JOURNAL_STORAGE_KEY = "pomodoroJournalEntries";
  const journalListEl = document.getElementById("journal-list");
  const journalSearchEl = document.getElementById("journal-search");
  const journalNewBtn = document.getElementById("journal-new");
  const journalDateEl = document.getElementById("journal-date");
  const journalTitleEl = document.getElementById("journal-title");
  const journalBodyEl = document.getElementById("journal-body");
  const journalSaveBtn = document.getElementById("journal-save");
  const journalCountEl = document.getElementById("journal-count");

  let journalEntries = [];
  let activeJournalId = null;

  function loadJournalEntries() {
    try {
      const raw = window.localStorage.getItem(JOURNAL_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
      return [];
    }
  }

  function saveJournalEntries() {
    try {
      window.localStorage.setItem(
        JOURNAL_STORAGE_KEY,
        JSON.stringify(journalEntries)
      );
    } catch {
      // ignore storage errors
    }
  }

  function formatJournalDateLabel(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  }

  function renderJournalList(filter = "") {
    if (!journalListEl) return;
    const q = filter.trim().toLowerCase();
    const sorted = [...journalEntries].sort((a, b) =>
      (b.date || "").localeCompare(a.date || "")
    );

    journalListEl.innerHTML = "";
    sorted.forEach((entry) => {
      const text = `${entry.title || ""} ${entry.body || ""}`.toLowerCase();
      if (q && !text.includes(q)) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "journal-entry-item";
      btn.dataset.id = String(entry.id);

      if (entry.id === activeJournalId) {
        btn.classList.add("journal-entry-item-active");
      }

      const label = document.createElement("div");
      label.className = "journal-entry-item-label";
      label.textContent = formatJournalDateLabel(entry.date);

      const title = document.createElement("div");
      title.className = "journal-entry-item-title";
      title.textContent = entry.title || "Untitled entry";

      btn.appendChild(label);
      btn.appendChild(title);
      btn.addEventListener("click", () => {
        setActiveJournalEntry(entry.id);
      });

      journalListEl.appendChild(btn);
    });

    if (journalCountEl) {
      journalCountEl.textContent = String(journalEntries.length);
    }
  }

  function setActiveJournalEntry(id) {
    activeJournalId = id;
    const entry =
      journalEntries.find((item) => item.id === id) || {
        id: null,
        date: "",
        title: "",
        body: "",
      };

    if (journalDateEl) {
      journalDateEl.value = entry.date || new Date().toISOString().slice(0, 10);
    }
    if (journalTitleEl) {
      journalTitleEl.value = entry.title || "";
    }
    if (journalBodyEl) {
      journalBodyEl.value = entry.body || "";
    }

    if (journalListEl) {
      journalListEl
        .querySelectorAll(".journal-entry-item")
        .forEach((el) => el.classList.remove("journal-entry-item-active"));
      const activeEl = journalListEl.querySelector(
        `.journal-entry-item[data-id="${id}"]`
      );
      if (activeEl) activeEl.classList.add("journal-entry-item-active");
    }
  }

  function createNewJournalEntry() {
    activeJournalId = null;
    if (journalDateEl) {
      journalDateEl.value = new Date().toISOString().slice(0, 10);
    }
    if (journalTitleEl) {
      journalTitleEl.value = "";
    }
    if (journalBodyEl) {
      journalBodyEl.value = "";
    }
    if (journalListEl) {
      journalListEl
        .querySelectorAll(".journal-entry-item")
        .forEach((el) => el.classList.remove("journal-entry-item-active"));
    }
  }

  function ensureJournalInitialized() {
    if (!journalListEl) return;
    if (journalEntries.length === 0) {
      journalEntries = loadJournalEntries();
    }
    if (journalEntries.length === 0) {
      createNewJournalEntry();
    } else if (activeJournalId == null) {
      activeJournalId = journalEntries[0].id;
    }
    renderJournalList(
      journalSearchEl && journalSearchEl.value ? journalSearchEl.value : ""
    );
    if (activeJournalId != null) {
      setActiveJournalEntry(activeJournalId);
    }
  }

  if (journalSearchEl) {
    journalSearchEl.addEventListener("input", () => {
      renderJournalList(journalSearchEl.value);
    });
  }

  if (journalNewBtn) {
    journalNewBtn.addEventListener("click", () => {
      createNewJournalEntry();
    });
  }

  if (journalSaveBtn) {
    journalSaveBtn.addEventListener("click", () => {
      if (!journalDateEl || !journalTitleEl || !journalBodyEl) return;
      const date = journalDateEl.value || new Date().toISOString().slice(0, 10);
      const title = journalTitleEl.value.trim();
      const body = journalBodyEl.value.trim();

      if (activeJournalId == null) {
        const id = Date.now();
        journalEntries.push({ id, date, title, body });
        activeJournalId = id;
      } else {
        const existing = journalEntries.find(
          (entry) => entry.id === activeJournalId
        );
        if (existing) {
          existing.date = date;
          existing.title = title;
          existing.body = body;
        } else {
          journalEntries.push({ id: activeJournalId, date, title, body });
        }
      }

      saveJournalEntries();
      renderJournalList(
        journalSearchEl && journalSearchEl.value ? journalSearchEl.value : ""
      );
      if (activeJournalId != null) {
        setActiveJournalEntry(activeJournalId);
      }
    });
  }

  function buildCalendar(year, month) {
    if (!calendarDatesEl || !calendarMonthNameEl || !calendarYearEl) return;
    if (typeof year === "number" && typeof month === "number") {
      currentYear = year;
      currentMonth = month;
    }
    const y = currentYear;
    const m = currentMonth - 1;
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const firstWeekday = first.getDay();
    const totalDays = last.getDate();
    const today = new Date();

    calendarMonthNameEl.textContent = MONTH_NAMES[m];
    calendarYearEl.textContent = `(${y})`;

    calendarDatesEl.innerHTML = "";
    const leadingBlanks = firstWeekday;
    for (let i = 0; i < leadingBlanks; i++) {
      const cell = document.createElement("div");
      cell.className = "calendar-date-cell empty";
      cell.setAttribute("aria-hidden", "true");
      calendarDatesEl.appendChild(cell);
    }
    for (let d = 1; d <= totalDays; d++) {
      const cell = document.createElement("div");
      cell.className = "calendar-date-cell";
      cell.setAttribute("role", "gridcell");

      // calendar metadata for checklist behaviour
      cell.dataset.year = String(y);
      cell.dataset.month = String(m + 1); // 1-based month
      cell.dataset.day = String(d);

      const key = `${y}-${m + 1}-${d}`;

      const isSunday = (leadingBlanks + d - 1) % 7 === 0;
      if (isSunday) cell.classList.add("sunday");

      const isToday =
        today.getFullYear() === y &&
        today.getMonth() === m &&
        today.getDate() === d;
      if (isToday) cell.classList.add("today");

      // mark past dates relative to today
      const todayMidnight = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );
      const cellDate = new Date(y, m, d);
      const isPast = cellDate < todayMidnight;
      if (isPast && !isToday) {
        cell.classList.add("past");
      }

      if (checkedDates.has(key)) {
        cell.classList.add("checked");
      }

      cell.textContent = String(d).padStart(2, "0");
      calendarDatesEl.appendChild(cell);
    }
  }

  function shiftMonth(offset) {
    let nextYear = currentYear;
    let nextMonth = currentMonth + offset;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    buildCalendar(nextYear, nextMonth);
  }

  navLinks.forEach((link) => {
    const view = link.dataset.view;
    if (!view) return;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showView(view);
    });
  });

  // Month navigation buttons
  const calendarNavButtons = document.querySelectorAll(".calendar-nav-btn");
  calendarNavButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const dir = btn.dataset.dir === "prev" ? -1 : 1;
      shiftMonth(dir);
    });
  });

  // Toggle checklist state when clicking dates
  if (calendarDatesEl) {
    calendarDatesEl.addEventListener("click", (event) => {
      const target = event.target.closest(".calendar-date-cell");
      if (!target || target.classList.contains("empty")) return;

      const { year, month, day } = target.dataset;
      if (!year || !month || !day) return;

      const key = `${year}-${month}-${day}`;
      const hoursForDate = scheduleHoursByDate.get(key) || 0;

      if (checkedDates.has(key)) {
        checkedDates.delete(key);
        target.classList.remove("checked");
        if (hoursForDate) {
          totalScheduledHours -= hoursForDate;
        }
      } else {
        checkedDates.add(key);
        target.classList.add("checked");
        if (hoursForDate) {
          totalScheduledHours += hoursForDate;
        }
      }

      if (calendarTotalEl) {
        const hrs = Math.max(0, totalScheduledHours);
        calendarTotalEl.textContent = `TOTAL: ${hrs} HOURS`;

        if (hrs >= 486 && !hasCelebrated486) {
          hasCelebrated486 = true;
          calendarTotalEl.classList.add("milestone");
          if (celebrationBannerEl) {
            celebrationBannerEl.hidden = false;
            setTimeout(() => {
              celebrationBannerEl.hidden = true;
            }, 6000);
          }
        }
      }
    });
  }

  if (sectionLabelEl) {
    sectionLabelEl.addEventListener("click", (e) => {
      e.preventDefault();
      const current = sectionLabelEl.textContent.trim().toLowerCase();
      showView(current === "calendar" ? "pomodoro" : "calendar");
    });
  }

  showView("pomodoro");

  if (startBtn) {
    startBtn.addEventListener("click", () => {
      if (state === "stopped") {
        state = "running";
        startBtn.textContent = "PAUSE";
        startCountdown();
        return;
      }

      if (state === "running") {
        state = "paused";
        startBtn.textContent = "RESUME";
        clearTimerInterval();
        return;
      }

      if (state === "paused") {
        state = "running";
        startBtn.textContent = "PAUSE";
        startCountdown();
      }
    });
  }
});

