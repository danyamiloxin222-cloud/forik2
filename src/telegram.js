// Telegram Integration Module
class TelegramIntegration {
    constructor() {
        this.config = this.loadConfig();
        this.stats = this.loadStats();
        this.lastSentTime = 0;
        this.minDelay = 1000; // 1 second between messages
        
        window.telegramIntegration = this;
    }

    // Load configuration from localStorage
    loadConfig() {
        const defaultConfig = {
            botToken: '',
            chatId: '',
            telegramTemplate: this.getDefaultTemplate()
        };
        
        const saved = localStorage.getItem('telegramConfig');
        return saved ? { ...defaultConfig, ...JSON.parse(saved) } : defaultConfig;
    }

    // Load statistics from localStorage
    loadStats() {
        const defaultStats = {
            sent: 0,
            success: 0,
            failed: 0,
            lastSent: null
        };
        
        const saved = localStorage.getItem('telegramStats');
        return saved ? { ...defaultStats, ...JSON.parse(saved) } : defaultStats;
    }

    // Save configuration to localStorage
    saveConfig(config) {
        this.config = { ...this.config, ...config };
        localStorage.setItem('telegramConfig', JSON.stringify(this.config));
    }

    // Save statistics to localStorage
    saveStats() {
        localStorage.setItem('telegramStats', JSON.stringify(this.stats));
        this.updateStatsUI();
    }

    // Update statistics UI
    updateStatsUI() {
        const sentEl = document.getElementById('telegramSent');
        const successEl = document.getElementById('telegramSuccess');
        const failedEl = document.getElementById('telegramFailed');
        
        if (sentEl) sentEl.textContent = this.stats.sent;
        if (successEl) successEl.textContent = this.stats.success;
        if (failedEl) failedEl.textContent = this.stats.failed;
    }

    // Validate configuration
    validateConfig() {
        if (!this.config.botToken || !this.config.chatId) {
            throw new Error('Bot Token и Chat ID обязательны для заполнения');
        }

        if (!this.config.botToken.includes(':')) {
            throw new Error('Неверный формат Bot Token. Должен содержать ":"');
        }

        return true;
    }

    // Rate limiting check
    checkRateLimit() {
        const now = Date.now();
        const timeSinceLastSent = now - this.lastSentTime;
        
        if (timeSinceLastSent < this.minDelay) {
            const waitTime = this.minDelay - timeSinceLastSent;
            return new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        return Promise.resolve();
    }

    // Format message using template
    formatMessage(data) {
        let message = this.config.telegramTemplate;
        
        // Replace escaped newlines with actual newlines
        message = message.replace(/\\n/g, '\n');
        
        // Replace placeholders
        const replacements = {
            '{yourNickname}': data.yourNickname || '',
            '{violatorNickname}': data.violatorNickname || '',
            '{violation}': data.violation || '',
            '{violationDate}': data.violationDate || '',
            '{affiliationName}': data.affiliationName || '',
            '{evidence}': data.evidence || ''
        };
        
        Object.entries(replacements).forEach(([placeholder, value]) => {
            message = message.replace(new RegExp(placeholder, 'g'), value);
        });
        
        return message;
    }

    // Send message to Telegram
    async sendMessage(message, retries = 3) {
        try {
            this.validateConfig();
            
            // Rate limiting
            await this.checkRateLimit();
            this.lastSentTime = Date.now();
            
            // Prepare API request
            const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
            // Check if message contains BB-code tags (for history export)
            const isBBCode = /\[(B|I|U|SIZE|FONT|COLOR|URL|IMG|CENTER|RIGHT|LIST|INDENT)\]/i.test(message);
            const payload = {
                chat_id: this.config.chatId,
                text: message,
                parse_mode: isBBCode ? undefined : 'HTML', // Don't parse BB-codes as HTML
                disable_web_page_preview: true
            };
            
            // Update stats
            this.stats.sent++;
            this.saveStats();
            
            // Send request
            const response = await this.makeRequest(url, payload);
            
            if (response.ok) {
                this.stats.success++;
                this.stats.lastSent = new Date().toISOString();
                this.saveStats();
                
                return await response.json();
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
        } catch (error) {
            this.stats.failed++;
            this.saveStats();
            
            // Retry logic
            if (retries > 0 && this.shouldRetry(error)) {
                console.log(`Telegram send failed, retrying... (${retries} attempts left)`);
                await this.delay(2000); // Wait 2 seconds before retry
                return this.sendMessage(message, retries - 1);
            }
            
            // Log error details
            console.error('Telegram Integration Error:', error);
            throw error;
        }
    }

    // Make HTTP request with timeout
    async makeRequest(url, payload, timeout = 10000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            return response;
            
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error('Превышено время ожидания ответа от Telegram API');
            }
            
            throw error;
        }
    }

    // Determine if error is retryable
    shouldRetry(error) {
        // Retry on network errors or temporary server errors
        if (error.message.includes('Failed to fetch') || 
            error.message.includes('NetworkError') ||
            error.message.includes('timeout')) {
            return true;
        }
        
        // Retry on specific HTTP status codes
        if (error.message.includes('HTTP 429') || // Rate limited
            error.message.includes('HTTP 502') || // Bad Gateway
            error.message.includes('HTTP 503') || // Service Unavailable
            error.message.includes('HTTP 504')) { // Gateway Timeout
            return true;
        }
        
        return false;
    }

    // Send complaint data to Telegram
    async sendComplaint(complaintData) {
        const message = this.formatMessage(complaintData);
        return this.sendMessage(message);
    }

    // Test connection with simple message
    async testConnection() {
        const testMessage = '🧪 Тест подключения к Telegram Bot API\n\nЕсли вы видите это сообщение, интеграция настроена правильно!';
        return this.sendMessage(testMessage);
    }

    // Get bot information
    async getBotInfo() {
        try {
            this.validateConfig();
            
            const url = `https://api.telegram.org/bot${this.config.botToken}/getMe`;
            const response = await this.makeRequest(url, {}, 5000);
            
            if (response.ok) {
                const data = await response.json();
                return data.result;
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
        } catch (error) {
            console.error('Failed to get bot info:', error);
            throw error;
        }
    }

    // Get chat information
    async getChatInfo() {
        try {
            this.validateConfig();
            
            const url = `https://api.telegram.org/bot${this.config.botToken}/getChat`;
            const payload = { chat_id: this.config.chatId };
            const response = await this.makeRequest(url, payload, 5000);
            
            if (response.ok) {
                const data = await response.json();
                return data.result;
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
        } catch (error) {
            console.error('Failed to get chat info:', error);
            throw error;
        }
    }

    // Utility delay function
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Default message template
    getDefaultTemplate() {
        return `🚨 Новая жалоба\\n\\n👤 Жалобщик: {yourNickname}\\n🎯 Нарушитель: {violatorNickname}\\n⚠️ Нарушение: {violation}\\n📅 Дата: {violationDate}\\n🏢 Организация: {affiliationName}\\n📸 Доказательства: {evidence}`;
    }

    // Clear statistics
    clearStats() {
        this.stats = {
            sent: 0,
            success: 0,
            failed: 0,
            lastSent: null
        };
        this.saveStats();
    }

    // Export configuration for backup
    exportConfig() {
        return {
            config: this.config,
            stats: this.stats
        };
    }

    // Import configuration from backup
    importConfig(data) {
        if (data.config) {
            this.config = { ...this.config, ...data.config };
            localStorage.setItem('telegramConfig', JSON.stringify(this.config));
        }
        
        if (data.stats) {
            this.stats = { ...this.stats, ...data.stats };
            this.saveStats();
        }
    }

    // Get formatted statistics for display
    getFormattedStats() {
        const successRate = this.stats.sent > 0 ? 
            ((this.stats.success / this.stats.sent) * 100).toFixed(1) : 0;
        
        return {
            sent: this.stats.sent,
            success: this.stats.success,
            failed: this.stats.failed,
            successRate: `${successRate}%`,
            lastSent: this.stats.lastSent ? 
                new Date(this.stats.lastSent).toLocaleString('ru-RU') : 'Никогда'
        };
    }

    // Health check for Telegram API
    async healthCheck() {
        const startTime = Date.now();
        
        try {
            const botInfo = await this.getBotInfo();
            const responseTime = Date.now() - startTime;
            
            return {
                status: 'healthy',
                responseTime: `${responseTime}ms`,
                botInfo: {
                    username: botInfo.username,
                    firstName: botInfo.first_name,
                    canJoinGroups: botInfo.can_join_groups,
                    canReadAllGroupMessages: botInfo.can_read_all_group_messages
                }
            };
            
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                responseTime: `${Date.now() - startTime}ms`
            };
        }
    }

    // Enhanced error handling with user-friendly messages
    getErrorMessage(error) {
        const errorMappings = {
            'HTTP 400': 'Неверные параметры запроса. Проверьте Chat ID.',
            'HTTP 401': 'Неверный Bot Token. Проверьте токен бота.',
            'HTTP 403': 'Бот не имеет доступа к чату. Добавьте бота в чат или канал.',
            'HTTP 404': 'Чат не найден. Проверьте Chat ID.',
            'HTTP 429': 'Превышен лимит запросов. Попробуйте позже.',
            'HTTP 502': 'Временная ошибка сервера Telegram. Попробуйте позже.',
            'NetworkError': 'Ошибка сети. Проверьте интернет-соединение.'
        };

        const message = error.message || error.toString();
        
        for (const [key, friendlyMessage] of Object.entries(errorMappings)) {
            if (message.includes(key)) {
                return friendlyMessage;
            }
        }
        
        return `Неизвестная ошибка: ${message}`;
    }

    // Bulk send messages with queue management
    async sendBulkMessages(messages, delay = 1000) {
        const results = [];
        
        for (let i = 0; i < messages.length; i++) {
            try {
                const result = await this.sendMessage(messages[i]);
                results.push({ index: i, status: 'success', result });
                
                // Delay between messages (except for the last one)
                if (i < messages.length - 1) {
                    await this.delay(delay);
                }
                
            } catch (error) {
                results.push({ 
                    index: i, 
                    status: 'error', 
                    error: this.getErrorMessage(error) 
                });
            }
        }
        
        return results;
    }

    // Schedule message sending
    scheduleMessage(message, sendTime) {
        const now = Date.now();
        const delay = sendTime - now;
        
        if (delay <= 0) {
            throw new Error('Время отправки должно быть в будущем');
        }
        
        return new Promise((resolve, reject) => {
            setTimeout(async () => {
                try {
                    const result = await this.sendMessage(message);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            }, delay);
        });
    }
}

// Initialize Telegram integration when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.telegramIntegration = new TelegramIntegration();
    
    // Update UI with current stats
    window.telegramIntegration.updateStatsUI();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TelegramIntegration;
}