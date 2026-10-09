const STORAGE_KEY = "daily-task-book.tasks.v2";
const LEGACY_STORAGE_KEY = "today-list.tasks.v1";
const USER_STORAGE_PREFIX = "daily-task-book.user-tasks.v1";
const MIGRATION_PREFIX = "daily-task-book.cloud-migrated.v1";
const FIREBASE_VERSION = "11.0.2";
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD7hMNZDDuYX4LbttGUXT3plQd4zLAH-j0",
  authDomain: "daily-tasks-a7507.firebaseapp.com",
  projectId: "daily-tasks-a7507",
  storageBucket: "daily-tasks-a7507.firebasestorage.app",
  messagingSenderId: "759659987585",
  appId: "1:759659987585:web:47da25ef5eb6a3ed404380",
};

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
  loginButton: document.querySelector("#loginButton"),
  userAccount: document.querySelector("#userAccount"),
  userAvatar: document.querySelector("#userAvatar"),
  userName: document.querySelector("#userName"),
  logoutButton: document.querySelector("#logoutButton"),
  syncStatus: document.querySelector("#syncStatus"),
  clearCompleted: document.querySelector("#clearCompleted"),
  filters: [...document.querySelectorAll(".filter")],
};

const todayKey = dateToKey(new Date());
let selectedDateKey = todayKey;
let viewedMonth = startOfMonth(new Date());
let currentUser = null;
let cloud = null;
let unsubscribeTasks = null;
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

function normalizeTask(task) {
  if (!task || typeof task !== "object") return null;

  return {
    id: String(task.id || makeId()),
    title: String(task.title || task.text || "未命名任务"),
    details: String(task.details || ""),
    date: /^\d{4}-\d{2}-\d{2}$/.test(task.date) ? task.date : todayKey,
    completed: Boolean(task.completed),
    createdAt: typeof task.createdAt === "string" ? task.createdAt : new Date().toISOString(),
    ...(typeof task.updatedAt === "string" ? { updatedAt: task.updatedAt } : {}),
  };
}

function readTasks(storageKey) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved)) {
      return saved.map(normalizeTask).filter(Boolean);
    }
  } catch {
    // A damaged browser cache should not stop the app from opening.
  }
  return [];
}

function loadTasks() {
  const savedTasks = readTasks(STORAGE_KEY);
  if (savedTasks.length || localStorage.getItem(STORAGE_KEY) !== null) return savedTasks;

  try {
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
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return migratedTasks;
  } catch {
    return [];
  }
}

function userStorageKey(userId) {
  return `${USER_STORAGE_PREFIX}.${userId}`;
}

function migrationKey(userId) {
  return `${MIGRATION_PREFIX}.${userId}`;
}

function saveTasks() {
  const storageKey = currentUser ? userStorageKey(currentUser.uid) : STORAGE_KEY;
  localStorage.setItem(storageKey, JSON.stringify(tasks));
}

function setSyncStatus(message, state = "") {
  elements.syncStatus.textContent = message;
  if (state) elements.syncStatus.dataset.state = state;
  else delete elements.syncStatus.dataset.state;
}

function cloudTask(task) {
  return {
    id: task.id,
    title: task.title,
    details: task.details,
    date: task.date,
    completed: task.completed,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt || task.createdAt,
  };
}

async function persistTask(task) {
  if (!cloud || !currentUser) return;
  const userId = currentUser.uid;
  setSyncStatus("正在同步…");

  try {
    const taskRef = cloud.doc(cloud.db, "users", userId, "tasks", task.id);
    await cloud.setDoc(taskRef, cloudTask(task));
    if (currentUser?.uid === userId) setSyncStatus("已同步到 Google 账号", "synced");
  } catch (error) {
    console.error("同步任务失败", error);
    if (currentUser?.uid === userId) setSyncStatus("同步失败，修改已保存在本机", "error");
  }
}

async function removeCloudTasks(taskIds) {
  if (!cloud || !currentUser || !taskIds.length) return;
  const userId = currentUser.uid;
  setSyncStatus("正在同步…");

  try {
    await Promise.all(taskIds.map((taskId) => {
      const taskRef = cloud.doc(cloud.db, "users", userId, "tasks", taskId);
      return cloud.deleteDoc(taskRef);
    }));
    if (currentUser?.uid === userId) setSyncStatus("已同步到 Google 账号", "synced");
  } catch (error) {
    console.error("删除云端任务失败", error);
    if (currentUser?.uid === userId) setSyncStatus("同步失败，修改已保存在本机", "error");
  }
}

function showSignedOut() {
  elements.loginButton.hidden = false;
  elements.userAccount.hidden = true;
  elements.userName.textContent = "";
  elements.userAvatar.hidden = true;
  elements.userAvatar.removeAttribute("src");
}

function showSignedIn(user) {
  elements.loginButton.hidden = true;
  elements.userAccount.hidden = false;
  elements.userName.textContent = user.displayName || user.email || "已登录";
  elements.userName.title = user.email || user.displayName || "";
  if (user.photoURL) {
    elements.userAvatar.src = user.photoURL;
    elements.userAvatar.hidden = false;
  } else {
    elements.userAvatar.hidden = true;
    elements.userAvatar.removeAttribute("src");
  }
}

async function migrateLocalTasks(userId, localTasks) {
  if (localStorage.getItem(migrationKey(userId)) && !localTasks.length) return;

  setSyncStatus(localTasks.length ? "正在把本机任务迁移到账号…" : "正在准备账号同步…");
  const tasksRef = cloud.collection(cloud.db, "users", userId, "tasks");
  const cloudSnapshot = await cloud.getDocs(tasksRef);
  const existingIds = new Set(cloudSnapshot.docs.map((snapshot) => snapshot.id));
  const tasksToUpload = localTasks.filter((task) => !existingIds.has(task.id));

  for (let index = 0; index < tasksToUpload.length; index += 400) {
    const batch = cloud.writeBatch(cloud.db);
    tasksToUpload.slice(index, index + 400).forEach((task) => {
      batch.set(cloud.doc(tasksRef, task.id), cloudTask(task));
    });
    await batch.commit();
  }

  localStorage.setItem(migrationKey(userId), new Date().toISOString());
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

function subscribeToAccountTasks(userId) {
  if (unsubscribeTasks) unsubscribeTasks();
  const tasksRef = cloud.collection(cloud.db, "users", userId, "tasks");

  unsubscribeTasks = cloud.onSnapshot(
    tasksRef,
    (snapshot) => {
      if (currentUser?.uid !== userId) return;
      tasks = snapshot.docs
        .map((taskSnapshot) => normalizeTask({ ...taskSnapshot.data(), id: taskSnapshot.id }))
        .filter(Boolean)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      saveTasks();
      render();
      setSyncStatus("已同步到 Google 账号", "synced");
    },
    (error) => {
      console.error("读取云端任务失败", error);
      if (currentUser?.uid === userId) {
        setSyncStatus("暂时无法读取云端，显示本机备份", "error");
      }
    },
  );
}

async function handleAuthState(user) {
  if (unsubscribeTasks) {
    unsubscribeTasks();
    unsubscribeTasks = null;
  }

  if (!user) {
    currentUser = null;
    showSignedOut();
    tasks = loadTasks();
    render();
    setSyncStatus("未登录，仅保存在此浏览器");
    return;
  }

  const localTasks = readTasks(STORAGE_KEY);
  currentUser = user;
  showSignedIn(user);
  tasks = readTasks(userStorageKey(user.uid));
  render();

  try {
    await migrateLocalTasks(user.uid, localTasks);
    if (currentUser?.uid === user.uid) subscribeToAccountTasks(user.uid);
  } catch (error) {
    console.error("准备账号同步失败", error);
    if (currentUser?.uid === user.uid) {
      tasks = localTasks.length ? localTasks : tasks;
      saveTasks();
      render();
      setSyncStatus("连接失败，任务已保存在本机", "error");
    }
  }
}

async function initializeCloudSync() {
  try {
    const baseUrl = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const [appSdk, authSdk, firestoreSdk] = await Promise.all([
      import(`${baseUrl}/firebase-app.js`),
      import(`${baseUrl}/firebase-auth.js`),
      import(`${baseUrl}/firebase-firestore.js`),
    ]);
    const app = appSdk.initializeApp(FIREBASE_CONFIG);
    const auth = authSdk.getAuth(app);

    try {
      await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
    } catch (error) {
      console.warn("无法保存登录状态", error);
    }

    cloud = {
      auth,
      db: firestoreSdk.getFirestore(app),
      GoogleAuthProvider: authSdk.GoogleAuthProvider,
      signInWithPopup: authSdk.signInWithPopup,
      signOut: authSdk.signOut,
      collection: firestoreSdk.collection,
      doc: firestoreSdk.doc,
      setDoc: firestoreSdk.setDoc,
      deleteDoc: firestoreSdk.deleteDoc,
      getDocs: firestoreSdk.getDocs,
      onSnapshot: firestoreSdk.onSnapshot,
      writeBatch: firestoreSdk.writeBatch,
    };
    elements.loginButton.disabled = false;
    authSdk.onAuthStateChanged(auth, (user) => {
      handleAuthState(user).catch((error) => {
        console.error("处理登录状态失败", error);
        setSyncStatus("账号同步初始化失败，任务仍保存在本机", "error");
      });
    });
  } catch (error) {
    console.error("加载 Firebase 失败", error);
    elements.loginButton.disabled = false;
    setSyncStatus("同步服务未连接，任务仅保存在本机", "error");
  }
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
  const updatedAt = new Date().toISOString();
  tasks = tasks.map((task) =>
    task.id === id ? { ...task, completed: !task.completed, updatedAt } : task,
  );
  saveTasks();
  render();
  const updatedTask = tasks.find((task) => task.id === id);
  if (updatedTask) void persistTask(updatedTask);
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
  void removeCloudTasks([id]);
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = elements.titleInput.value.trim();
  const details = elements.detailsInput.value.trim();
  if (!title) return;

  let savedTask;
  if (editingTaskId) {
    tasks = tasks.map((task) =>
      task.id === editingTaskId
        ? (savedTask = { ...task, title, details, updatedAt: new Date().toISOString() })
        : task,
    );
  } else {
    savedTask = {
      id: makeId(),
      title,
      details,
      date: selectedDateKey,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    tasks.unshift(savedTask);
  }

  saveTasks();
  closeForm();
  render();
  if (savedTask) void persistTask(savedTask);
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
  const taskIds = tasks
    .filter((task) => task.date === selectedDateKey && task.completed)
    .map((task) => task.id);
  tasks = tasks.filter((task) => task.date !== selectedDateKey || !task.completed);
  saveTasks();
  render();
  void removeCloudTasks(taskIds);
});

elements.previousMonth.addEventListener("click", () => changeMonth(-1));
elements.nextMonth.addEventListener("click", () => changeMonth(1));
elements.goToday.addEventListener("click", () => selectDate(todayKey));

elements.loginButton.addEventListener("click", async () => {
  if (!cloud) {
    setSyncStatus("同步服务尚未连接，请刷新页面后重试", "error");
    return;
  }

  const provider = new cloud.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  setSyncStatus("正在打开 Google 登录…");

  try {
    await cloud.signInWithPopup(cloud.auth, provider);
  } catch (error) {
    if (error?.code === "auth/popup-closed-by-user" || error?.code === "auth/cancelled-popup-request") {
      setSyncStatus("已取消登录，任务仍保存在本机");
    } else if (error?.code === "auth/popup-blocked") {
      setSyncStatus("浏览器拦截了登录窗口，请允许弹出窗口后重试", "error");
    } else if (error?.code === "auth/unauthorized-domain") {
      setSyncStatus("当前网址尚未加入 Firebase 授权域名", "error");
    } else {
      console.error("Google 登录失败", error);
      setSyncStatus("Google 登录失败，请稍后重试", "error");
    }
  }
});

elements.logoutButton.addEventListener("click", async () => {
  if (!cloud) return;
  try {
    await cloud.signOut(cloud.auth);
  } catch (error) {
    console.error("退出登录失败", error);
    setSyncStatus("退出失败，请稍后重试", "error");
  }
});

render();
void initializeCloudSync();
