const STORAGE_KEY = "daily-task-book.tasks.v2";
const LEGACY_STORAGE_KEY = "today-list.tasks.v1";

const elements = {
  calendarGrid: document.querySelector("#calendarGrid"),
  calendarMonth: document.querySelector("#calendarMonth"),
  previousMonth: document.querySelector("#previousMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  goToday: document.querySelector("#goToday"),
  selectedDate: document.querySelector("#selectedDate"),
  dayKicker: document.querySelector("#dayKicker"),
  dateBadge: document.querySelector("#dateBadge"),
  openTaskForm: document.querySelector("#openTaskForm"),
  closeTaskForm: document.querySelector("#closeTaskForm"),
  form: document.querySelector("#taskForm"),
  formHeading: document.querySelector("#formHeading"),
  titleInput: document.querySelector("#taskTitle"),
  detailsInput: document.querySelector("#taskDetails"),
  submitTask: document.querySelector("#submitTask"),
  cancelEdit: document.querySelector("#cancelEdit"),
  list: document.querySelector("#taskList"),
  template: document.querySelector("#taskTemplate"),
  empty: document.querySelector("#emptyState"),
  emptyTitle: document.querySelector("#emptyTitle"),
  emptyText: document.querySelector("#emptyText"),
  count: document.querySelector("#taskCount"),
  progressText: document.querySelector("#progressText"),
  progressPercent: document.querySelector("#progressPercent"),
  progressRing: document.querySelector("#progressRing"),
  clearCompleted: document.querySelector("#clearCompleted"),
  filters: [...document.querySelectorAll(".filter")],
};

const todayKey = dateToKey(new Date());
let selectedDateKey = todayKey;
let viewedMonth = startOfMonth(new Date());
let tasks = loadTasks();
let currentFilter = "all";
let editingTaskId = null;

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateToKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function keyToDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function makeId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) {
      return saved
        .filter((task) => task && typeof task === "object")
        .map((task) => ({
          id: task.id || makeId(),
          title: String(task.title || task.text || "未命名任务"),
          details: String(task.details || ""),
          date: /^\d{4}-\d{2}-\d{2}$/.test(task.date) ? task.date : todayKey,
          completed: Boolean(task.completed),
          createdAt: task.createdAt || new Date().toISOString(),
        }));
    }

    const legacyTasks = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (!Array.isArray(legacyTasks)) return [];

    const migratedTasks = legacyTasks.map((task) => ({
      id: task.id || makeId(),
      title: String(task.text || "未命名任务"),
      details: "",
      date: todayKey,
      completed: Boolean(task.completed),
      createdAt: new Date().toISOString(),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedTasks));
    return migratedTasks;
  } catch {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function tasksForDate(dateKey = selectedDateKey) {
  return tasks.filter((task) => task.date === dateKey);
}

function visibleTasks() {
  const datedTasks = tasksForDate();
  if (currentFilter === "active") return datedTasks.filter((task) => !task.completed);
  if (currentFilter === "completed") return datedTasks.filter((task) => task.completed);
  return datedTasks;
}

function getCalendarStats() {
  return tasks.reduce((stats, task) => {
    const current = stats.get(task.date) || { total: 0, completed: 0 };
    current.total += 1;
    if (task.completed) current.completed += 1;
    stats.set(task.date, current);
    return stats;
  }, new Map());
}

function renderCalendar() {
  elements.calendarGrid.replaceChildren();
  elements.calendarMonth.textContent = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(viewedMonth);

  const firstDay = startOfMonth(viewedMonth);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - mondayOffset);
  const stats = getCalendarStats();

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const dateKey = dateToKey(date);
    const dayStats = stats.get(dateKey);
    const button = document.createElement("button");
    const dayNumber = document.createElement("span");

    button.type = "button";
    button.className = "calendar-day";
    button.dataset.date = dateKey;
    button.classList.toggle("outside-month", date.getMonth() !== viewedMonth.getMonth());
    button.classList.toggle("is-today", dateKey === todayKey);
    button.classList.toggle("selected", dateKey === selectedDateKey);
    button.classList.toggle("has-tasks", Boolean(dayStats));
    button.classList.toggle("all-done", Boolean(dayStats && dayStats.completed === dayStats.total));
    button.setAttribute("aria-pressed", String(dateKey === selectedDateKey));

    const dateLabel = new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(date);
    button.setAttribute(
      "aria-label",
      dayStats ? `${dateLabel}，${dayStats.total}项任务` : `${dateLabel}，没有任务`,
    );

    dayNumber.className = "day-number";
    dayNumber.textContent = date.getDate();
    button.append(dayNumber);

    if (dayStats) {
      const taskMark = document.createElement("span");
      taskMark.className = "task-mark";
      taskMark.textContent = dayStats.total > 9 ? "9+" : String(dayStats.total);
      button.append(taskMark);
    }

    button.addEventListener("click", () => selectDate(dateKey));
    elements.calendarGrid.append(button);
  }
}

function renderDayHeader() {
  const selectedDate = keyToDate(selectedDateKey);
  elements.selectedDate.textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(selectedDate);

  if (selectedDateKey === todayKey) {
    elements.dayKicker.textContent = "今日安排";
    elements.dateBadge.textContent = "今天";
  } else if (selectedDateKey < todayKey) {
    elements.dayKicker.textContent = "回顾记录";
    elements.dateBadge.textContent = "过去";
  } else {
    elements.dayKicker.textContent = "提前计划";
    elements.dateBadge.textContent = "未来";
  }
}

function renderTasks() {
  elements.list.replaceChildren();
  const shownTasks = visibleTasks();

  shownTasks.forEach((task) => {
    const node = elements.template.content.cloneNode(true);
    const item = node.querySelector(".task-item");
    const checkbox = node.querySelector("input");
    const title = node.querySelector(".task-title");
    const details = node.querySelector(".task-details");
    const editButton = node.querySelector(".edit-button");
    const deleteButton = node.querySelector(".delete-button");

    item.dataset.id = task.id;
    item.classList.toggle("completed", task.completed);
    checkbox.checked = task.completed;
    checkbox.setAttribute(
      "aria-label",
      `标记“${task.title}”为${task.completed ? "未完成" : "已完成"}`,
    );
    title.textContent = task.title;
    details.textContent = task.details;
    details.hidden = !task.details;
    editButton.setAttribute("aria-label", `编辑“${task.title}”`);
    deleteButton.setAttribute("aria-label", `删除“${task.title}”`);

    checkbox.addEventListener("change", () => toggleTask(task.id));
    editButton.addEventListener("click", () => beginEdit(task.id));
    deleteButton.addEventListener("click", () => deleteTask(task.id));
    elements.list.append(node);
  });

  updateSummary(shownTasks.length);
}

function updateSummary(visibleCount) {
  const datedTasks = tasksForDate();
  const completed = datedTasks.filter((task) => task.completed).length;
  const percent = datedTasks.length ? Math.round((completed / datedTasks.length) * 100) : 0;

  elements.empty.hidden = visibleCount > 0;
  elements.count.textContent = `${visibleCount} 项`;
  elements.clearCompleted.disabled = completed === 0;
  elements.progressPercent.textContent = `${percent}%`;
  elements.progressRing.style.background =
    `conic-gradient(#f6c66f ${percent}%, rgba(255, 255, 255, 0.13) ${percent}%)`;

  if (!datedTasks.length) {
    elements.progressText.textContent = "还没有任务";
  } else if (completed === datedTasks.length) {
    elements.progressText.textContent = "这一天全部完成";
  } else {
    elements.progressText.textContent = `已完成 ${completed} / ${datedTasks.length}`;
  }

  if (datedTasks.length && !visibleCount) {
    elements.emptyTitle.textContent = "没有符合条件的任务";
    elements.emptyText.textContent = "试试切换上方的筛选条件。";
  } else {
    elements.emptyTitle.textContent = "这一天还没有任务";
    elements.emptyText.textContent = "在上方写下第一件要完成的事。";
  }
}

function render() {
  renderCalendar();
  renderDayHeader();
  renderTasks();
}

function selectDate(dateKey) {
  selectedDateKey = dateKey;
  viewedMonth = startOfMonth(keyToDate(dateKey));
  closeForm();
  render();
}

function changeMonth(offset) {
  const nextMonth = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth() + offset, 1);
  viewedMonth = nextMonth;
  selectedDateKey = dateToKey(nextMonth);
  closeForm();
  render();
}

function toggleTask(id) {
  tasks = tasks.map((task) =>
    task.id === id ? { ...task, completed: !task.completed } : task,
  );
  saveTasks();
  render();
}

function beginEdit(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  openForm();
  editingTaskId = id;
  elements.titleInput.value = task.title;
  elements.detailsInput.value = task.details;
  elements.formHeading.textContent = "编辑任务";
  elements.submitTask.textContent = "保存修改";
  elements.cancelEdit.hidden = false;
  elements.form.classList.add("editing");
  elements.form.scrollIntoView({ behavior: "smooth", block: "center" });
  elements.titleInput.focus({ preventScroll: true });
}

function openForm() {
  elements.form.hidden = false;
  elements.openTaskForm.hidden = true;
  elements.openTaskForm.setAttribute("aria-expanded", "true");
}

function resetForm() {
  editingTaskId = null;
  elements.form.reset();
  elements.formHeading.textContent = "添加任务";
  elements.submitTask.textContent = "添加到这一天";
  elements.cancelEdit.hidden = true;
  elements.form.classList.remove("editing");
}

function closeForm() {
  resetForm();
  elements.form.hidden = true;
  elements.openTaskForm.hidden = false;
  elements.openTaskForm.setAttribute("aria-expanded", "false");
}

function deleteTask(id) {
  tasks = tasks.filter((task) => task.id !== id);
  if (editingTaskId === id) closeForm();
  saveTasks();
  render();
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = elements.titleInput.value.trim();
  const details = elements.detailsInput.value.trim();
  if (!title) return;

  if (editingTaskId) {
    tasks = tasks.map((task) =>
      task.id === editingTaskId
        ? { ...task, title, details, updatedAt: new Date().toISOString() }
        : task,
    );
  } else {
    tasks.unshift({
      id: makeId(),
      title,
      details,
      date: selectedDateKey,
      completed: false,
      createdAt: new Date().toISOString(),
    });
  }

  saveTasks();
  closeForm();
  render();
  elements.openTaskForm.focus();
});

elements.cancelEdit.addEventListener("click", () => {
  closeForm();
  elements.openTaskForm.focus();
});

elements.openTaskForm.addEventListener("click", () => {
  resetForm();
  openForm();
  elements.titleInput.focus();
});

elements.closeTaskForm.addEventListener("click", () => {
  closeForm();
  elements.openTaskForm.focus();
});

elements.filters.forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    elements.filters.forEach((filter) => {
      const selected = filter === button;
      filter.classList.toggle("active", selected);
      filter.setAttribute("aria-pressed", String(selected));
    });
    renderTasks();
  });
});

elements.clearCompleted.addEventListener("click", () => {
  tasks = tasks.filter((task) => task.date !== selectedDateKey || !task.completed);
  saveTasks();
  render();
});

elements.previousMonth.addEventListener("click", () => changeMonth(-1));
elements.nextMonth.addEventListener("click", () => changeMonth(1));
elements.goToday.addEventListener("click", () => selectDate(todayKey));

render();
