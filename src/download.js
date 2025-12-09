// Система скачивания ФОРИК
class DownloadManager {
  constructor() {
    this.downloadUrls = [
      // ZIP архив со всем приложением (рекомендуется - содержит все DLL)
      'https://github.com/danyamiloxin222-cloud/forik/releases/download/1.0/default.zip',
      // Прямое скачивание .exe (если пользователи уже имеют DLL)
      'https://github.com/yourusername/forik/releases/latest/download/ComplaintApp.exe',
      // Локальный путь для разработки
      '../distrib/ComplaintApp-win32-x64/ComplaintApp.exe'
    ];
    
    this.currentUrlIndex = 0;
    this.downloadSize = null;
  }

  // Получение URL для скачивания
  getDownloadUrl() {
    // В админ-панели можно настроить URL
    const customUrl = localStorage.getItem('download_url');
    if (customUrl) {
      return customUrl;
    }
    
    // Используем первый доступный URL
    return this.downloadUrls[this.currentUrlIndex];
  }

  // Инициализация скачивания
  async startDownload(buttonElement) {
    const url = this.getDownloadUrl();
    
    // Показываем прогресс
    this.showDownloadProgress(buttonElement);
    
    try {
      // Проверяем размер файла
      const size = await this.getFileSize(url);
      if (size) {
        this.downloadSize = size;
        this.updateDownloadSize(size);
      }
      
      // Создаем ссылку для скачивания
      const link = document.createElement('a');
      link.href = url;
      // Определяем имя файла в зависимости от типа
      if (url.includes('.zip')) {
        link.download = 'ФОРИК.zip';
      } else {
        link.download = 'ФОРИК.exe';
      }
      link.style.display = 'none';
      
      // Добавляем обработчик для отслеживания
      link.addEventListener('click', () => {
        this.trackDownload();
        // Убираем прогресс через небольшую задержку
        setTimeout(() => {
          this.hideDownloadProgress(buttonElement);
        }, 500);
      });
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Если прямой клик не сработал, открываем в новом окне
      setTimeout(() => {
        if (!this.downloadStarted) {
          window.open(url, '_blank');
          this.trackDownload();
          this.hideDownloadProgress(buttonElement);
        }
      }, 1000);
      
    } catch (error) {
      console.error('Ошибка скачивания:', error);
      this.hideDownloadProgress(buttonElement);
      this.showError('Не удалось начать скачивание. Попробуйте позже или используйте прямую ссылку.');
    }
  }

  // Получение размера файла
  async getFileSize(url) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const size = response.headers.get('content-length');
      if (size) {
        return parseInt(size);
      }
    } catch (error) {
      // Игнорируем ошибки при проверке размера
    }
    return null;
  }

  // Форматирование размера
  formatSize(bytes) {
    if (!bytes) return '~150 MB';
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    return `${mb} MB`;
  }

  // Обновление отображения размера
  updateDownloadSize(size) {
    const sizeElement = document.getElementById('downloadSize');
    if (sizeElement) {
      sizeElement.textContent = this.formatSize(size);
    }
  }

  // Показ прогресса загрузки
  showDownloadProgress(button) {
    if (!button) return;
    
    const originalHTML = button.innerHTML;
    button.dataset.originalHTML = originalHTML;
    button.disabled = true;
    button.classList.add('downloading');
    
    button.innerHTML = `
      <i class="fas fa-spinner fa-spin"></i>
      <span>Скачивание...</span>
    `;
    
    // Создаем прогресс-бар если его нет
    let progressBar = document.getElementById('downloadProgress');
    if (!progressBar) {
      progressBar = document.createElement('div');
      progressBar.id = 'downloadProgress';
      progressBar.className = 'download-progress';
      progressBar.innerHTML = `
        <div class="download-progress-bar">
          <div class="download-progress-fill"></div>
        </div>
        <div class="download-progress-text">Подготовка скачивания...</div>
      `;
      button.parentElement.appendChild(progressBar);
    }
    
    // Анимация прогресса (симуляция, так как реальный прогресс сложно отследить)
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress > 90) progress = 90; // Останавливаем на 90%
      
      const fill = progressBar.querySelector('.download-progress-fill');
      const text = progressBar.querySelector('.download-progress-text');
      
      if (fill) fill.style.width = progress + '%';
      if (text) text.textContent = `Скачивание... ${Math.round(progress)}%`;
      
      if (progress >= 90) {
        clearInterval(interval);
        if (text) text.textContent = 'Почти готово!';
      }
    }, 200);
    
    button.dataset.progressInterval = interval;
  }

  // Скрытие прогресса
  hideDownloadProgress(button) {
    if (!button) return;
    
    button.disabled = false;
    button.classList.remove('downloading');
    
    if (button.dataset.originalHTML) {
      button.innerHTML = button.dataset.originalHTML;
    }
    
    const progressBar = document.getElementById('downloadProgress');
    if (progressBar) {
      setTimeout(() => {
        progressBar.remove();
      }, 1000);
    }
    
    if (button.dataset.progressInterval) {
      clearInterval(button.dataset.progressInterval);
    }
  }

  // Отслеживание скачивания
  trackDownload() {
    this.downloadStarted = true;
    const downloads = parseInt(localStorage.getItem('downloads_count') || '0');
    localStorage.setItem('downloads_count', (downloads + 1).toString());
    localStorage.setItem('last_download', new Date().toISOString());
    
    // Можно отправить аналитику
    console.log('Скачивание начато');
  }

  // Показ ошибки
  showError(message) {
    // Создаем уведомление
    const notification = document.createElement('div');
    notification.className = 'download-notification error';
    notification.innerHTML = `
      <i class="fas fa-exclamation-circle"></i>
      <span>${message}</span>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 5000);
  }
}

// Инициализация
const downloadManager = new DownloadManager();

// Обработчики для кнопок скачивания
document.addEventListener('DOMContentLoaded', () => {
  const downloadButtons = document.querySelectorAll('[data-download="forik"]');
  
  downloadButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      downloadManager.startDownload(button);
    });
  });
  
  // Если кнопки используют обычные ссылки, заменяем их
  const downloadLinks = document.querySelectorAll('a[href*="ComplaintApp.exe"], a[href*="ФОРИК.exe"]');
  downloadLinks.forEach(link => {
    link.setAttribute('data-download', 'forik');
    link.addEventListener('click', (e) => {
      e.preventDefault();
      downloadManager.startDownload(link);
    });
  });
});

