const STORAGE_KEY = "today-list.tasks.v1";

const elements = {
  form: document.querySelector("#taskForm"),
  input: document.querySelector("#taskInput"),
  list: document.querySelector("#taskList"),
  template: document.querySelector("#taskTemplate"),
  empty: document.querySelector("#emptyState"),
  count: document.querySelector("#taskCount"),
  today: document.querySelector("#today"),
  progressText: document.querySelector("#progressText"),
  progressPercent: document.querySelector("#progressPercent"),
  progressRing: document.querySelector("#progressRing"),
  clearCompleted: document.querySelector("#clearCompleted"),
  filters: [...document.querySelectorAll(".filter")],
};

let tasks = loadTasks();
let currentFilter = "all";

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function createTask(text) {
  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    text,
    completed: false,
  };
}

function visibleTasks() {
  if (currentFilter === "active") return tasks.filter((task) => !task.completed);
  if (currentFilter === "completed") return tasks.filter((task) => task.completed);
  return tasks;
}

function render() {
  elements.list.replaceChildren();
  const shownTasks = visibleTasks();

  shownTasks.forEach((task) => {
    const node = elements.template.content.cloneNode(true);
    const item = node.querySelector(".task-item");
    const checkbox = node.querySelector("input");
    const text = node.querySelector(".task-text");
    const deleteButton = node.querySelector(".delete-button");

    item.dataset.id = task.id;
    item.classList.toggle("completed", task.completed);
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", `标记“${task.text}”为${task.completed ? "未完成" : "已完成"}`);
    text.textContent = task.text;

    checkbox.addEventListener("change", () => toggleTask(task.id));
    deleteButton.addEventListener("click", () => deleteTask(task.id));
    elements.list.append(node);
  });

  updateSummary(shownTasks.length);
}

function updateSummary(visibleCount) {
  const completed = tasks.filter((task) => task.completed).length;
  const percent = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

  elements.empty.hidden = visibleCount > 0;
  elements.count.textContent = `${visibleCount} 项`;
  elements.clearCompleted.disabled = completed === 0;
  elements.progressPercent.textContent = `${percent}%`;
  elements.progressRing.style.background =
    `conic-gradient(#f6c66f ${percent}%, rgba(255, 255, 255, 0.13) ${percent}%)`;

  if (!tasks.length) {
    elements.progressText.textContent = "还没有任务";
  } else if (completed === tasks.length) {
    elements.progressText.textContent = "今天全部完成";
  } else {
    elements.progressText.textContent = `已完成 ${completed} / ${tasks.length}`;
  }
}

function toggleTask(id) {
  tasks = tasks.map((task) =>
    task.id === id ? { ...task, completed: !task.completed } : task,
  );
  saveTasks();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter((task) => task.id !== id);
  saveTasks();
  render();
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = elements.input.value.trim();
  if (!text) return;

  tasks.unshift(createTask(text));
  elements.input.value = "";
  saveTasks();
  render();
  elements.input.focus();
});

elements.filters.forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    elements.filters.forEach((filter) => {
      const selected = filter === button;
      filter.classList.toggle("active", selected);
      filter.setAttribute("aria-pressed", String(selected));
    });
    render();
  });
});

elements.clearCompleted.addEventListener("click", () => {
  tasks = tasks.filter((task) => !task.completed);
  saveTasks();
  render();
});

elements.today.textContent = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long",
}).format(new Date());

render();
