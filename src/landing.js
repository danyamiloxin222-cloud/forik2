// Конфигурация
const ADMIN_PASSWORD = 'admin123'; // Измените на свой пароль
const STORAGE_KEY = 'complaintapp_updates';
const SETTINGS_KEY = 'complaintapp_settings';
const NOTIFICATION_KEY = 'complaintapp_notification';

// Дефолтные обновления
const defaultUpdates = [
  {
    version: '1.4.0',
    date: '09.12.2025',
    type: 'major',
    items: [
      'Новый экран автоподачи с фильтрами по серверу и типу нарушителя',
      'Быстрый экспорт complaint_data.txt для AHK из истории',
      'Улучшен парсер доказательств и подсветка ошибок ввода'
    ]
  },
  {
    version: '1.3.2',
    date: '25.11.2025',
    type: 'minor',
    items: [
      'Оптимизация OCR: быстрее распознаёт никнеймы',
      'Проверка токена Telegram перед сохранением настроек',
      'Исправлен баг с пустыми шаблонами при автоподаче'
    ]
  },
  {
    version: '1.3.0',
    date: '10.11.2025',
    type: 'major',
    items: [
      'Добавлена статистика: графики по типам нарушений и серверам',
      'Поддержка нескольких шаблонов BB-кода и правил выбора',
      'Режим экономии ресурсов для слабых ПК'
    ]
  }
];

// Дефолтные настройки
const defaultSettings = {
  currentVersion: 'v1.4.0',
  downloadSize: '~150 MB',
  downloadUrl: ''
};

// Текущий индекс редактируемого обновления
let editingIndex = null;
let deletingIndex = null;

// Загрузка данных с сервера
let serverData = null;
let dataLoaded = false;

async function loadServerData() {
  if (dataLoaded && serverData) {
    console.log('Используем кэшированные данные сервера');
    return serverData;
  }
  
  // Пробуем загрузить данные с разных путей
  const apiUrls = [
    './api/data.json',  // Относительный путь (для локального открытия)
    '/api/data.json',   // Абсолютный путь (для сервера)
    'api/data.json'     // Альтернативный относительный путь
  ];
  
  for (const apiUrl of apiUrls) {
    const urlWithCache = apiUrl + '?t=' + Date.now();
    console.log('Попытка загрузки данных с:', urlWithCache);
    
    try {
      const response = await fetch(urlWithCache, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (response.ok) {
        const jsonData = await response.json();
        console.log('Данные успешно загружены с:', urlWithCache, {
          updatesCount: jsonData.updates?.length || 0,
          hasSettings: !!jsonData.settings,
          hasNotification: !!jsonData.notification
        });
        
        serverData = jsonData;
        dataLoaded = true;
        return serverData;
      } else {
        console.warn(`Путь ${urlWithCache} вернул ошибку: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.warn(`Ошибка при загрузке с ${urlWithCache}:`, error.message);
      // Продолжаем пробовать другие пути
    }
  }
  
  // Fallback на локальные данные (из localStorage или дефолтные)
  console.log('Используем fallback: локальные данные или дефолтные');
  const localUpdates = localStorage.getItem(STORAGE_KEY);
  const localSettings = localStorage.getItem(SETTINGS_KEY);
  const localNotification = localStorage.getItem(NOTIFICATION_KEY);
  
  const fallbackData = {
    updates: localUpdates ? JSON.parse(localUpdates) : defaultUpdates,
    settings: localSettings ? JSON.parse(localSettings) : defaultSettings,
    notification: localNotification ? JSON.parse(localNotification) : null
  };
  
  console.log('Fallback данные загружены:', {
    updatesCount: fallbackData.updates?.length || 0,
    hasSettings: !!fallbackData.settings,
    hasNotification: !!fallbackData.notification
  });
  
  return fallbackData;
}

// Загрузка данных (с сервера или локально)
async function loadUpdates() {
  try {
    const data = await loadServerData();
    if (data && data.updates && Array.isArray(data.updates) && data.updates.length > 0) {
      return data.updates;
    }
  } catch (error) {
    console.warn('Ошибка загрузки обновлений:', error);
  }
  // Всегда возвращаем дефолтные данные, если ничего не загрузилось
  return defaultUpdates;
}

function saveUpdates(updates) {
  // Сохраняем в localStorage для админа
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updates));
  // Обновляем серверные данные в памяти
  if (serverData) {
    serverData.updates = updates;
  }
}

function loadSettings() {
  // Сначала пытаемся загрузить с сервера (синхронно из кэша)
  if (serverData && serverData.settings) {
    return serverData.settings;
  }
  // Fallback на localStorage или дефолт
  const stored = localStorage.getItem(SETTINGS_KEY);
  return stored ? JSON.parse(stored) : defaultSettings;
}

function saveSettings(settings) {
  // Сохраняем в localStorage для админа
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  // Обновляем серверные данные в памяти
  if (serverData) {
    serverData.settings = settings;
  }
}

// Проверка авторизации
function isAdmin() {
  return sessionStorage.getItem('admin_auth') === 'true';
}

function setAdminAuth(value) {
  sessionStorage.setItem('admin_auth', value ? 'true' : 'false');
}

// Рендеринг обновлений
async function renderUpdates() {
  try {
    const updates = await loadUpdates();
    const list = document.getElementById('updatesList');
    if (!list) {
      console.warn('Элемент updatesList не найден');
      return;
    }
    
    list.innerHTML = '';

    if (!updates || updates.length === 0) {
      list.innerHTML = '<div class="timeline-item"><p class="muted">Обновлений пока нет</p></div>';
      return;
    }

    updates.forEach((update, index) => {
    const node = document.createElement('div');
    const isLatest = index === 0;
    node.className = `timeline-item ${isLatest ? 'timeline-item-latest' : ''}`;
    node.innerHTML = `
      <div class="timeline-head">
        <div class="timeline-title">
          <span class="tag">${update.date}</span>
          <span>${update.version}</span>
          ${isLatest ? '<span class="latest-badge">Новое</span>' : ''}
        </div>
        <span class="badge ${update.type === 'major' ? '' : 'badge-ghost'}">
          ${update.type === 'major' ? 'Глобальное' : 'Промежуточное'}
        </span>
      </div>
      <div class="changelog">
        ${update.items.map(item => `<div>• ${item}</div>`).join('')}
      </div>
    `;
    list.appendChild(node);
  });

  const latest = updates[0]?.version;
  if (latest) {
    const currentVersion = document.getElementById('currentVersion');
    const latestTag = document.getElementById('latestTag');
    if (currentVersion) currentVersion.textContent = latest;
    if (latestTag) latestTag.textContent = latest;
    }
  } catch (error) {
    console.error('Ошибка рендеринга обновлений:', error);
    const list = document.getElementById('updatesList');
    if (list) {
      list.innerHTML = '<div class="timeline-item"><p class="muted">Ошибка загрузки обновлений</p></div>';
    }
  }
}

// Рендеринг админ-панели обновлений
async function renderAdminUpdates() {
  const updates = await loadUpdates();
  const list = document.getElementById('updatesAdminList');
  if (!list) return;
  
  list.innerHTML = '';

  updates.forEach((update, index) => {
    const node = document.createElement('div');
    node.className = 'admin-update-item';
    node.innerHTML = `
      <div class="admin-update-header">
        <div>
          <strong>${update.version}</strong>
          <span class="admin-update-date">${update.date}</span>
          <span class="badge ${update.type === 'major' ? '' : 'badge-ghost'}">${update.type === 'major' ? 'Глобальное' : 'Промежуточное'}</span>
        </div>
        <div class="admin-update-actions">
          <button class="btn small ghost" data-edit-index="${index}">
            <i class="fas fa-edit"></i> Редактировать
          </button>
          <button class="btn small danger" data-delete-index="${index}">
            <i class="fas fa-trash"></i> Удалить
          </button>
        </div>
      </div>
      <div class="admin-update-items">
        ${update.items.map(item => `<div>• ${item}</div>`).join('')}
      </div>
    `;
    list.appendChild(node);
  });

  // Добавляем обработчики событий
  list.querySelectorAll('[data-edit-index]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const index = parseInt(btn.dataset.editIndex);
      await showEditForm(index);
    });
  });

  list.querySelectorAll('[data-delete-index]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const index = parseInt(btn.dataset.deleteIndex);
      await showDeleteConfirm(index);
    });
  });
}

// Показ формы добавления
async function showAddForm() {
  const addForm = document.getElementById('addUpdateForm');
  const list = document.getElementById('updatesAdminList');
  const addBtn = document.getElementById('addUpdateBtn');
  
  if (addForm) {
    addForm.style.display = 'block';
    if (list) list.style.display = 'none';
    if (addBtn) addBtn.style.display = 'none';
    
    // Очистка полей
    document.getElementById('addVersion').value = '';
    document.getElementById('addDate').value = '';
    document.getElementById('addType').value = 'major';
    document.getElementById('addItems').value = '';
    updateAddPreview();
  }
}

// Скрытие формы добавления
function hideAddForm() {
  const addForm = document.getElementById('addUpdateForm');
  const list = document.getElementById('updatesAdminList');
  const addBtn = document.getElementById('addUpdateBtn');
  
  if (addForm) addForm.style.display = 'none';
  if (list) list.style.display = 'block';
  if (addBtn) addBtn.style.display = 'inline-flex';
}

// Показ формы редактирования
async function showEditForm(index) {
  const updates = await loadUpdates();
  const update = updates[index];
  if (!update) return;
  
  editingIndex = index;
  
  const editForm = document.getElementById('editUpdateForm');
  const list = document.getElementById('updatesAdminList');
  const addForm = document.getElementById('addUpdateForm');
  const addBtn = document.getElementById('addUpdateBtn');
  
  if (editForm) {
    editForm.style.display = 'block';
    if (list) list.style.display = 'none';
    if (addForm) addForm.style.display = 'none';
    if (addBtn) addBtn.style.display = 'none';
    
    // Заполнение полей
    document.getElementById('editVersion').value = update.version;
    document.getElementById('editDate').value = update.date;
    document.getElementById('editType').value = update.type;
    document.getElementById('editItems').value = update.items.join('\n');
    updateEditPreview();
  }
}

// Скрытие формы редактирования
function hideEditForm() {
  const editForm = document.getElementById('editUpdateForm');
  const list = document.getElementById('updatesAdminList');
  const addBtn = document.getElementById('addUpdateBtn');
  
  editingIndex = null;
  if (editForm) editForm.style.display = 'none';
  if (list) list.style.display = 'block';
  if (addBtn) addBtn.style.display = 'inline-flex';
}

// Обновление превью для формы добавления
function updateAddPreview() {
  const version = document.getElementById('addVersion')?.value || '';
  const date = document.getElementById('addDate')?.value || '';
  const type = document.getElementById('addType')?.value || 'major';
  const itemsText = document.getElementById('addItems')?.value || '';
  const items = itemsText.split('\n').filter(item => item.trim());
  
  const preview = document.querySelector('#addPreview .preview-content');
  if (!preview) return;
  
  if (!version || !date || items.length === 0) {
    preview.innerHTML = '<span class="preview-placeholder">Заполните поля для превью</span>';
    return;
  }
  
  preview.innerHTML = `
    <div class="timeline-head">
      <div class="timeline-title">
        <span class="tag">${date}</span>
        <span>${version}</span>
      </div>
      <span class="badge ${type === 'major' ? '' : 'badge-ghost'}">
        ${type === 'major' ? 'Глобальное' : 'Промежуточное'}
      </span>
    </div>
    <div class="changelog">
      ${items.map(item => `<div>• ${item}</div>`).join('')}
    </div>
  `;
}

// Обновление превью для формы редактирования
function updateEditPreview() {
  const version = document.getElementById('editVersion')?.value || '';
  const date = document.getElementById('editDate')?.value || '';
  const type = document.getElementById('editType')?.value || 'major';
  const itemsText = document.getElementById('editItems')?.value || '';
  const items = itemsText.split('\n').filter(item => item.trim());
  
  const preview = document.querySelector('#editPreview .preview-content');
  if (!preview) return;
  
  if (!version || !date || items.length === 0) {
    preview.innerHTML = '<span class="preview-placeholder">Заполните поля для превью</span>';
    return;
  }
  
  preview.innerHTML = `
    <div class="timeline-head">
      <div class="timeline-title">
        <span class="tag">${date}</span>
        <span>${version}</span>
      </div>
      <span class="badge ${type === 'major' ? '' : 'badge-ghost'}">
        ${type === 'major' ? 'Глобальное' : 'Промежуточное'}
      </span>
    </div>
    <div class="changelog">
      ${items.map(item => `<div>• ${item}</div>`).join('')}
    </div>
  `;
}

// Сохранение нового обновления
async function saveAddUpdate() {
  const version = document.getElementById('addVersion')?.value.trim();
  const date = document.getElementById('addDate')?.value.trim();
  const type = document.getElementById('addType')?.value;
  const itemsText = document.getElementById('addItems')?.value.trim();
  
  if (!version || !date || !itemsText) {
    alert('Заполните все обязательные поля!');
    return;
  }
  
  const items = itemsText.split('\n').filter(item => item.trim());
  if (items.length === 0) {
    alert('Добавьте хотя бы одно изменение!');
    return;
  }
  
  const updates = await loadUpdates();
  updates.unshift({
    version,
    date,
    type,
    items
  });
  
      saveUpdates(updates);
      await renderUpdates();
      await renderAdminUpdates();
      await updateAdminStats();
      localStorage.setItem('last_change_time', new Date().toISOString());
      hideAddForm();
      
      // Автоматическая публикация
      if (confirm('Обновление сохранено локально!\n\nОпубликовать изменения, чтобы все пользователи их увидели?')) {
        const published = await publishToJSONBin();
        if (!published) {
          // Если не получилось, предлагаем старый способ
          if (confirm('Автоматическая публикация не удалась. Скачать файл для ручной загрузки в GitHub?')) {
            await exportDataForServer();
          }
        }
      }
}

// Сохранение изменений обновления
async function saveEditUpdate() {
  if (editingIndex === null) return;
  
  const version = document.getElementById('editVersion')?.value.trim();
  const date = document.getElementById('editDate')?.value.trim();
  const type = document.getElementById('editType')?.value;
  const itemsText = document.getElementById('editItems')?.value.trim();
  
  if (!version || !date || !itemsText) {
    alert('Заполните все обязательные поля!');
    return;
  }
  
  const items = itemsText.split('\n').filter(item => item.trim());
  if (items.length === 0) {
    alert('Добавьте хотя бы одно изменение!');
    return;
  }
  
  const updates = await loadUpdates();
  updates[editingIndex] = {
    version,
    date,
    type,
    items
  };
  
      saveUpdates(updates);
      await renderUpdates();
      await renderAdminUpdates();
      await updateAdminStats();
      localStorage.setItem('last_change_time', new Date().toISOString());
      hideEditForm();
      
      // Автоматическая публикация
      if (confirm('Изменения сохранены локально!\n\nОпубликовать изменения, чтобы все пользователи их увидели?')) {
        const published = await publishToJSONBin();
        if (!published) {
          if (confirm('Автоматическая публикация не удалась. Скачать файл для ручной загрузки в GitHub?')) {
            await exportDataForServer();
          }
        }
      }
}

// Показ подтверждения удаления
async function showDeleteConfirm(index) {
  const updates = await loadUpdates();
  const update = updates[index];
  if (!update) return;
  
  deletingIndex = index;
  const modal = document.getElementById('deleteConfirmModal');
  const versionText = document.getElementById('deleteVersionText');
  
  if (modal) modal.style.display = 'flex';
  if (versionText) versionText.textContent = update.version;
}

// Скрытие подтверждения удаления
function hideDeleteConfirm() {
  deletingIndex = null;
  const modal = document.getElementById('deleteConfirmModal');
  if (modal) modal.style.display = 'none';
}

// Удаление обновления
async function deleteUpdate() {
  if (deletingIndex === null) return;
  
  const updates = await loadUpdates();
  updates.splice(deletingIndex, 1);
      saveUpdates(updates);
      await renderUpdates();
      await renderAdminUpdates();
      await updateAdminStats();
      localStorage.setItem('last_change_time', new Date().toISOString());
      hideDeleteConfirm();
      
      // Автоматическая публикация
      if (confirm('Обновление удалено локально!\n\nОпубликовать изменения, чтобы все пользователи их увидели?')) {
        const published = await publishToJSONBin();
        if (!published) {
          if (confirm('Автоматическая публикация не удалась. Скачать файл для ручной загрузки в GitHub?')) {
            await exportDataForServer();
          }
        }
      }
}

// Инициализация админ-панели
async function initAdmin() {
  const adminBtn = document.getElementById('adminBtn');
  const adminModal = document.getElementById('adminModal');
  const adminClose = document.getElementById('adminClose');
  const adminLogin = document.getElementById('adminLogin');
  const adminPanel = document.getElementById('adminPanel');
  const adminLoginBtn = document.getElementById('adminLoginBtn');
  const adminPassword = document.getElementById('adminPassword');
  const addUpdateBtn = document.getElementById('addUpdateBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const currentVersionInput = document.getElementById('currentVersionInput');
  const downloadSizeInput = document.getElementById('downloadSizeInput');
  
  // Показываем кнопку админа
  if (adminBtn) {
    adminBtn.style.display = 'inline-flex';
    adminBtn.addEventListener('click', async () => {
      if (adminModal) adminModal.style.display = 'flex';
      if (isAdmin()) {
        adminLogin.style.display = 'none';
        adminPanel.style.display = 'block';
        await renderAdminUpdates();
        loadAdminSettings();
      } else {
        adminLogin.style.display = 'block';
        adminPanel.style.display = 'none';
      }
    });
  }
  
  // Закрытие модального окна
  if (adminClose) {
    adminClose.addEventListener('click', () => {
      if (adminModal) adminModal.style.display = 'none';
      hideAddForm();
      hideEditForm();
    });
  }
  
  // Клик вне модального окна
  if (adminModal) {
    adminModal.addEventListener('click', (e) => {
      if (e.target === adminModal) {
        adminModal.style.display = 'none';
        hideAddForm();
        hideEditForm();
      }
    });
  }
  
  // Вход
  if (adminLoginBtn) {
    adminLoginBtn.addEventListener('click', async () => {
      const password = adminPassword?.value;
      if (password === ADMIN_PASSWORD) {
        setAdminAuth(true);
        if (adminLogin) adminLogin.style.display = 'none';
        if (adminPanel) adminPanel.style.display = 'block';
        await renderAdminUpdates();
        loadAdminSettings();
        await updateAdminStats();
        if (adminPassword) adminPassword.value = '';
      } else {
        alert('Неверный пароль!');
      }
    });
  }
  
  // Enter для входа
  if (adminPassword) {
    adminPassword.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        adminLoginBtn?.click();
      }
    });
  }
  
  // Добавление обновления
  if (addUpdateBtn) {
    addUpdateBtn.addEventListener('click', async () => {
      await showAddForm();
    });
  }
  
  // Отмена добавления
  const cancelAddBtn = document.getElementById('cancelAddBtn');
  const cancelAddFormBtn = document.getElementById('cancelAddFormBtn');
  if (cancelAddBtn) cancelAddBtn.addEventListener('click', hideAddForm);
  if (cancelAddFormBtn) cancelAddFormBtn.addEventListener('click', hideAddForm);
  
  // Сохранение добавления
  const saveAddBtn = document.getElementById('saveAddBtn');
  if (saveAddBtn) saveAddBtn.addEventListener('click', saveAddUpdate);
  
  // Обновление превью при вводе (добавление)
  const addVersion = document.getElementById('addVersion');
  const addDate = document.getElementById('addDate');
  const addType = document.getElementById('addType');
  const addItems = document.getElementById('addItems');
  
  if (addVersion) addVersion.addEventListener('input', updateAddPreview);
  if (addDate) addDate.addEventListener('input', updateAddPreview);
  if (addType) addType.addEventListener('change', updateAddPreview);
  if (addItems) addItems.addEventListener('input', updateAddPreview);
  
  // Отмена редактирования
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const cancelEditFormBtn = document.getElementById('cancelEditFormBtn');
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', hideEditForm);
  if (cancelEditFormBtn) cancelEditFormBtn.addEventListener('click', hideEditForm);
  
  // Сохранение редактирования
  const saveEditBtn = document.getElementById('saveEditBtn');
  if (saveEditBtn) saveEditBtn.addEventListener('click', saveEditUpdate);
  
  // Обновление превью при вводе (редактирование)
  const editVersion = document.getElementById('editVersion');
  const editDate = document.getElementById('editDate');
  const editType = document.getElementById('editType');
  const editItems = document.getElementById('editItems');
  
  if (editVersion) editVersion.addEventListener('input', updateEditPreview);
  if (editDate) editDate.addEventListener('input', updateEditPreview);
  if (editType) editType.addEventListener('change', updateEditPreview);
  if (editItems) editItems.addEventListener('input', updateEditPreview);
  
  // Удаление
  const deleteCancelBtn = document.getElementById('deleteCancelBtn');
  const deleteCancelConfirmBtn = document.getElementById('deleteCancelConfirmBtn');
  const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');
  
  if (deleteCancelBtn) deleteCancelBtn.addEventListener('click', hideDeleteConfirm);
  if (deleteCancelConfirmBtn) deleteCancelConfirmBtn.addEventListener('click', hideDeleteConfirm);
  if (deleteConfirmBtn) deleteConfirmBtn.addEventListener('click', deleteUpdate);
  
  // Сохранение настроек
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
      const downloadUrlInput = document.getElementById('downloadUrlInput');
      const settings = {
        currentVersion: currentVersionInput?.value || defaultSettings.currentVersion,
        downloadSize: downloadSizeInput?.value || defaultSettings.downloadSize,
        downloadUrl: downloadUrlInput?.value || ''
      };
      saveSettings(settings);
      updateSettingsDisplay();
      
      // Сохраняем URL в localStorage для download.js
      if (settings.downloadUrl) {
        localStorage.setItem('download_url', settings.downloadUrl);
      } else {
        localStorage.removeItem('download_url');
      }
      
      // Автоматическая публикация
      if (confirm('Настройки сохранены локально!\n\nОпубликовать изменения, чтобы все пользователи их увидели?')) {
        const published = await publishToJSONBin();
        if (!published) {
          if (confirm('Автоматическая публикация не удалась. Скачать файл для ручной загрузки в GitHub?')) {
            await exportDataForServer();
          }
        }
      }
    });
  }
  
  // Табы админ-панели
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      const tabName = tab.dataset.tab;
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const content = document.getElementById(`admin${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
      if (content) content.classList.add('active');
      if (tabName === 'settings' || tabName === 'tools') {
        updateAdminStats();
      }
      if (tabName === 'notifications') {
        updateNotificationPreview();
      }
    });
  });
  
  // Публикация данных (автоматически через JSONBin.io)
  const exportDataForServerBtn = document.getElementById('exportDataForServerBtn');
  if (exportDataForServerBtn) {
    exportDataForServerBtn.addEventListener('click', async () => {
      const published = await publishToJSONBin();
      if (!published) {
        // Если не получилось, предлагаем старый способ
        if (confirm('Автоматическая публикация не удалась. Скачать файл для ручной загрузки в GitHub?')) {
          await exportDataForServer();
        }
      }
    });
  }
  
  // Экспорт данных (резервная копия)
  const exportDataBtn = document.getElementById('exportDataBtn');
  if (exportDataBtn) {
    exportDataBtn.addEventListener('click', async () => {
      await exportData();
    });
  }
  
  // Импорт данных
  const importDataInput = document.getElementById('importDataInput');
  if (importDataInput) {
    importDataInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        importData(file);
        e.target.value = '';
      }
    });
  }
  
  // Сброс к дефолту
  const resetToDefaultBtn = document.getElementById('resetToDefaultBtn');
  if (resetToDefaultBtn) {
    resetToDefaultBtn.addEventListener('click', resetToDefault);
  }
  
  // Удаление всех обновлений
  const clearAllUpdatesBtn = document.getElementById('clearAllUpdatesBtn');
  if (clearAllUpdatesBtn) {
    clearAllUpdatesBtn.addEventListener('click', clearAllUpdates);
  }
  
  // Инициализация управления уведомлениями
  await initNotifications();
}

// ==================== УПРАВЛЕНИЕ УВЕДОМЛЕНИЯМИ ====================

// Загрузка уведомления
async function loadNotification() {
  // Сначала пытаемся загрузить с сервера
  const data = await loadServerData();
  if (data.notification && data.notification.enabled && data.notification.text) {
    return data.notification;
  }
  // Fallback на localStorage
  const stored = localStorage.getItem(NOTIFICATION_KEY);
  return stored ? JSON.parse(stored) : null;
}

// Сохранение уведомления
function saveNotification(notification) {
  if (notification && notification.enabled && notification.text) {
    localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(notification));
    // Обновляем серверные данные в памяти
    if (serverData) {
      serverData.notification = notification;
    }
  } else {
    localStorage.removeItem(NOTIFICATION_KEY);
    if (serverData) {
      serverData.notification = null;
    }
  }
}

// Отображение уведомления на сайте
async function displayNotification() {
  const notification = await loadNotification();
  const notificationEl = document.getElementById('siteNotification');
  const messageEl = document.getElementById('notificationMessage');
  
  if (!notificationEl || !messageEl) return;
  
  if (notification && notification.enabled && notification.text) {
    messageEl.textContent = notification.text;
    notificationEl.className = `site-notification site-notification-${notification.color}`;
    notificationEl.style.display = 'flex';
  } else {
    notificationEl.style.display = 'none';
  }
}

// Инициализация управления уведомлениями
async function initNotifications() {
  const saveNotificationBtn = document.getElementById('saveNotificationBtn');
  const clearNotificationBtn = document.getElementById('clearNotificationBtn');
  const notificationEnabled = document.getElementById('notificationEnabled');
  const notificationText = document.getElementById('notificationText');
  const notificationColor = document.getElementById('notificationColor');
  const notificationClose = document.getElementById('notificationClose');
  
  // Загрузка текущего уведомления в форму
  const notification = await loadNotification();
  if (notification) {
    if (notificationEnabled) notificationEnabled.checked = notification.enabled || false;
    if (notificationText) notificationText.value = notification.text || '';
    if (notificationColor) notificationColor.value = notification.color || 'red';
    updateNotificationPreview();
  }
  
  // Обновление превью при изменении
  if (notificationText) {
    notificationText.addEventListener('input', updateNotificationPreview);
  }
  if (notificationColor) {
    notificationColor.addEventListener('change', updateNotificationPreview);
  }
  if (notificationEnabled) {
    notificationEnabled.addEventListener('change', updateNotificationPreview);
  }
  
  // Сохранение уведомления
  if (saveNotificationBtn) {
    saveNotificationBtn.addEventListener('click', async () => {
      const enabled = notificationEnabled?.checked || false;
      const text = notificationText?.value.trim() || '';
      const color = notificationColor?.value || 'red';
      
      if (!text) {
        alert('Введите текст уведомления!');
        return;
      }
      
      const notificationData = {
        enabled: enabled,
        text: text,
        color: color
      };
      
      saveNotification(notificationData);
      await displayNotification();
      updateNotificationPreview();
      
      // Автоматическая публикация
      if (confirm('Уведомление сохранено локально!\n\nОпубликовать изменения, чтобы все пользователи его увидели?')) {
        const published = await publishToJSONBin();
        if (!published) {
          if (confirm('Автоматическая публикация не удалась. Скачать файл для ручной загрузки в GitHub?')) {
            await exportDataForServer();
          }
        }
      }
    });
  }
  
  // Удаление уведомления
  if (clearNotificationBtn) {
    clearNotificationBtn.addEventListener('click', async () => {
      if (confirm('Удалить уведомление?')) {
        localStorage.removeItem(NOTIFICATION_KEY);
        if (notificationEnabled) notificationEnabled.checked = false;
        if (notificationText) notificationText.value = '';
        if (notificationColor) notificationColor.value = 'red';
        await displayNotification();
        updateNotificationPreview();
        alert('Уведомление удалено!');
      }
    });
  }
  
  // Закрытие уведомления пользователем
  if (notificationClose) {
    notificationClose.addEventListener('click', () => {
      const notificationEl = document.getElementById('siteNotification');
      if (notificationEl) {
        notificationEl.style.display = 'none';
      }
    });
  }
  
  // Отображение уведомления при загрузке страницы
  await displayNotification();
}

// Обновление превью уведомления
function updateNotificationPreview() {
  const preview = document.getElementById('notificationPreview');
  const previewBox = preview?.querySelector('.notification-preview-box');
  const notificationEnabled = document.getElementById('notificationEnabled');
  const notificationText = document.getElementById('notificationText');
  const notificationColor = document.getElementById('notificationColor');
  
  if (!preview || !previewBox) return;
  
  const enabled = notificationEnabled?.checked || false;
  const text = notificationText?.value.trim() || '';
  const color = notificationColor?.value || 'red';
  
  if (enabled && text) {
    preview.style.display = 'block';
    previewBox.textContent = text;
    previewBox.className = `notification-preview-box notification-preview-${color}`;
  } else {
    preview.style.display = 'none';
  }
}

// Загрузка настроек в админ-панель
function loadAdminSettings() {
  const settings = loadSettings();
  const currentVersionInput = document.getElementById('currentVersionInput');
  const downloadSizeInput = document.getElementById('downloadSizeInput');
  const downloadUrlInput = document.getElementById('downloadUrlInput');
  if (currentVersionInput) currentVersionInput.value = settings.currentVersion;
  if (downloadSizeInput) downloadSizeInput.value = settings.downloadSize;
  if (downloadUrlInput) downloadUrlInput.value = settings.downloadUrl || '';
}

// Обновление отображения настроек
function updateSettingsDisplay() {
  const settings = loadSettings();
  const currentVersion = document.getElementById('currentVersion');
  const downloadVersion = document.getElementById('downloadVersion');
  const downloadSize = document.getElementById('downloadSize');
  
  if (currentVersion) currentVersion.textContent = settings.currentVersion;
  if (downloadVersion) downloadVersion.textContent = settings.currentVersion;
  if (downloadSize) downloadSize.textContent = settings.downloadSize;
}

// Обновление статистики
async function updateAdminStats() {
  const updates = await loadUpdates();
  const total = updates.length;
  const lastUpdate = updates[0]?.version || '-';
  const globalCount = updates.filter(u => u.type === 'major').length;
  const minorCount = updates.filter(u => u.type === 'minor').length;
  
  const statsTotal = document.getElementById('statsTotalUpdates');
  const statsLast = document.getElementById('statsLastUpdate');
  const statsGlobal = document.getElementById('statsGlobalCount');
  const statsMinor = document.getElementById('statsMinorCount');
  
  if (statsTotal) statsTotal.textContent = total;
  if (statsLast) statsLast.textContent = lastUpdate;
  if (statsGlobal) statsGlobal.textContent = globalCount;
  if (statsMinor) statsMinor.textContent = minorCount;
  
  // Обновление информации
  const lastChange = localStorage.getItem('last_change_time');
  const lastChangeTime = document.getElementById('lastChangeTime');
  if (lastChangeTime) {
    lastChangeTime.textContent = lastChange ? new Date(lastChange).toLocaleString('ru-RU') : '-';
  }
  
  // Размер хранилища
  const storageSize = document.getElementById('storageSize');
  if (storageSize) {
    const size = new Blob([localStorage.getItem(STORAGE_KEY) || '']).size;
    storageSize.textContent = (size / 1024).toFixed(2) + ' KB';
  }
}

// Публикация данных (упрощенная версия - просто экспорт файла)
async function publishToJSONBin() {
  // Просто предлагаем экспорт файла для загрузки в GitHub
  await exportDataForServer();
  return true;
}

// Экспорт данных для публикации на сервере (старый способ через GitHub)
async function exportDataForServer() {
  const updates = await loadUpdates();
  const settings = loadSettings();
  const notification = await loadNotification();
  const data = {
    updates,
    settings,
    notification: notification || null,
    lastUpdate: new Date().toISOString()
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'data.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  alert('Файл data.json создан!\n\n📤 Что делать дальше:\n1. Загрузите файл в папку src/api/ в вашем GitHub репозитории\n2. Netlify автоматически обновится через 1-2 минуты\n3. Все пользователи увидят изменения!\n\n📖 Подробная инструкция: см. файл PUBLISH_DATA.md');
}

// Экспорт данных (резервная копия)
async function exportData() {
  const updates = await loadUpdates();
  const settings = loadSettings();
  const data = {
    updates,
    settings,
    exportDate: new Date().toISOString()
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `forik_backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  alert('Данные успешно экспортированы!');
}

// Импорт данных
function importData(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      
      if (data.updates && Array.isArray(data.updates)) {
        if (confirm(`Импортировать ${data.updates.length} обновлений? Текущие данные будут заменены.`)) {
          saveUpdates(data.updates);
          await renderUpdates();
          await renderAdminUpdates();
          await updateAdminStats();
          localStorage.setItem('last_change_time', new Date().toISOString());
          alert('Данные успешно импортированы! Не забудьте опубликовать изменения на сервере!');
        }
      }
      
      if (data.notification) {
        saveNotification(data.notification);
        await displayNotification();
      }
      
      if (data.settings) {
        saveSettings(data.settings);
        updateSettingsDisplay();
        loadAdminSettings();
      }
    } catch (error) {
      alert('Ошибка при импорте данных: ' + error.message);
    }
  };
  reader.readAsText(file);
}

// Сброс к дефолту
async function resetToDefault() {
  if (!confirm('Сбросить все обновления к значениям по умолчанию? Это действие нельзя отменить.')) {
    return;
  }
  
  saveUpdates(defaultUpdates);
  await renderUpdates();
  await renderAdminUpdates();
  await updateAdminStats();
  localStorage.setItem('last_change_time', new Date().toISOString());
  alert('Данные сброшены к значениям по умолчанию!');
}

// Удаление всех обновлений
async function clearAllUpdates() {
  if (!confirm('Удалить ВСЕ обновления? Это действие нельзя отменить.')) {
    return;
  }
  
  if (!confirm('Вы уверены? Это удалит все обновления безвозвратно!')) {
    return;
  }
  
  saveUpdates([]);
  await renderUpdates();
  await renderAdminUpdates();
  await updateAdminStats();
  localStorage.setItem('last_change_time', new Date().toISOString());
  alert('Все обновления удалены!');
}

// Плавная прокрутка
function smoothAnchors() {
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const targetId = link.getAttribute('href').substring(1);
      const target = document.getElementById(targetId);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

// Управление темой
function initTheme() {
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  const html = document.documentElement;
  
  // Загружаем сохраненную тему
  const savedTheme = localStorage.getItem('theme') || 'dark';
  html.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme, themeIcon);
  
  // Переключение темы
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = html.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      updateThemeIcon(newTheme, themeIcon);
    });
  }
}

function updateThemeIcon(theme, icon) {
  if (!icon) return;
  if (theme === 'light') {
    icon.className = 'fas fa-sun';
  } else {
    icon.className = 'fas fa-moon';
  }
}

// Анимации при скролле
function initScrollAnimations() {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        // Можно отключить наблюдение после появления
        // observer.unobserve(entry.target);
      }
    });
  }, observerOptions);
  
  // Наблюдаем за всеми элементами с классом scroll-fade-in
  document.querySelectorAll('.scroll-fade-in').forEach((el, index) => {
    // Добавляем задержку для разных элементов
    if (index > 0) {
      el.classList.add(`scroll-fade-in-delay-${Math.min(index, 3)}`);
    }
    observer.observe(el);
  });
}

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Инициализация начата');
  try {
    // Загружаем данные с сервера
    console.log('Загрузка данных...');
    await loadServerData();
    console.log('Данные загружены, рендеринг обновлений...');
    await renderUpdates();
    console.log('Обновления отрендерены');
    updateSettingsDisplay();
    smoothAnchors();
    await initAdmin();
    initTheme();
    initScrollAnimations();
    console.log('Инициализация завершена');
  } catch (error) {
    console.error('Ошибка инициализации:', error);
    // Пытаемся загрузить хотя бы дефолтные данные
    try {
      console.log('Попытка загрузки дефолтных данных...');
      // Принудительно сбрасываем кэш
      dataLoaded = false;
      serverData = null;
      await renderUpdates();
      updateSettingsDisplay();
      console.log('Дефолтные данные загружены');
    } catch (e) {
      console.error('Критическая ошибка:', e);
      // Последняя попытка - напрямую рендерим дефолтные данные
      const list = document.getElementById('updatesList');
      if (list) {
        list.innerHTML = defaultUpdates.map((update, index) => {
          const isLatest = index === 0;
          return `
            <div class="timeline-item ${isLatest ? 'timeline-item-latest' : ''}">
              <div class="timeline-head">
                <div class="timeline-title">
                  <span class="tag">${update.date}</span>
                  <span>${update.version}</span>
                  ${isLatest ? '<span class="latest-badge">Новое</span>' : ''}
                </div>
                <span class="badge ${update.type === 'major' ? '' : 'badge-ghost'}">
                  ${update.type === 'major' ? 'Глобальное' : 'Промежуточное'}
                </span>
              </div>
              <div class="changelog">
                ${update.items.map(item => `<div>• ${item}</div>`).join('')}
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }
});
